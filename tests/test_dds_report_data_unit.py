"""Unit tests for DDS report data service and endpoint (Task A-02).

Author: Implementation agent.
Scope: backend/core/dds_report_data.py and GET /api/ai-analytics/lessons/{lesson_id}/data.
"""

import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from fastapi import HTTPException

from backend.main import app
from backend.database import AsyncSessionLocal
from backend.core.security import create_access_token
from backend.core.dds_report_data import collect_lesson_report_data
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult


@pytest.fixture
async def sample_dds_data():
    """Create isolated test fixtures for DDS lesson report tests."""
    tag = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as db:
        teacher = User(username=f"t_owner_{tag}", role="TEACHER", password_hash="dummy")
        other_teacher = User(username=f"t_other_{tag}", role="TEACHER", password_hash="dummy")
        admin = User(username=f"admin_{tag}", role="ADMIN", password_hash="dummy")
        cadet1 = User(username=f"cadet1_{tag}", role="CADET", password_hash="dummy", full_name="Курсант Первый")
        cadet2 = User(username=f"cadet2_{tag}", role="CADET", password_hash="dummy", full_name="Курсант Второй")
        db.add_all([teacher, other_teacher, admin, cadet1, cadet2])
        await db.flush()

        group = StudentGroup(group_name=f"Группа {tag}", teacher_id=teacher.user_id)
        db.add(group)
        await db.flush()

        # Lessons
        lesson_ok = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="DISPATCHER_DDS",
            status="COMPLETED",
            session_type="CARD_ACTIONS",
        )
        lesson_empty = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="DISPATCHER_DDS",
            status="COMPLETED",
            session_type="CARD_ACTIONS",
        )
        lesson_active = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="DISPATCHER_DDS",
            status="ACTIVE",
            session_type="CARD_ACTIONS",
        )
        lesson_operator = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="OPERATOR_112",
            status="COMPLETED",
            session_type="CALL_SIMULATION",
        )
        db.add_all([lesson_ok, lesson_empty, lesson_active, lesson_operator])
        await db.flush()

        # Sessions for lesson_ok
        t0 = datetime(2026, 10, 17, 10, 0, tzinfo=timezone.utc)
        t1 = datetime(2026, 10, 17, 10, 30, tzinfo=timezone.utc)
        session1 = ExamSession(
            assignment_id=lesson_ok.assignment_id,
            cadet_id=cadet1.user_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
            time_limit_seconds=60,
            start_time=t0,
        )
        session2 = ExamSession(
            assignment_id=lesson_ok.assignment_id,
            cadet_id=cadet2.user_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
            time_limit_seconds=60,
            start_time=t1,
        )
        # Active session that must be ignored
        session_active = ExamSession(
            assignment_id=lesson_ok.assignment_id,
            cadet_id=cadet1.user_id,
            session_type="CARD_ACTIONS",
            status="ACTIVE",
            time_limit_seconds=60,
            start_time=t1,
        )
        db.add_all([session1, session2, session_active])
        await db.flush()

        # Cards and results for session1
        card1 = IncidentCard(
            session_id=session1.session_id,
            operator_id=cadet1.user_id,
            card_origin="DDS",
            status="closed",
            filled_data={"applicant_phone": "+79990001122", "caller_address": "Secret St"},
            assigned_services={"01": {"status": "dispatched"}},
        )
        db.add(card1)
        await db.flush()

        eval1 = EvaluationResult(
            card_id=card1.card_id,
            session_id=session1.session_id,
            scores={"score": 85},
            metrics={"time_sec": 42},
            grammar={"ok": True},
            errors_list=["err_test_1"],
        )
        ticket1 = TicketResult(
            session_id=session1.session_id,
            ticket_id="ticket_01",
            is_passed=True,
            errors_count=0,
            error_details={},
        )
        db.add_all([eval1, ticket1])

        # Cards and results for session_active (must not leak)
        card_active = IncidentCard(
            session_id=session_active.session_id,
            operator_id=cadet1.user_id,
            card_origin="DDS",
            status="in_progress",
            filled_data={"applicant_phone": "SECRET_ACTIVE_LEAK"},
            assigned_services={"02": {"status": "dispatched"}},
        )
        db.add(card_active)
        await db.commit()

        tokens = {
            "teacher": create_access_token(teacher.user_id, teacher.role),
            "other_teacher": create_access_token(other_teacher.user_id, other_teacher.role),
            "admin": create_access_token(admin.user_id, admin.role),
            "cadet": create_access_token(cadet1.user_id, cadet1.role),
        }

        return {
            "teacher": teacher,
            "other_teacher": other_teacher,
            "admin": admin,
            "cadet1": cadet1,
            "cadet2": cadet2,
            "group": group,
            "lesson_ok": lesson_ok,
            "lesson_empty": lesson_empty,
            "lesson_active": lesson_active,
            "lesson_operator": lesson_operator,
            "session1": session1,
            "session2": session2,
            "tokens": tokens,
        }


@pytest.mark.asyncio
async def test_collect_lesson_report_data_success(sample_dds_data):
    """Verify collect_lesson_report_data returns accurate structured data."""
    d = sample_dds_data
    async with AsyncSessionLocal() as db:
        res = await collect_lesson_report_data(db, d["lesson_ok"].assignment_id)

    assert res["lesson_id"] == d["lesson_ok"].assignment_id
    assert res["group_name"] == d["group"].group_name
    assert res["status"] == "COMPLETED"
    assert res["summary"]["student_count"] == 2
    assert res["summary"]["completed_session_count"] == 2
    assert res["summary"]["evaluation_count"] == 1
    assert res["summary"]["ticket_result_count"] == 1
    assert res["summary"]["incident_card_count"] == 1

    # Students list contains actual participants
    cadet_ids = [s["cadet_id"] for s in res["students"]]
    assert d["cadet1"].user_id in cadet_ids
    assert d["cadet2"].user_id in cadet_ids

    # Privacy: filled_data must NOT be present in cards
    rendered_str = str(res)
    assert "+79990001122" not in rendered_str
    assert "Secret St" not in rendered_str
    assert "SECRET_ACTIVE_LEAK" not in rendered_str


@pytest.mark.asyncio
async def test_collect_lesson_report_data_empty(sample_dds_data):
    """Empty completed lesson returns zero counts and warnings."""
    d = sample_dds_data
    async with AsyncSessionLocal() as db:
        res = await collect_lesson_report_data(db, d["lesson_empty"].assignment_id)

    assert res["summary"]["completed_session_count"] == 0
    assert res["summary"]["student_count"] == 0
    assert res["students"] == []
    assert res["sessions"] == []
    assert len(res["warnings"]) > 0


@pytest.mark.asyncio
async def test_collect_lesson_report_data_validation(sample_dds_data):
    """Non-completed or non-DDS lessons raise 409, missing raises 404."""
    d = sample_dds_data
    async with AsyncSessionLocal() as db:
        with pytest.raises(HTTPException) as exc409_active:
            await collect_lesson_report_data(db, d["lesson_active"].assignment_id)
        assert exc409_active.value.status_code == 409

        with pytest.raises(HTTPException) as exc409_op:
            await collect_lesson_report_data(db, d["lesson_operator"].assignment_id)
        assert exc409_op.value.status_code == 409

        with pytest.raises(HTTPException) as exc404:
            await collect_lesson_report_data(db, str(uuid.uuid4()))
        assert exc404.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_auth_and_permissions(sample_dds_data):
    """Verify HTTP endpoint role restrictions and status codes."""
    d = sample_dds_data
    base_url = f"/api/ai-analytics/lessons/{d['lesson_ok'].assignment_id}/data"

    async with AsyncClient(app=app, base_url="http://test") as client:
        # 1. Missing auth
        r_unauth = await client.get(base_url)
        assert r_unauth.status_code == 401

        # 2. Cadet role forbidden
        r_cadet = await client.get(base_url, headers={"Authorization": f"Bearer {d['tokens']['cadet']}"})
        assert r_cadet.status_code == 403

        # 3. Non-owning teacher forbidden
        r_other = await client.get(base_url, headers={"Authorization": f"Bearer {d['tokens']['other_teacher']}"})
        assert r_other.status_code == 403

        # 4. Owning teacher allowed
        r_owner = await client.get(base_url, headers={"Authorization": f"Bearer {d['tokens']['teacher']}"})
        assert r_owner.status_code == 200
        body = r_owner.json()
        assert body["lesson_id"] == d["lesson_ok"].assignment_id

        # 5. Admin allowed
        r_admin = await client.get(base_url, headers={"Authorization": f"Bearer {d['tokens']['admin']}"})
        assert r_admin.status_code == 200

        # 6. Non-existent lesson
        r_missing = await client.get(
            f"/api/ai-analytics/lessons/{uuid.uuid4()}/data",
            headers={"Authorization": f"Bearer {d['tokens']['teacher']}"},
        )
        assert r_missing.status_code == 404

        # 7. Active lesson returns 409
        r_act = await client.get(
            f"/api/ai-analytics/lessons/{d['lesson_active'].assignment_id}/data",
            headers={"Authorization": f"Bearer {d['tokens']['teacher']}"},
        )
        assert r_act.status_code == 409
