"""Database Seeder for 112 Simulator Analytics Demo.

Generates:
- 3-5 Student Groups
- 50+ Cadets (Students) assigned to groups
- 10-20 TicketResults per student across different dates (over the last month)
- Diverse error types: Communication, Card filling, and SLA errors
- Corresponding ExamSessions, IncidentCards, and EvaluationResults for full compatibility
"""

import argparse
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.core.security import hash_password
from backend.models.base import Base
from backend.models.domain_01 import StudentGroup, User, student_group_link
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, IncidentCard, TicketResult

# ─── Error Taxonomy ────────────────────────────────────────────────────────────
ERROR_TYPES = [
    # Communication errors
    {
        "key": "comm_rude_tone",
        "label": "Грубый / некорректный тон",
        "category": "communication",
        "severity": "high",
        "penalty": 20,
    },
    {
        "key": "comm_interruption",
        "label": "Перебивание заявителя",
        "category": "communication",
        "severity": "medium",
        "penalty": 10,
    },
    {
        "key": "comm_clarification_missed",
        "label": "Пропуск обязательного уточнения",
        "category": "communication",
        "severity": "medium",
        "penalty": 15,
    },
    {
        "key": "comm_unprofessional",
        "label": "Нерегламентированная лексика",
        "category": "communication",
        "severity": "low",
        "penalty": 10,
    },
    # Card filling errors
    {
        "key": "card_wrong_address",
        "label": "Ошибка в адресе происшествия",
        "category": "card",
        "severity": "critical",
        "penalty": 25,
    },
    {
        "key": "card_wrong_services",
        "label": "Неверный состав экстренных служб",
        "category": "card",
        "severity": "critical",
        "penalty": 30,
    },
    {
        "key": "card_missing_caller",
        "label": "Отсутствие данных заявителя",
        "category": "card",
        "severity": "medium",
        "penalty": 15,
    },
    {
        "key": "card_incorrect_priority",
        "label": "Неверный приоритет вызова",
        "category": "card",
        "severity": "medium",
        "penalty": 15,
    },
    {
        "key": "card_incomplete_description",
        "label": "Неполное описание происшествия",
        "category": "card",
        "severity": "low",
        "penalty": 10,
    },
    # SLA errors
    {
        "key": "sla_dispatch_delay",
        "label": "Задержка передачи в ДДС (>60 сек)",
        "category": "sla",
        "severity": "high",
        "penalty": 20,
    },
    {
        "key": "sla_call_duration_exceeded",
        "label": "Превышение времени звонка (>120 сек)",
        "category": "sla",
        "severity": "medium",
        "penalty": 15,
    },
    {
        "key": "sla_response_time_breach",
        "label": "Задержка ответа на входящий вызов",
        "category": "sla",
        "severity": "medium",
        "penalty": 15,
    },
]

FIRST_NAMES_M = [
    "Александр", "Дмитрий", "Максим", "Сергей", "Андрей",
    "Алексей", "Артем", "Илья", "Кирилл", "Михаил",
    "Никита", "Матвей", "Роман", "Егор", "Арсений",
    "Иван", "Денис", "Евгений", "Даниил", "Тимофей"
]
LAST_NAMES_M = [
    "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев",
    "Петров", "Соколов", "Михайлов", "Новиков", "Федоров",
    "Морозов", "Волков", "Алексеев", "Лебедев", "Семенов",
    "Егоров", "Павлов", "Козлов", "Степанов", "Николаев"
]
FIRST_NAMES_F = [
    "Анастасия", "Мария", "Анна", "Виктория", "Полина",
    "Екатерина", "Дарья", "Алиса", "София", "Александра",
    "Ксения", "Варвара", "Вероника", "Валерия", "Алена"
]
LAST_NAMES_F = [
    "Иванова", "Смирнова", "Кузнецова", "Попова", "Васильева",
    "Петрова", "Соколова", "Михайлова", "Новикова", "Федорова",
    "Морозова", "Волкова", "Алексеева", "Лебедева", "Семенова"
]

SCENARIO_CONFIGS = [
    {"category": "ДТП", "title": "ДТП с пострадавшими на перекрестке", "services": ["01", "02", "03"]},
    {"category": "Пожар", "title": "Возгорание в многоквартирном доме", "services": ["01", "03"]},
    {"category": "Утечка газа", "title": "Запах газа в подъезде жилого дома", "services": ["04"]},
    {"category": "Медицина", "title": "Потеря сознания у прохожего на остановке", "services": ["03"]},
    {"category": "Происшествия", "title": "Обрыв ЛЭП и угроза возгорания", "services": ["01", "05"]},
]

GROUP_NAMES = [
    ("Группа 101-П", "Отделение пожарно-спасательной службы"),
    ("Группа 102-П", "Отделение оперативной связи 112"),
    ("Группа 201-С", "Центр экстренного реагирования"),
    ("Группа 202-С", "Диспетчерский состав ДДС"),
]


def generate_full_name(index: int) -> str:
    """Generate a realistic Russian full name."""
    if index % 3 == 0:
        fn = FIRST_NAMES_F[index % len(FIRST_NAMES_F)]
        ln = LAST_NAMES_F[index % len(LAST_NAMES_F)]
        return f"{ln} {fn} Сергеевна"
    else:
        fn = FIRST_NAMES_M[index % len(FIRST_NAMES_M)]
        ln = LAST_NAMES_M[index % len(LAST_NAMES_M)]
        return f"{ln} {fn} Алексеевич"


async def seed_analytics_data(
    db: AsyncSession,
    num_students: int = 55,
    min_tickets: int = 10,
    max_tickets: int = 20,
    num_groups: int = 4,
) -> Dict[str, Any]:
    """Seed comprehensive dummy data for analytics dashboards and export demo.

    Guarantees:
    - Exactly num_groups (3-5) StudentGroup objects.
    - Exactly num_students (>= 50) User cadets distributed across groups.
    - Between min_tickets and max_tickets TicketResults per student.
    - Distributed across past 30 days.
    - Multi-category errors (communication, card, SLA).
    """
    rng = random.Random(42)  # Deterministic seed for reproducible tests
    now = datetime.now(timezone.utc)

    # 1. Ensure Scenarios exist
    scenarios: List[ScenarioTicket] = []
    for sc_conf in SCENARIO_CONFIGS:
        sc = ScenarioTicket(
            title=sc_conf["title"],
            category=sc_conf["category"],
            complexity=rng.choice([1, 2, 3]),
            settings={"category": sc_conf["category"], "title": sc_conf["title"]},
            ground_truth={"services": sc_conf["services"], "category": sc_conf["category"]},
        )
        db.add(sc)
        scenarios.append(sc)
    await db.flush()

    # 2. Create Teacher
    teacher_res = await db.execute(select(User).where(User.username == "teacher_demo"))
    teacher = teacher_res.scalar_one_or_none()
    if not teacher:
        teacher = User(
            username="teacher_demo",
            password_hash=hash_password("teacher123"),
            role="TEACHER",
            full_name="Преподаватель Академии 112",
        )
        db.add(teacher)
        await db.flush()

    # 3. Create Groups (3-5 groups)
    groups: List[StudentGroup] = []
    assignments: List[Assignment] = []
    for i in range(min(num_groups, len(GROUP_NAMES))):
        gname, dept = GROUP_NAMES[i]
        group = StudentGroup(
            group_name=gname,
            department=dept,
            teacher_id=teacher.user_id,
            cadet_ids=[],
        )
        db.add(group)
        groups.append(group)
    await db.flush()

    for grp in groups:
        assignment = Assignment(
            session_type="CALL_SIMULATION",
            mode="EXAM",
            group_id=grp.group_id,
            assigned_by=teacher.user_id,
            scenario_id=scenarios[0].scenario_id,
            available_from=now - timedelta(days=35),
            deadline=now + timedelta(days=30),
        )
        db.add(assignment)
        assignments.append(assignment)
    await db.flush()

    # 4. Create Students (50+ cadets)
    hashed_pwd = hash_password("cadet123")
    cadets: List[User] = []
    for i in range(num_students):
        assigned_group = groups[i % len(groups)]
        full_name = generate_full_name(i)
        username = f"cadet_{i + 1:03d}"
        student_code = f"СМ-2026-{(i + 1):03d}"

        cadet = User(
            username=username,
            password_hash=hashed_pwd,
            role="CADET",
            full_name=full_name,
            student_id=student_code,
            group_ids=[assigned_group.group_id],
            is_active=True,
        )
        db.add(cadet)
        cadets.append(cadet)
    await db.flush()

    # Associate cadets with groups (both link table and cadet_ids list)
    for cadet in cadets:
        grp_id = cadet.group_ids[0]
        target_group = next(g for g in groups if g.group_id == grp_id)
        current_list = list(target_group.cadet_ids or [])
        if cadet.user_id not in current_list:
            current_list.append(cadet.user_id)
            target_group.cadet_ids = current_list
        await db.execute(
            student_group_link.insert().values(user_id=cadet.user_id, group_id=grp_id)
        )
    await db.flush()

    # 5. Generate TicketResults and ExamSessions (10-20 per student over last 30 days)
    total_tickets = 0
    total_errors_generated = 0
    sessions_to_add: List[ExamSession] = []
    cards_to_add: List[IncidentCard] = []
    evals_to_add: List[EvaluationResult] = []
    tickets_to_add: List[TicketResult] = []

    # Pre-select distribution of cadet skills: high performers, average, low
    cadet_skill_weights = [rng.uniform(0.65, 0.95) for _ in range(num_students)]

    for cadet_idx, cadet in enumerate(cadets):
        cadet_group_id = cadet.group_ids[0]
        group_assignment = next(a for a in assignments if a.group_id == cadet_group_id)
        skill_factor = cadet_skill_weights[cadet_idx]

        # 10 to 20 tickets per student
        num_sessions = rng.randint(min_tickets, max_tickets)

        # Distribute dates across last 30 days
        # Ensure we cover multiple distinct days
        day_offsets = sorted([rng.randint(0, 29) for _ in range(num_sessions)], reverse=True)

        for s_idx in range(num_sessions):
            day_offset = day_offsets[s_idx]
            hour = rng.randint(8, 20)
            minute = rng.randint(0, 59)
            session_start = now - timedelta(days=day_offset, hours=(24 - hour), minutes=minute)
            session_end = session_start + timedelta(seconds=rng.randint(45, 180))

            chosen_scenario = rng.choice(scenarios)

            # Determine pass/fail based on skill factor
            is_passed = (rng.random() < skill_factor)

            # Generate errors
            session_errors: List[Dict[str, Any]] = []
            if not is_passed:
                # 1 to 4 errors across communication, card, sla
                err_count = rng.randint(1, 4)
                chosen_err_templates = rng.sample(ERROR_TYPES, min(err_count, len(ERROR_TYPES)))
                for err_tpl in chosen_err_templates:
                    session_errors.append({
                        "penalty_type": err_tpl["key"],
                        "error_type": err_tpl["key"],
                        "category": err_tpl["category"],
                        "label": err_tpl["label"],
                        "severity": err_tpl["severity"],
                        "penalty": err_tpl["penalty"],
                    })
            else:
                # Occasionally a minor warning error even if passed
                if rng.random() < 0.25:
                    minor_err = rng.choice([e for e in ERROR_TYPES if e["severity"] == "low"])
                    session_errors.append({
                        "penalty_type": minor_err["key"],
                        "error_type": minor_err["key"],
                        "category": minor_err["category"],
                        "label": minor_err["label"],
                        "severity": minor_err["severity"],
                        "penalty": minor_err["penalty"],
                    })

            errors_count = len(session_errors)
            total_errors_generated += errors_count

            # Calculate score
            if is_passed:
                base_score = rng.randint(85, 100)
                score = max(75, base_score - errors_count * 5)
            else:
                score = max(20, rng.randint(40, 70) - errors_count * 10)

            sla_dispatch_time = rng.randint(20, 50) if is_passed else rng.randint(55, 110)

            # Create ExamSession
            session_obj = ExamSession(
                session_type="CALL_SIMULATION",
                assignment_id=group_assignment.assignment_id,
                cadet_id=cadet.user_id,
                ticket_id=chosen_scenario.scenario_id,
                status="COMPLETED",
                start_time=session_start,
                end_time=session_end,
            )
            sessions_to_add.append(session_obj)

            # Create IncidentCard
            card_obj = IncidentCard(
                session_id=session_obj.session_id,
                scenario_id=chosen_scenario.scenario_id,
                operator_id=cadet.user_id,
                card_origin="runtime",
                filled_data={
                    "category": chosen_scenario.category,
                    "event_category": chosen_scenario.category,
                    "title": chosen_scenario.title,
                },
                status="closed",
                created_at=session_start + timedelta(seconds=sla_dispatch_time),
            )
            cards_to_add.append(card_obj)

            # Create EvaluationResult
            eval_obj = EvaluationResult(
                card_id=card_obj.card_id,
                session_id=session_obj.session_id,
                scores={
                    "final_score": float(score),
                    "total_score": float(score),
                    "score": float(score),
                },
                metrics={
                    "time_to_first_dispatch_sec": sla_dispatch_time,
                    "sla_metrics": {"time_to_first_dispatch_sec": sla_dispatch_time},
                },
                errors_list=[e["penalty_type"] for e in session_errors],
                evaluated_at=session_end,
            )
            evals_to_add.append(eval_obj)

            # Create TicketResult
            ticket_res_obj = TicketResult(
                ticket_id=chosen_scenario.scenario_id,
                session_id=session_obj.session_id,
                is_passed=is_passed,
                score_total=float(score),
                status="passed" if is_passed else "failed",
                errors_count=errors_count,
                error_details=session_errors,
                created_at=session_start,
            )
            tickets_to_add.append(ticket_res_obj)
            total_tickets += 1

    # Batch add
    db.add_all(sessions_to_add)
    db.add_all(cards_to_add)
    db.add_all(evals_to_add)
    db.add_all(tickets_to_add)

    await db.commit()

    return {
        "status": "success",
        "groups_created": len(groups),
        "cadets_created": len(cadets),
        "tickets_created": total_tickets,
        "errors_generated": total_errors_generated,
    }


async def main():
    """CLI runner for seed script."""
    parser = argparse.ArgumentParser(description="Seed 112 Simulator database with analytics dummy data")
    parser.add_argument("--db-url", type=str, default=None, help="Database connection URL")
    parser.add_argument("--num-students", type=int, default=55, help="Number of students to generate")
    parser.add_argument("--min-tickets", type=int, default=10, help="Min tickets per student")
    parser.add_argument("--max-tickets", type=int, default=20, help="Max tickets per student")
    args = parser.parse_args()

    db_url = args.db_url or os.getenv("DATABASE_URL", "sqlite+aiosqlite:///app.db")
    print(f"🌱 Seeding database: {db_url}")

    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    engine = create_async_engine(db_url, connect_args=connect_args, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        result = await seed_analytics_data(
            db=session,
            num_students=args.num_students,
            min_tickets=args.min_tickets,
            max_tickets=args.max_tickets,
        )
        print("✅ Seeding completed successfully:")
        print(f"   Groups: {result['groups_created']}")
        print(f"   Cadets: {result['cadets_created']}")
        print(f"   Ticket Results: {result['tickets_created']}")
        print(f"   Errors: {result['errors_generated']}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
