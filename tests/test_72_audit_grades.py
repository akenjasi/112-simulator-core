import json
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User, UserActionLog
from backend.models.domain_04 import TicketResult
from backend.core.security import create_access_token, hash_password


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_teacher_grade_change_is_audited(monkeypatch=None):
    """
    Test that modifying an evaluation result directly logs a GRADE_MODIFIED action.
    1. Creates a teacher and a ticket result with initial is_passed=False.
    2. Sends PATCH /api/analytics/records/{record_id}/appeal with status='passed'.
    3. Verifies response is 200 and evaluation result is updated.
    4. Verifies UserActionLog contains GRADE_MODIFIED record with teacher user_id,
       endpoint, and JSON details containing old_is_passed, new_is_passed, and comment.
    """
    async with AsyncSessionLocal() as session:
        teacher = User(
            username="teacher_fstec_72",
            password_hash=hash_password("teacher_secret"),
            role="TEACHER",
            full_name="Преподаватель ФСТЭК",
            is_active=True,
        )
        session.add(teacher)
        await session.flush()
        teacher_id = teacher.user_id

        tr = TicketResult(
            ticket_id="ticket-72-audit",
            is_passed=False,
            errors_count=1,
            error_details={"address": "Неверный адрес"},
        )
        session.add(tr)
        await session.commit()
        await session.refresh(tr)
        record_id = tr.result_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    comment_text = "Апелляция принята: заявитель указал ориентир верно"
    appeal_payload = {
        "status": "passed",
        "comment": comment_text,
    }

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.patch(
            f"/api/analytics/records/{record_id}/appeal",
            json=appeal_payload,
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "passed"
        assert data["is_appealed"] is True
        assert data["teacher_comment"] == comment_text

    # Verify database state
    async with AsyncSessionLocal() as session:
        # Check TicketResult
        tr_updated = await session.get(TicketResult, record_id)
        assert tr_updated is not None
        assert tr_updated.is_passed is True
        assert tr_updated.is_appealed is True
        assert tr_updated.teacher_comment == comment_text

        # Check UserActionLog for GRADE_MODIFIED
        stmt = (
            select(UserActionLog)
            .where(
                UserActionLog.user_id == str(teacher_id),
                UserActionLog.action == "GRADE_MODIFIED",
            )
        )
        result = await session.execute(stmt)
        logs = result.scalars().all()

        assert len(logs) >= 1
        log = logs[-1]

        assert log.user_id == str(teacher_id)
        assert log.action == "GRADE_MODIFIED"
        assert log.action_type == "GRADE_MODIFIED"
        assert log.endpoint == f"/api/analytics/records/{record_id}/appeal"
        assert log.target_id == record_id

        # Verify details JSON
        assert log.details is not None
        details = json.loads(log.details)
        assert details.get("old_is_passed") is False
        assert details.get("new_is_passed") is True
        assert details.get("comment") == comment_text
        assert details.get("endpoint") == f"/api/analytics/records/{record_id}/appeal"


@pytest.mark.asyncio
async def test_teacher_grade_change_v1_router_is_audited():
    """Verify that the /api/v1/analytics/records/{id}/appeal route also produces GRADE_MODIFIED."""
    async with AsyncSessionLocal() as session:
        teacher = User(
            username="teacher_v1_72",
            password_hash=hash_password("teacher_secret"),
            role="TEACHER",
            is_active=True,
        )
        session.add(teacher)
        await session.flush()
        teacher_id = teacher.user_id

        tr = TicketResult(
            ticket_id="ticket-v1-audit",
            is_passed=False,
            errors_count=2,
        )
        session.add(tr)
        await session.commit()
        await session.refresh(tr)
        record_id = tr.result_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    comment_text = "Пересмотрено через v1 API"
    appeal_payload = {
        "status": "passed",
        "comment": comment_text,
    }

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.patch(
            f"/api/v1/analytics/records/{record_id}/appeal",
            json=appeal_payload,
            headers=headers,
        )
        assert response.status_code == 200

    async with AsyncSessionLocal() as session:
        stmt = (
            select(UserActionLog)
            .where(
                UserActionLog.user_id == str(teacher_id),
                UserActionLog.action == "GRADE_MODIFIED",
            )
        )
        result = await session.execute(stmt)
        logs = result.scalars().all()
        assert len(logs) == 1
        log = logs[0]
        details = json.loads(log.details)
        assert details["old_is_passed"] is False
        assert details["new_is_passed"] is True
        assert details["comment"] == comment_text


@pytest.mark.asyncio
async def test_appeal_forbidden_for_cadet():
    """Verify that a CADET user cannot appeal/modify grades (RBAC restriction)."""
    async with AsyncSessionLocal() as session:
        cadet = User(
            username="cadet_fstec_72",
            password_hash=hash_password("cadet_pass"),
            role="CADET",
            is_active=True,
        )
        session.add(cadet)
        await session.flush()
        cadet_id = cadet.user_id

        tr = TicketResult(
            ticket_id="ticket-72-cadet",
            is_passed=False,
        )
        session.add(tr)
        await session.commit()
        await session.refresh(tr)
        record_id = tr.result_id

    token = create_access_token(subject=str(cadet_id), role="CADET")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.patch(
            f"/api/analytics/records/{record_id}/appeal",
            json={"status": "passed", "comment": "Попытка курсанта"},
            headers=headers,
        )
        assert response.status_code == 403

    async with AsyncSessionLocal() as session:
        stmt = select(UserActionLog).where(UserActionLog.action == "GRADE_MODIFIED")
        result = await session.execute(stmt)
        assert len(result.scalars().all()) == 0
