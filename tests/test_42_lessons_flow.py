import uuid
import pytest
from sqlalchemy import select
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import Lesson, ExamSession


@pytest.mark.asyncio
async def test_lesson_state_transitions(async_client, db_session):
    """
    Тест проверяет полный жизненный цикл урока:
    1. Создание урока -> статус WAITING
    2. Получение деталей -> статус WAITING, список студентов
    3. Запуск урока (/start) -> статус ACTIVE, создание ExamSession курсантам
    4. Сохранение заметок преподавателя (/notes)
    5. Завершение урока (/stop) -> статус COMPLETED, завершение ExamSession
    """
    # 1. Создаем учебную группу и двух курсантов с уникальными именами
    uid = uuid.uuid4().hex[:6]
    group = StudentGroup(group_name=f"Группа Т-42-{uid}")
    db_session.add(group)
    await db_session.flush()

    cadet1 = User(
        username=f"cadet1_{uid}",
        password_hash="pwd",
        role="CADET",
        full_name="Иванов Иван",
        group_ids=[group.group_id],
    )
    cadet2 = User(
        username=f"cadet2_{uid}",
        password_hash="pwd",
        role="CADET",
        full_name="Петров Петр",
        group_ids=[group.group_id],
    )
    db_session.add_all([cadet1, cadet2])
    await db_session.flush()

    cadet1_id = cadet1.user_id
    cadet2_id = cadet2.user_id
    group_id = group.group_id

    group.cadet_ids = [cadet1_id, cadet2_id]
    db_session.add(group)
    await db_session.commit()

    # 2. Создаем урок со статусом WAITING
    create_payload = {
        "group_id": group_id,
        "target_role": "OPERATOR_112",
        "categories": ["Пожары", "ДТП"],
        "complexity": "level_2",
        "time_limit_seconds": 45,
        "error_limit": 2,
    }
    res_create = await async_client.post("/api/v1/lessons", json=create_payload)
    assert res_create.status_code == 201, f"Failed to create lesson: {res_create.text}"
    lesson_data = res_create.json()
    lesson_id = lesson_data["id"]

    assert lesson_data["status"] == "WAITING"
    assert lesson_data["group_id"] == group_id
    assert lesson_data["target_role"] == "OPERATOR_112"
    assert lesson_data["total_cadets"] == 2
    assert len(lesson_data["students"]) == 2

    # 3. GET /api/v1/lessons/{id}
    res_get = await async_client.get(f"/api/v1/lessons/{lesson_id}")
    assert res_get.status_code == 200
    get_data = res_get.json()
    assert get_data["id"] == lesson_id
    assert get_data["status"] == "WAITING"
    assert get_data["group_name"] == f"Группа Т-42-{uid}"
    assert len(get_data["students"]) == 2
    assert get_data["students"][0]["status"] == "WAITING"

    # 4. POST /api/v1/lessons/{id}/start -> ACTIVE
    res_start = await async_client.post(f"/api/v1/lessons/{lesson_id}/start")
    assert res_start.status_code == 200
    start_data = res_start.json()
    assert start_data["status"] == "ACTIVE"
    assert start_data["started_at"] is not None

    # Проверяем, что в БД создались индивидуальные сессии ExamSession
    async with AsyncSessionLocal() as check_db:
        stmt_sessions = select(ExamSession).where(ExamSession.assignment_id == lesson_id)
        res_sessions = await check_db.execute(stmt_sessions)
        created_sessions = list(res_sessions.scalars().all())
        assert len(created_sessions) == 2
        cadet_session_ids = {s.cadet_id for s in created_sessions}
        assert cadet1_id in cadet_session_ids
        assert cadet2_id in cadet_session_ids
        for s in created_sessions:
            assert s.status == "ACTIVE"
            assert s.categories == ["Пожары", "ДТП"]
            assert s.time_limit_seconds == 45

    # 5. PATCH /api/v1/lessons/{id}/notes -> Сохранение заметок
    notes_text = "Группа показывает хорошее понимание протокола 112."
    res_notes = await async_client.patch(
        f"/api/v1/lessons/{lesson_id}/notes",
        json={"teacher_notes": notes_text},
    )
    assert res_notes.status_code == 200
    notes_data = res_notes.json()
    assert notes_data["teacher_notes"] == notes_text

    # Проверяем сохранность заметок в БД
    async with AsyncSessionLocal() as check_db:
        stmt_l = select(Lesson).where(Lesson.assignment_id == lesson_id)
        res_l = await check_db.execute(stmt_l)
        lesson_db = res_l.scalar_one()
        assert lesson_db.teacher_notes == notes_text

    # 6. POST /api/v1/lessons/{id}/stop -> COMPLETED
    res_stop = await async_client.post(f"/api/v1/lessons/{lesson_id}/stop")
    assert res_stop.status_code == 200
    stop_data = res_stop.json()
    assert stop_data["status"] == "COMPLETED"
    assert stop_data["completed_at"] is not None

    # Проверяем, что ExamSession завершены
    async with AsyncSessionLocal() as check_db:
        res_sessions_after = await check_db.execute(stmt_sessions)
        for s in res_sessions_after.scalars().all():
            assert s.status == "COMPLETED"
            assert s.end_time is not None

    # 7. GET /api/v1/lessons -> Урок отображается в списке уроков
    res_list = await async_client.get("/api/v1/lessons")
    assert res_list.status_code == 200
    lessons_list = res_list.json()
    matching = [l for l in lessons_list if l["id"] == lesson_id]
    assert len(matching) == 1
    assert matching[0]["status"] == "COMPLETED"
    assert matching[0]["teacher_notes"] == notes_text
