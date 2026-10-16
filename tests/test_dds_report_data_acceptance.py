"""Independent acceptance: a DDS report must describe only the selected lesson.

Owned by the supervising reviewer, not by the implementation agent.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from backend.main import app
from backend.database import AsyncSessionLocal
from backend.core.security import create_access_token
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import Assignment, ExamSession, AIStudentAdvice, AIGroupAdvice
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult


async def fixture_data():
    tag = uuid.uuid4().hex
    async with AsyncSessionLocal() as db:
        teacher = User(username=f"report_owner_{tag}", role="TEACHER", password_hash="unused")
        other = User(username=f"report_other_{tag}", role="TEACHER", password_hash="unused")
        admin = User(username=f"report_admin_{tag}", role="ADMIN", password_hash="unused")
        cadet = User(username=f"report_cadet_{tag}", role="CADET", password_hash="unused", full_name="Исторический участник")
        db.add_all([teacher, other, admin, cadet])
        await db.flush()
        group = StudentGroup(group_name=f"report_group_{tag}", teacher_id=teacher.user_id)
        foreign_group = StudentGroup(group_name=f"foreign_group_{tag}", teacher_id=other.user_id)
        db.add_all([group, foreign_group]); await db.flush()
        lessons = {}
        for name, owner, g, status, role in [
            ("selected", teacher, group, "COMPLETED", "DISPATCHER_DDS"),
            ("same_group_other_lesson", teacher, group, "COMPLETED", "DISPATCHER_DDS"),
            ("foreign", other, foreign_group, "COMPLETED", "DISPATCHER_DDS"),
            ("empty", teacher, group, "COMPLETED", "DISPATCHER_DDS"),
            ("active", teacher, group, "ACTIVE", "DISPATCHER_DDS"),
            ("operator", teacher, group, "COMPLETED", "OPERATOR_112"),
            ("no_results", teacher, group, "COMPLETED", "DISPATCHER_DDS"),
        ]:
            lesson = Assignment(group_id=g.group_id, assigned_by=owner.user_id,
                                target_role=role, status=status, session_type="CARD_ACTIONS")
            db.add(lesson); await db.flush(); lessons[name] = lesson.assignment_id
        sessions = {}
        moment = datetime(2026, 10, 17, 9, 0, tzinfo=timezone.utc)
        for name, lesson, status in [
            ("selected", "selected", "COMPLETED"),
            ("in_progress", "selected", "ACTIVE"),
            ("same_group_other_lesson", "same_group_other_lesson", "COMPLETED"),
            ("foreign", "foreign", "COMPLETED"),
            ("no_results", "no_results", "COMPLETED"),
        ]:
            session = ExamSession(assignment_id=lessons[lesson], cadet_id=cadet.user_id,
                                  session_type="CARD_ACTIONS", status=status,
                                  time_limit_seconds=45, start_time=moment)
            db.add(session); await db.flush(); sessions[name] = session.session_id
        for name in ["selected", "in_progress", "same_group_other_lesson", "foreign"]:
            for n in range(2 if name == "selected" else 1):
                marker = f"EVIDENCE_{name}_{n}"
                card = IncidentCard(session_id=sessions[name], operator_id=cadet.user_id,
                                    card_origin="DDS", status="closed",
                                    filled_data={"applicant_phone": "PRIVATE_CALLER_MUST_NOT_BE_INCLUDED"},
                                    assigned_services={"ДДС": {"history": [{"comment": marker}]}})
                db.add(card); await db.flush()
                db.add(EvaluationResult(card_id=card.card_id, session_id=sessions[name],
                                        scores={"total": 60+n}, metrics={"time_taken_seconds": 51+n},
                                        errors_list=[marker]))
                db.add(TicketResult(session_id=sessions[name], is_passed=False,
                                   errors_count=1, error_details={"reason": marker}))
        await db.commit()
        headers = {name: {"Authorization": "Bearer " + create_access_token(user.user_id, user.role)}
                   for name, user in [("teacher", teacher), ("other", other), ("admin", admin), ("cadet", cadet)]}
        return {"lessons": lessons, "sessions": sessions, "headers": headers, "cadet_id": cadet.user_id}


async def fetch(data, lesson="selected", role="teacher"):
    async with AsyncClient(app=app, base_url="http://test") as client:
        return await client.get(f"/api/ai-analytics/lessons/{data['lessons'][lesson]}/data",
                                headers=data["headers"][role])


@pytest.mark.asyncio
async def test_report_excludes_other_lessons_and_active_sessions_without_duplicate_counts():
    d = await fixture_data()
    response = await fetch(d)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["lesson_id"] == d["lessons"]["selected"]
    assert body["summary"] == {"student_count": 1, "completed_session_count": 1,
                               "evaluation_count": 2, "ticket_result_count": 2, "incident_card_count": 2}
    assert [s["session_id"] for s in body["sessions"]] == [d["sessions"]["selected"]]
    assert body["students"][0]["cadet_id"] == d["cadet_id"]
    # Historical participation matters even though this cadet is not in current group membership.
    assert body["students"][0]["full_name"] == "Исторический участник"
    assert body["sessions"][0]["time_limit_seconds"] == 45
    rendered = response.text
    for marker in ["EVIDENCE_in_progress", "EVIDENCE_same_group_other_lesson", "EVIDENCE_foreign", "PRIVATE_CALLER"]:
        assert marker not in rendered
    assert "EVIDENCE_selected_0" in rendered and "EVIDENCE_selected_1" in rendered


@pytest.mark.asyncio
async def test_empty_lesson_never_borrows_other_students_or_results():
    d = await fixture_data()
    response = await fetch(d, "empty")
    assert response.status_code == 200, response.text
    b = response.json()
    assert b["students"] == [] and b["sessions"] == []
    assert all(v == 0 for v in b["summary"].values())
    assert b["warnings"]
    assert "EVIDENCE_" not in response.text


@pytest.mark.asyncio
async def test_report_access_is_bound_to_teacher_ownership_and_role():
    d = await fixture_data()
    path = f"/api/ai-analytics/lessons/{d['lessons']['selected']}/data"
    async with AsyncClient(app=app, base_url="http://test") as client:
        assert (await client.get(path)).status_code == 401
        assert (await client.get(path, headers=d["headers"]["cadet"])).status_code == 403
        assert (await client.get(path, headers=d["headers"]["other"])).status_code == 403
        assert (await client.get(path, headers=d["headers"]["admin"])).status_code == 200
        missing = await client.get(f"/api/ai-analytics/lessons/{uuid.uuid4()}/data", headers=d["headers"]["teacher"])
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_active_and_operator_lessons_are_explicitly_rejected():
    d = await fixture_data()
    assert (await fetch(d, "active")).status_code == 409
    assert (await fetch(d, "operator")).status_code == 409


@pytest.mark.asyncio
async def test_ungraded_session_is_missing_evidence_not_perfect_performance():
    d = await fixture_data()
    response = await fetch(d, "no_results")
    assert response.status_code == 200, response.text
    b = response.json()
    assert b["summary"]["completed_session_count"] == 1
    assert b["summary"]["evaluation_count"] == b["summary"]["ticket_result_count"] == 0
    assert b["sessions"][0]["evaluations"] == []
    assert b["sessions"][0]["ticket_results"] == []
    assert b["warnings"]


@pytest.mark.asyncio
async def test_data_endpoint_never_calls_llm_or_creates_ai_advice(monkeypatch):
    d = await fixture_data()
    mock = AsyncMock(side_effect=AssertionError("LLM must not run for a data snapshot"))
    monkeypatch.setattr("backend.core.ai_worker.call_qwen_llm", mock)
    async with AsyncSessionLocal() as db:
        before = [await db.scalar(select(func.count()).select_from(model)) for model in [AIStudentAdvice, AIGroupAdvice]]
    first = await fetch(d)
    second = await fetch(d)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    mock.assert_not_called()
    async with AsyncSessionLocal() as db:
        after = [await db.scalar(select(func.count()).select_from(model)) for model in [AIStudentAdvice, AIGroupAdvice]]
    assert before == after
