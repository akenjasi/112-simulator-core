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
        grp = StudentGroup(group_id="group-test-41", group_name="Группа ТЗ-41")
        session.add(grp)
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_create_lesson_waiting_status(teacher_auth_client):
    """
    Тест проверяет эндпоинт создания группового урока.
    Ожидается, что при валидных данных урок будет создан со статусом WAITING.
    """
    payload = {
        "group_id": "group-test-41",
        "target_role": "OPERATOR_112",
        "categories": ["Взрывы", "ДТП"],
        "complexity": "adaptive",
        "time_limit_seconds": 30,
    }

    res = await teacher_auth_client.post("/api/v1/lessons", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["status"] == "WAITING"
    assert data["group_id"] == "group-test-41"
    assert data["target_role"] == "OPERATOR_112"
    assert data["complexity"] == "adaptive"

    async with AsyncSessionLocal() as session:
        stmt = select(Assignment).where(Assignment.assignment_id == data["id"])
        result = await session.execute(stmt)
        assignment = result.scalar_one_or_none()

        assert assignment is not None
        assert assignment.status == "WAITING"


@pytest.mark.asyncio
async def test_create_lesson_validation_error(teacher_auth_client):
    """
    Тест проверяет валидацию (например, отсутствие обязательной группы).
    """
    # Пустой group_id
    res = await teacher_auth_client.post(
        "/api/v1/lessons",
        json={"group_id": "", "target_role": "OPERATOR_112", "complexity": "adaptive"},
    )
    assert res.status_code == 422

    # Некорректная роль
    res2 = await teacher_auth_client.post(
        "/api/v1/lessons",
        json={"group_id": "group-test-41", "target_role": "INVALID", "complexity": "adaptive"},
    )
    assert res2.status_code == 422
