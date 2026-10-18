"""Focused permission regressions for analytics grade overrides."""
import json

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.models.base import Base
from backend.models.domain_01 import User, UserActionLog
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import TicketResult


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(subject=str(user_id), role='TEACHER')}"}


@pytest.mark.asyncio
async def test_record_override_denies_other_teacher_and_preserves_owner_zero_old_score():
    async with AsyncSessionLocal() as db:
        owner = User(username="grade_owner_review", password_hash=hash_password("pw"), role="TEACHER", is_active=True)
        other = User(username="grade_other_review", password_hash=hash_password("pw"), role="TEACHER", is_active=True)
        db.add_all([owner, other])
        await db.flush()
        assignment = Assignment(assigned_by=owner.user_id)
        db.add(assignment)
        await db.flush()
        session = ExamSession(session_type="CALL_SIMULATION", assignment_id=assignment.assignment_id)
        db.add(session)
        await db.flush()
        result = TicketResult(session_id=session.session_id, score_total=0.0, is_passed=False)
        db.add(result)
        await db.commit()
        rid, oid, xid = result.result_id, owner.user_id, other.user_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        denied = await client.post(f"/api/v1/analytics/records/{rid}/grade-override", json={"score": 75, "reason": "review"}, headers=_headers(xid))
        assert denied.status_code == 403
        allowed = await client.post(f"/api/v1/analytics/records/{rid}/grade-override", json={"score": 75, "reason": "review"}, headers=_headers(oid))
        assert allowed.status_code == 200
        assert allowed.json()["old_score"] == 0.0

    async with AsyncSessionLocal() as db:
        result = await db.get(TicketResult, rid)
        assert result.score_total == 75
        logs = (await db.execute(select(UserActionLog).where(UserActionLog.action == "GRADE_OVERRIDE"))).scalars().all()
        assert len(logs) == 1
        assert json.loads(logs[0].details)["old_score"] == 0.0


@pytest.mark.asyncio
async def test_teacher_cannot_override_orphan_record_or_unassigned_session():
    async with AsyncSessionLocal() as db:
        teacher = User(username="grade_orphan_review", password_hash=hash_password("pw"), role="TEACHER", is_active=True)
        db.add(teacher)
        await db.flush()
        result = TicketResult(score_total=12.0)
        session = ExamSession(session_type="CALL_SIMULATION")
        db.add_all([result, session])
        await db.commit()
        tid, rid, sid = teacher.user_id, result.result_id, session.session_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        orphan = await client.post(f"/api/v1/analytics/records/{rid}/grade-override", json={"score": 75, "reason": "review"}, headers=_headers(tid))
        no_assignment = await client.post(f"/api/v1/analytics/sessions/{sid}/grade-override", json={"score": 75, "reason": "review"}, headers=_headers(tid))
    assert orphan.status_code == 403
    assert no_assignment.status_code == 403


@pytest.mark.asyncio
async def test_session_override_without_card_fails_without_inventing_foreign_key():
    async with AsyncSessionLocal() as db:
        teacher = User(username="grade_no_card_review", password_hash=hash_password("pw"), role="TEACHER", is_active=True)
        db.add(teacher)
        await db.flush()
        assignment = Assignment(assigned_by=teacher.user_id)
        db.add(assignment)
        await db.flush()
        session = ExamSession(session_type="CALL_SIMULATION", assignment_id=assignment.assignment_id)
        db.add(session)
        await db.commit()
        tid, sid = teacher.user_id, session.session_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(f"/api/v1/analytics/sessions/{sid}/grade-override", json={"score": 75, "reason": "review"}, headers=_headers(tid))
    assert response.status_code == 409
    assert "карточки" in response.json()["detail"].lower()
