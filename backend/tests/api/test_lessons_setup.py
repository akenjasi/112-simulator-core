"""Unit tests for Lesson setup (ТЗ 41 - Рефакторинг модуля 'Запуск урока')."""

import pytest
from sqlalchemy import select

from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
import backend.models.domain_01  # noqa: F401
import backend.models.domain_02  # noqa: F401
import backend.models.domain_03  # noqa: F401
import backend.models.domain_04  # noqa: F401
import backend.models.domain_05  # noqa: F401
import backend.models.domain_06  # noqa: F401
from backend.models.domain_01 import StudentGroup
from backend.models.domain_03 import Assignment


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        for gid, gname in [
            ("group-test-01", "Группа 101"),
            ("group-test-02", "Группа 202"),
            ("group-test-03", "Группа 303"),
            ("group-test-stats", "Группа Статистики"),
        ]:
            grp = StudentGroup(group_id=gid, group_name=gname)
            session.add(grp)
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_create_lesson_success_default_waiting(teacher_auth_client):
    """Test creating a lesson returns status 201 and WAITING status."""
    payload = {
        "group_id": "group-test-01",
        "target_role": "OPERATOR_112",
        "categories": ["Взрывы", "ДТП"],
        "complexity": "adaptive",
        "time_limit_seconds": 45,
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["status"] == "WAITING"
    assert data["group_id"] == "group-test-01"
    assert data["target_role"] == "OPERATOR_112"
    assert data["complexity"] == "adaptive"
    assert data["time_limit_seconds"] == 45
    assert data["categories"] == ["Взрывы", "ДТП"]
    assert "assignment_id" in data
    assert "session_id" in data

    # Verify directly in DB
    async with AsyncSessionLocal() as session:
        stmt = select(Assignment).where(Assignment.assignment_id == data["assignment_id"])
        result = await session.execute(stmt)
        assignment = result.scalar_one_or_none()

        assert assignment is not None
        assert assignment.status == "WAITING"
        assert assignment.target_role == "OPERATOR_112"
        assert assignment.session_type == "CALL_SIMULATION"
        assert assignment.complexity == "adaptive"
        assert assignment.time_limit_seconds == 45
        assert assignment.categories == ["Взрывы", "ДТП"]


@pytest.mark.asyncio
async def test_create_lesson_dispatcher_role(teacher_auth_client):
    """Test creating a lesson with DISPATCHER_DDS role and level_2 complexity."""
    payload = {
        "group_id": "group-test-02",
        "target_role": "DISPATCHER_DDS",
        "categories": ["Пожары и задымления"],
        "complexity": "level_2",
        "time_limit_seconds": 30,
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["status"] == "WAITING"
    assert data["target_role"] == "DISPATCHER_DDS"
    assert data["complexity"] == "level_2"

    async with AsyncSessionLocal() as session:
        stmt = select(Assignment).where(Assignment.assignment_id == data["assignment_id"])
        result = await session.execute(stmt)
        assignment = result.scalar_one_or_none()

        assert assignment is not None
        assert assignment.session_type == "CARD_ACTIONS"


@pytest.mark.asyncio
async def test_create_lesson_empty_categories_allowed(teacher_auth_client):
    """Empty categories is allowed and represents 'all categories'."""
    payload = {
        "group_id": "group-test-03",
        "target_role": "OPERATOR_112",
        "categories": [],
        "complexity": "level_1",
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["status"] == "WAITING"
    assert data["categories"] == []


@pytest.mark.asyncio
async def test_create_lesson_validation_empty_group(teacher_auth_client):
    """Empty group_id must fail validation with 422."""
    payload = {
        "group_id": "   ",
        "target_role": "OPERATOR_112",
        "complexity": "adaptive",
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_lesson_validation_invalid_role(teacher_auth_client):
    """Invalid target_role must fail validation with 422."""
    payload = {
        "group_id": "group-test-01",
        "target_role": "CHIEF_OFFICER",
        "complexity": "adaptive",
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_lesson_validation_invalid_complexity(teacher_auth_client):
    """Invalid complexity must fail validation with 422."""
    payload = {
        "group_id": "group-test-01",
        "target_role": "OPERATOR_112",
        "complexity": "impossible_nightmare",
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_lesson_validation_invalid_time_limit(teacher_auth_client):
    """Non-positive time limit must fail validation with 422."""
    payload = {
        "group_id": "group-test-01",
        "target_role": "OPERATOR_112",
        "complexity": "adaptive",
        "time_limit_seconds": 0,
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 422

    payload["time_limit_seconds"] = -15
    res2 = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res2.status_code == 422


@pytest.mark.asyncio
async def test_get_lesson_and_stats(teacher_auth_client):
    """Test getting created lesson details and stats."""
    payload = {
        "group_id": "group-test-stats",
        "target_role": "OPERATOR_112",
        "complexity": "adaptive",
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 201
    lesson_id = res.json()["id"]

    res_get = await teacher_auth_client.get(f"/api/v1/lessons/{lesson_id}")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == lesson_id

    res_stats = await teacher_auth_client.get(f"/api/v1/lessons/{lesson_id}/stats")
    assert res_stats.status_code == 200
    assert res_stats.json()["session_id"] == lesson_id
    assert res_stats.json()["status"] == "WAITING"

    # Also test router_sessions compatibility
    res_sess_stats = await teacher_auth_client.get(f"/api/v1/sessions/{lesson_id}/stats")
    assert res_sess_stats.status_code == 200
    assert res_sess_stats.json()["session_id"] == lesson_id
    assert res_sess_stats.json()["status"] == "WAITING"
