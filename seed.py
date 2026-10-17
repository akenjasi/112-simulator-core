#!/usr/bin/env python3
"""
Seed script for 112 Simulator V2 local dev.

Creates initial users (ADMIN, TEACHER, CADET) so you can immediately
log in via the frontend without manual setup.

Usage:
    PYTHONPATH=.deps:. python3 seed.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env manually (uvicorn --env-file is not used here)
env_file = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


async def seed():
    # Import after env is set
    from backend.database import engine, AsyncSessionLocal
    from backend.models.base import Base
    from backend.models.domain_01 import User, StudentGroup, ProfileType
    from backend.core.security import hash_password


    # Ensure all tables exist
    import backend.models.domain_01  # noqa
    import backend.models.domain_02  # noqa
    import backend.models.domain_03  # noqa
    import backend.models.domain_04  # noqa
    import backend.models.domain_05  # noqa
    import backend.models.domain_06  # noqa

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tables created / verified")

    async with AsyncSessionLocal() as session:
        from sqlalchemy import select

        # ─── Users ────────────────────────────────────────────────────────────
        users_to_create = [
            {"username": "admin",           "password": "admin123",   "role": "ADMIN",   "full_name": "Администратор"},
            {"username": "teacher",         "password": "teacher123", "role": "TEACHER", "full_name": "Преподаватель"},
            {"username": "petrov@student.ru", "password": "12345",    "role": "CADET",   "full_name": "Петров Александр Владимирович"},
            {"username": "sidorov@student.ru", "password": "12345",   "role": "CADET",   "full_name": "Сидоров Иван Николаевич"},
        ]

        created_users = {}
        for u in users_to_create:
            existing = await session.execute(
                select(User).where(User.username == u["username"])
            )
            if existing.scalar_one_or_none():
                print(f"  ⏭  User '{u['username']}' already exists, skipping")
                continue
            user = User(
                username=u["username"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                full_name=u["full_name"],
            )
            session.add(user)
            await session.flush()
            created_users[u["username"]] = user
            print(f"  ✅ Created user '{u['username']}' ({u['role']})")

        await session.commit()

        # ─── Sequences ────────────────────────────────────────────────────────
        from backend.models.domain_02 import SysSequence
        existing_seq = await session.execute(
            select(SysSequence).where(SysSequence.name == "generated_tickets")
        )
        if not existing_seq.scalar_one_or_none():
            session.add(SysSequence(name="generated_tickets", last_val=0))
            await session.commit()
            print("  ✅ Created sys_sequence 'generated_tickets' (last_val=0)")
        else:
            print("  ⏭  sys_sequence 'generated_tickets' already exists")

        # ─── Groups ───────────────────────────────────────────────────────────
        from sqlalchemy.orm import selectinload

        groups_to_seed = [
            {
                "group_name": "Смена 1",
                "department": "Кафедра оперативной диспетчеризации",
            },
            {
                "group_name": "Смена 2",
                "department": "Кафедра дежурно-диспетчерских служб",
            },
        ]

        teacher = (await session.execute(
            select(User).where(User.username == "teacher")
        )).scalar_one_or_none()

        cadet1 = (await session.execute(
            select(User).where(User.username == "petrov@student.ru")
        )).scalar_one_or_none()
        cadet2 = (await session.execute(
            select(User).where(User.username == "sidorov@student.ru")
        )).scalar_one_or_none()
        cadets = [c for c in [cadet1, cadet2] if c is not None]

        for g_data in groups_to_seed:
            existing_group_res = await session.execute(
                select(StudentGroup)
                .options(selectinload(StudentGroup.students))
                .where(StudentGroup.group_name == g_data["group_name"])
            )
            group = existing_group_res.scalar_one_or_none()
            if not group:
                group = StudentGroup(
                    group_name=g_data["group_name"],
                    department=g_data["department"],
                    teacher_id=teacher.user_id if teacher else None,
                )
                session.add(group)
                print(f"  ✅ Created student group '{g_data['group_name']}'")
            else:
                print(f"  ⏭  Group '{g_data['group_name']}' already exists")


            # Bind cadet1 and cadet2 via Many-to-Many relationship
            for cadet in cadets:
                if cadet not in group.students:
                    group.students.append(cadet)
                if cadet.user_id not in (group.cadet_ids or []):
                    group.cadet_ids = list(group.cadet_ids or []) + [cadet.user_id]
                if group.group_id not in (cadet.group_ids or []):
                    cadet.group_ids = list(cadet.group_ids or []) + [group.group_id]

        await session.commit()


        # ─── Classifier (EKP) ────────────────────────────────────────────────
        await seed_classifier(session)

        # ─── Cadet Training Sessions ─────────────────────────────────────────
        await seed_cadet_sessions(session)


async def seed_cadet_sessions(session):
    """Seed realistic completed training sessions with dialogues and evaluations for cadets."""
    import uuid
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select, func
    from backend.models.domain_01 import User
    from backend.models.domain_03 import ExamSession
    from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult

    # Check petrov@student.ru
    cadet = (await session.execute(
        select(User).where(User.username == "petrov@student.ru")
    )).scalar_one_or_none()

    if not cadet:
        return

    sess_count = (await session.execute(
        select(func.count(ExamSession.session_id)).where(ExamSession.cadet_id == cadet.user_id)
    )).scalar_one()

    if sess_count > 0:
        print(f"  ⏭  Cadet '{cadet.username}' already has {sess_count} sessions, skipping")
        return

    now = datetime.now(timezone.utc)

    # ── Session 1: Traffic accident with injuries ──
    sess1_id = str(uuid.uuid4())
    card1_id = str(uuid.uuid4())
    s1 = ExamSession(
        session_id=sess1_id,
        session_type="CALL_SIMULATION",
        cadet_id=cadet.user_id,
        status="COMPLETED",
        start_time=now - timedelta(hours=2),
        end_time=now - timedelta(hours=1, minutes=48),
        dialogue_log=[
            {"speaker": "Заявитель", "text": "Здравствуйте! Тут сильная авария на перекрестке Ленина и Мира! Столкнулись две машины, из одной идет дым, водитель зажат!"},
            {"speaker": "Оператор", "text": "Оператор 112, здравствуйте. Принято. Есть ли открытый огонь и сколько человек пострадало?"},
            {"speaker": "Заявитель", "text": "Огня вроде нет, но сильный запах бензина! Водитель без сознания, пассажир стонет!"},
            {"speaker": "Оператор", "text": "Службы оповещены. Передаю информацию в МЧС и Скорую помощь. Назовите вашу фамилию и контактный номер."},
            {"speaker": "Заявитель", "text": "Я Васильев Сергей, номер тот же, с которого звоню!"},
            {"speaker": "Оператор", "text": "Оставайтесь на безопасном расстоянии, не подходите к автомобилю из-за риска возгорания топлива. Экстренные службы уже направлены."}
        ]
    )
    session.add(s1)

    c1 = IncidentCard(
        card_id=card1_id,
        session_id=sess1_id,
        operator_id=cadet.user_id,
        card_origin="call",
        filled_data={"address": "ул. Ленина / ул. Мира", "incident_type": "ДТП с зажатием", "injuries": True},
        assigned_services={"01": "notified", "02": "notified", "03": "delayed"},
        status="closed"
    )
    session.add(c1)

    ev1 = EvaluationResult(
        evaluation_id=str(uuid.uuid4()),
        card_id=card1_id,
        session_id=sess1_id,
        scores={"overall": 78, "speed": 70, "protocol": 85},
        errors_list=[
            "Задержка передачи вызова в службу 03 (Скорая помощь) на 38 секунд",
            "Не продублирован вслух контактный номер заявителя"
        ],
        expert_comment="Базовый опрос проведен быстро, но допущена критическая задержка по вызову Скорой помощи."
    )
    session.add(ev1)

    tr1 = TicketResult(
        result_id=str(uuid.uuid4()),
        session_id=sess1_id,
        is_passed=True,
        score_total=78.0,
        status="COMPLETED",
        errors_count=2,
        error_details={"category": "Приоритет вызова 03", "description": "Задержка передачи информации в медицинскую службу при угрозе жизни"}
    )
    session.add(tr1)

    # ── Session 2: Residential building fire ──
    sess2_id = str(uuid.uuid4())
    card2_id = str(uuid.uuid4())
    s2 = ExamSession(
        session_id=sess2_id,
        session_type="CALL_SIMULATION",
        cadet_id=cadet.user_id,
        status="COMPLETED",
        start_time=now - timedelta(days=1),
        end_time=now - timedelta(days=1, minutes=-12),
        dialogue_log=[
            {"speaker": "Заявитель", "text": "Помогите, у нас горит квартира на четвертом этаже по улице Садовой, дом 18!"},
            {"speaker": "Оператор", "text": "Служба 112. Пожарные направлены. Уточните, есть ли люди внутри и какой номер подъезда?"},
            {"speaker": "Заявитель", "text": "Вроде пожилая женщина там живет, дым валит из окон в подъезд! Подъезд второй, код домофона 42!"},
            {"speaker": "Оператор", "text": "Служба 01 выехала. Оповестите соседей по лестничной клетке, не пользуйтесь лифтом, спускайтесь по лестнице."}
        ]
    )
    session.add(s2)

    c2 = IncidentCard(
        card_id=card2_id,
        session_id=sess2_id,
        operator_id=cadet.user_id,
        card_origin="call",
        filled_data={"address": "ул. Садовая, д. 18, кв. 14", "incident_type": "Пожар в МКД", "evacuation": True},
        assigned_services={"01": "dispatched", "03": "dispatched"},
        status="closed"
    )
    session.add(c2)

    ev2 = EvaluationResult(
        evaluation_id=str(uuid.uuid4()),
        card_id=card2_id,
        session_id=sess2_id,
        scores={"overall": 84, "speed": 85, "protocol": 82},
        errors_list=[
            "Не уточнен признак угрозы людям на вышележащих этажах",
            "Задержка фиксации точного номера квартиры"
        ],
        expert_comment="Хорошая коммуникация, даны правильные инструкции заявителю по эвакуации."
    )
    session.add(ev2)

    tr2 = TicketResult(
        result_id=str(uuid.uuid4()),
        session_id=sess2_id,
        is_passed=True,
        score_total=84.0,
        status="COMPLETED",
        errors_count=2,
        error_details={"category": "Сбор ориентиров адреса", "description": "Не зафиксирован этаж и расположение очага возгорания относительно путей эвакуации"}
    )
    session.add(tr2)

    await session.commit()
    print(f"  ✅ Seeded 2 training sessions with dialogue logs and evaluations for '{cadet.username}'")


async def seed_classifier(session):
    """Seed classifier records from data/classifier_ekp.json if table is empty."""
    import json
    from sqlalchemy import select, func
    from backend.models.domain_06 import ClassifierRecord

    count_res = await session.execute(select(func.count(ClassifierRecord.id)))
    count = count_res.scalar_one()
    if count > 0:
        print(f"  ⏭  Classifier records already populated ({count} records), skipping")
        return

    json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "classifier_ekp.json")
    if not os.path.exists(json_path):
        json_path = os.path.join(os.getcwd(), "data", "classifier_ekp.json")

    if not os.path.exists(json_path):
        print(f"  ⚠️  Classifier JSON not found at {json_path}")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    raw_records = data.get("records", [])
    records = [
        ClassifierRecord(
            id=r["id"],
            category=r.get("category", ""),
            group=r.get("group", ""),
            feature1=r.get("feature1"),
            feature2=r.get("feature2"),
            feature3=r.get("feature3"),
            final_type=r.get("final_type", ""),
            base_services=r.get("base_services") or r.get("services") or [],
        )
        for r in raw_records
    ]

    session.add_all(records)
    await session.commit()
    print(f"  ✅ Seeded {len(records)} ClassifierRecords into database")


    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║                Seed complete! Credentials:           ║")
    print("╠══════════════════════════════════════════════════════╣")
    print("║  admin           / admin123    (роль: ADMIN)         ║")
    print("║  teacher         / teacher123  (роль: TEACHER)       ║")
    print("║  ivanov@test.com / 12345       (роль: CADET)         ║")
    print("║  petrov@test.com / 12345       (роль: CADET)         ║")
    print("╚══════════════════════════════════════════════════════╝")


if __name__ == "__main__":
    asyncio.run(seed())
