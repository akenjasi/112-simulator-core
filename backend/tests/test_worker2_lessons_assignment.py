"""Tests for Worker 2: Individual cadet assignment, server timer, and evaluation criteria."""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone, timedelta
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.main import app
from backend.database import AsyncSessionLocal
from backend.core.security import create_access_token
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard

INCOMING_TICKET = {
    "connection": "Установлено",
    "phones": {"aon": "112", "provided": "112", "onSite": ""},
    "incident": {"number": "W2-112", "savedAt": "18.10.2026 12:00", "operator": "112"},
    "caller": {"name": "Тестовый заявитель", "role": "очевидец", "address": "ул. Ленина, д. 10"},
    "description": "Пожар на складе готовой продукции",
    "statuses": {"injured": "нет", "ambulanceRefusal": "нет", "blocked": "нет"},
    "emergency": {"cs": False, "cp": False},
    "classification": {"section": "Пожары", "title": "Склад", "class": "Пожар", "visClass": ""},
    "services": [
        {"id": "fire_01", "name": "01 Пожарные", "time": "12:00", "status": "Получена службой", "isRejected": False, "history": []},
        {"id": "police_02", "name": "02 Полиция", "time": "12:01", "status": "Получена службой", "isRejected": False, "history": []},
    ],
}


async def api_request(method: str, path: str, user=None, **kwargs):
    headers = {} if user is None else {"Authorization": "Bearer " + create_access_token(user[0], user[1])}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        return await client.request(method, path, **kwargs)


async def setup_test_environment(n_cadets: int = 3):
    tag = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as db:
        teacher = User(username=f"w2_t_{tag}", role="TEACHER", password_hash="dummy")
        admin = User(username=f"w2_a_{tag}", role="ADMIN", password_hash="dummy")
        cadets = [
            User(username=f"w2_c{i}_{tag}", full_name=f"Кадет {i}", role="CADET", password_hash="dummy", is_active=True)
            for i in range(n_cadets)
        ]
        outsider = User(username=f"w2_out_{tag}", full_name="Вне группы", role="CADET", password_hash="dummy", is_active=True)
        inactive = User(username=f"w2_inact_{tag}", full_name="Неактивный", role="CADET", password_hash="dummy", is_active=False)
        db.add_all([teacher, admin, *cadets, outsider, inactive])
        await db.flush()

        group = StudentGroup(
            group_name=f"w2_grp_{tag}",
            teacher_id=teacher.user_id,
            cadet_ids=[c.user_id for c in cadets],
        )
        ticket = ScenarioTicket(
            title=f"Складской пожар {tag}",
            workflow_state={"status": "APPROVED"},
            content={"incoming_card": deepcopy(INCOMING_TICKET)},
            ground_truth={"solution": "send fire immediately"},
        )
        db.add_all([group, ticket])
        await db.commit()

        return {
            "teacher": (teacher.user_id, "TEACHER"),
            "admin": (admin.user_id, "ADMIN"),
            "cadets": [(c.user_id, "CADET") for c in cadets],
            "outsider": (outsider.user_id, "CADET"),
            "inactive": (inactive.user_id, "CADET"),
            "group_id": group.group_id,
            "ticket_id": ticket.scenario_id,
        }


def make_action(service_name="01 Пожарные", status_val="Принята", key=None):
    return {
        "request_id": key or str(uuid.uuid4()),
        "kind": "status",
        "service_name": service_name,
        "status": status_val,
        "comment": "Тестовое подтверждение",
        "order_number": "П-101",
    }


@pytest.mark.asyncio
async def test_individual_cadet_assignment_flow():
    """Тест индивидуального назначения: сессия создается ТОЛЬКО для одного курсанта."""
    env = await setup_test_environment(n_cadets=3)
    target_cadet = env["cadets"][0]
    other_cadet = env["cadets"][1]

    # Создаем индивидуальный урок для target_cadet
    payload = {
        "group_id": env["group_id"],
        "cadet_id": target_cadet[0],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
        "complexity": "level_1",
        "time_limit_seconds": 40,
        "error_limit": 2,
    }
    res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    assert res.status_code == 201, res.text
    lesson_data = res.json()
    lesson_id = lesson_data["id"]

    assert lesson_data["cadet_id"] == target_cadet[0]
    assert lesson_data["total_cadets"] == 1
    assert len(lesson_data["students"]) == 1
    assert lesson_data["students"][0]["cadet_id"] == target_cadet[0]

    # Запускаем урок
    start_res = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert start_res.status_code == 200, start_res.text
    started_data = start_res.json()
    assert started_data["status"] == "ACTIVE"
    assert started_data["total_cadets"] == 1
    assert len(started_data["students"]) == 1
    assert started_data["students"][0]["cadet_id"] == target_cadet[0]

    # Проверяем, что в БД создана сессия ТОЛЬКО для target_cadet
    async with AsyncSessionLocal() as db:
        sessions = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).all()
        assert len(sessions) == 1
        assert sessions[0].cadet_id == target_cadet[0]
        assert sessions[0].time_limit_seconds == 40
        assert sessions[0].error_limit == 2

    # Назначенный курсант видит назначенную сессию
    cadet_resp = await api_request("GET", "/api/dds/assignments", target_cadet)
    assert cadet_resp.status_code == 200
    assigned_lessons = [s for s in cadet_resp.json() if s["lesson_id"] == lesson_id]
    assert len(assigned_lessons) == 1
    assert assigned_lessons[0]["time_limit_seconds"] == 40
    assert assigned_lessons[0]["error_limit"] == 2

    # Другой курсант группы НЕ видит эту сессию
    other_resp = await api_request("GET", "/api/dds/assignments", other_cadet)
    assert other_resp.status_code == 200
    other_lessons = [s for s in other_resp.json() if s["lesson_id"] == lesson_id]
    assert len(other_lessons) == 0


@pytest.mark.asyncio
async def test_student_id_alias_supported():
    """Проверка поддержки student_id как алиаса для cadet_id."""
    env = await setup_test_environment(n_cadets=2)
    target_cadet = env["cadets"][0]

    payload = {
        "group_id": env["group_id"],
        "student_id": target_cadet[0],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
    }
    res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["cadet_id"] == target_cadet[0]


@pytest.mark.asyncio
async def test_cannot_assign_cadet_not_in_group():
    """Попытка назначить кадета не из группы отклоняется ошибкой 400."""
    env = await setup_test_environment(n_cadets=2)
    outsider = env["outsider"]

    payload = {
        "group_id": env["group_id"],
        "cadet_id": outsider[0],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
    }
    res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    assert res.status_code == 400, res.text
    assert "does not belong" in res.text


@pytest.mark.asyncio
async def test_cannot_assign_nonexistent_or_inactive_cadet():
    """Попытка назначить несуществующего или неактивного кадета отклоняется."""
    env = await setup_test_environment(n_cadets=2)

    # Несуществующий ID
    res1 = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id": env["group_id"],
        "cadet_id": "nonexistent-cadet-id",
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
    })
    assert res1.status_code == 404

    # Неактивный пользователь
    res2 = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id": env["group_id"],
        "cadet_id": env["inactive"][0],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
    })
    assert res2.status_code == 400


@pytest.mark.asyncio
async def test_scenario_snapshot_isolation_from_catalog_changes():
    """Снимок сценария сохраняется при старте и защищен от последующих правок в каталоге."""
    env = await setup_test_environment(n_cadets=2)
    target_cadet = env["cadets"][0]

    # Создаем и стартуем урок
    payload = {
        "group_id": env["group_id"],
        "cadet_id": target_cadet[0],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
    }
    create_res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    lesson_id = create_res.json()["id"]

    start_res = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert start_res.status_code == 200

    # Проверяем наличие снимка в сессии и в уроке
    async with AsyncSessionLocal() as db:
        session = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        assert session.dynamic_state["dds"]["scenario_snapshot"]["description"] == INCOMING_TICKET["description"]

        lesson = await db.get(Assignment, lesson_id)
        assert len(lesson.card_pool_ids) == 1
        assert lesson.card_pool_ids[0]["description"] == INCOMING_TICKET["description"]

        # Теперь модифицируем исходный билет в базе данных (симулируем правку в каталоге)
        ticket = await db.get(ScenarioTicket, env["ticket_id"])
        ticket.content = {"incoming_card": {"description": "ПОЛНОСТЬЮ ИЗМЕНЕННЫЙ ТЕКСТ В КАТАЛОГЕ"}}
        await db.commit()

    # Запрашиваем состояние сессии курсантом
    state_res = await api_request("GET", f"/api/dds/sessions/{session.session_id}", target_cadet)
    assert state_res.status_code == 200
    state_data = state_res.json()

    # Снимок остался неизменным!
    assert state_data["incoming_card"]["description"] == INCOMING_TICKET["description"]
    assert "ПОЛНОСТЬЮ ИЗМЕНЕННЫЙ" not in state_data["incoming_card"]["description"]


@pytest.mark.asyncio
async def test_server_timer_default_and_fields():
    """Серверный таймер по умолчанию равен 30с и возвращает все необходимые поля."""
    env = await setup_test_environment(n_cadets=1)
    cadet = env["cadets"][0]

    # Не передаем time_limit_seconds
    payload = {
        "group_id": env["group_id"],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
    }
    create_res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    assert create_res.status_code == 201
    lesson_data = create_res.json()
    assert lesson_data["time_limit_seconds"] == 30

    start_res = await api_request("POST", f"/api/v1/lessons/{lesson_data['id']}/start", env["teacher"])
    assert start_res.status_code == 200

    # Получаем сессию
    assign_res = await api_request("GET", "/api/dds/assignments", cadet)
    assert assign_res.status_code == 200
    s_data = assign_res.json()[0]

    assert s_data["time_limit_seconds"] == 30
    assert s_data["time_remaining_seconds"] <= 30
    assert s_data["time_remaining_seconds"] >= 20
    assert s_data["is_expired"] is False
    assert s_data["start_time"] is not None


@pytest.mark.asyncio
async def test_server_timer_expiry_exam_mode():
    """В режиме EXAM при истечении серверного таймера действия блокируются с 409 Conflict."""
    env = await setup_test_environment(n_cadets=1)
    cadet = env["cadets"][0]

    payload = {
        "group_id": env["group_id"],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
        "time_limit_seconds": 10,
    }
    create_res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    lesson_id = create_res.json()["id"]

    start_res = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert start_res.status_code == 200

    # Переводим урок в EXAM режим и отматываем start_time в прошлое
    async with AsyncSessionLocal() as db:
        lesson = await db.get(Assignment, lesson_id)
        lesson.mode = "EXAM"
        session = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        session.start_time = datetime.now(timezone.utc) - timedelta(seconds=60)
        await db.commit()
        session_id = session.session_id

    # Пытаемся применить действие
    act = make_action()
    action_res = await api_request("POST", f"/api/dds/sessions/{session_id}/actions", cadet, json=act)
    assert action_res.status_code == 409, action_res.text
    assert "Время выполнения экзамена истекло" in action_res.text

    # Проверяем, что в сессии зафиксирован timed_out: True
    async with AsyncSessionLocal() as db:
        s_fresh = await db.get(ExamSession, session_id)
        dds = s_fresh.dynamic_state.get("dds", {})
        assert dds.get("timed_out") is True
        assert dds.get("time_exceeded_seconds") is not None
        assert dds.get("time_exceeded_seconds") >= 40


@pytest.mark.asyncio
async def test_server_timer_expiry_training_mode():
    """В режиме TRAINING при превышении времени действие разрешается, но факт фиксируется."""
    env = await setup_test_environment(n_cadets=1)
    cadet = env["cadets"][0]

    payload = {
        "group_id": env["group_id"],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
        "time_limit_seconds": 10,
    }
    create_res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    lesson_id = create_res.json()["id"]

    start_res = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert start_res.status_code == 200

    # Отматываем время в прошлое (в режиме TRAINING)
    async with AsyncSessionLocal() as db:
        session = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        session.start_time = datetime.now(timezone.utc) - timedelta(seconds=35)
        await db.commit()
        session_id = session.session_id

    # Действие разрешено
    act = make_action()
    action_res = await api_request("POST", f"/api/dds/sessions/{session_id}/actions", cadet, json=act)
    assert action_res.status_code == 200, action_res.text
    state_data = action_res.json()
    assert state_data["is_expired"] is True
    assert state_data["time_remaining_seconds"] == 0

    # Завершение сессии также фиксирует превышение
    finish_res = await api_request("POST", f"/api/dds/sessions/{session_id}/finish", cadet, json={})
    assert finish_res.status_code == 200
    finish_data = finish_res.json()
    assert finish_data["session_status"] == "COMPLETED"
    assert finish_data["is_expired"] is True


@pytest.mark.asyncio
async def test_error_limit_propagation():
    """Проверка сохранения и передачи error_limit в сессию ДДС."""
    env = await setup_test_environment(n_cadets=1)
    cadet = env["cadets"][0]

    payload = {
        "group_id": env["group_id"],
        "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS",
        "error_limit": 5,
    }
    create_res = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    assert create_res.status_code == 201
    lesson_id = create_res.json()["id"]

    start_res = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert start_res.status_code == 200

    assign_res = await api_request("GET", "/api/dds/assignments", cadet)
    assert assign_res.status_code == 200
    session_data = assign_res.json()[0]
    assert session_data["error_limit"] == 5

    async with AsyncSessionLocal() as db:
        session = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        assert session.error_limit == 5
        assert session.dynamic_state["dds"]["error_limit"] == 5
