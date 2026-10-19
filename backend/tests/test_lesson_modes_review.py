"""Exercise lesson configuration through the public API, not DB mode patches."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, func

from backend.database import AsyncSessionLocal
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.tests.test_worker2_lessons_assignment import setup_test_environment, api_request, make_action


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value,expected", [
    ("mode", "EXAM", "EXAM"), ("distribution_mode", "exam", "EXAM"),
    ("distribution_mode", "live_stream", "TRAINING"),
])
async def test_public_lesson_mode_is_persisted_and_returned(field, value, expected):
    env = await setup_test_environment(n_cadets=1)
    response = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id": env["group_id"], "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS", field: value,
    })
    assert response.status_code == 201, response.text
    assert response.json()["mode"] == expected
    async with AsyncSessionLocal() as db:
        lesson = await db.get(Assignment, response.json()["id"])
        assert lesson.mode == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("expire_current_card", [False, True])
async def test_exam_chosen_by_teacher_uses_current_card_timer(expire_current_card):
    env = await setup_test_environment(n_cadets=1)
    response = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id": env["group_id"], "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS", "mode": "EXAM", "time_limit_seconds": 10,
    })
    assert response.status_code == 201, response.text
    lesson_id = response.json()["id"]
    started = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert started.status_code == 200, started.text
    assert started.json()["mode"] == "EXAM"
    async with AsyncSessionLocal() as db:
        session = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        old_time = datetime.now(timezone.utc) - timedelta(seconds=60)
        session.start_time = old_time
        # Queue v2 grants each received card its own time budget. An old session
        # alone must not expire a newly received card; age the actual card clock
        # to exercise the server-side exam rejection.
        if expire_current_card:
            state = deepcopy(session.dynamic_state)
            state["dds"]["received_at"] = old_time.isoformat()
            session.dynamic_state = state
        await db.commit()
        session_id = session.session_id
    action = await api_request("POST", f"/api/dds/sessions/{session_id}/actions", env["cadets"][0], json=make_action())
    if expire_current_card:
        assert action.status_code == 409, action.text
        assert "истекло" in action.text
    else:
        assert action.status_code == 200, action.text
        assert action.json()["is_expired"] is False


@pytest.mark.asyncio
async def test_unapproved_ticket_cannot_be_assigned_or_started_directly():
    env = await setup_test_environment(n_cadets=1)
    payload = {"group_id": env["group_id"], "ticket_id": env["ticket_id"], "target_role": "DISPATCHER_DDS"}
    response = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    assert response.status_code == 201, response.text
    lesson_id = response.json()["id"]
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, env["ticket_id"])
        ticket.workflow_state = {"status":"UNDER_REVIEW"}
        await db.commit()
    blocked_create = await api_request("POST", "/api/v1/lessons", env["teacher"], json=payload)
    blocked_start = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert blocked_create.status_code == 409, blocked_create.text
    assert blocked_start.status_code == 409, blocked_start.text
    async with AsyncSessionLocal() as db:
        assert (await db.get(Assignment, lesson_id)).status == "WAITING"
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == lesson_id)) == 0


@pytest.mark.asyncio
async def test_unknown_lesson_mode_is_rejected():
    env = await setup_test_environment(n_cadets=1)
    response = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id":env["group_id"], "ticket_id":env["ticket_id"], "mode":"made_up",
    })
    assert response.status_code == 422, response.text


def test_missing_caller_details_are_not_replaced_with_one_shared_phone_or_city():
    from backend.core.dds_cycle import build_incoming_card
    card = build_incoming_card(category="Пожары", plot="Горит склад", etalon_services=["01 Пожарные"])
    assert card["phones"]["aon"] == ""
    assert card["phones"]["provided"] == ""
    assert card["caller"]["name"] == ""
    assert card["caller"]["address"] == ""


@pytest.mark.asyncio
async def test_dds_lesson_requires_a_concrete_ticket():
    env = await setup_test_environment(n_cadets=1)
    response = await api_request("POST", "/api/v1/lessons", env["teacher"], json={"group_id":env["group_id"], "target_role":"DISPATCHER_DDS"})
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_legacy_history_does_not_invent_grade_for_completed_ungraded_result():
    from backend.models.domain_04 import TicketResult
    env = await setup_test_environment(n_cadets=1)
    async with AsyncSessionLocal() as db:
        lesson = Assignment(group_id=env["group_id"], assigned_by=env["teacher"][0], status="COMPLETED", target_role="OPERATOR_112")
        db.add(lesson)
        await db.flush()
        session = ExamSession(session_type="CALL_SIMULATION", assignment_id=lesson.assignment_id, cadet_id=env["cadets"][0][0], status="COMPLETED")
        db.add(session)
        await db.flush()
        db.add(TicketResult(session_id=session.session_id, ticket_id=env["ticket_id"], status="completed", score_total=None))
        await db.commit()
        lesson_id = lesson.assignment_id
    response = await api_request("GET", f"/api/v1/lessons/{lesson_id}", env["teacher"])
    assert response.status_code == 200, response.text
    students = response.json()["students"]
    assert len(students) == 1
    assert students[0]["score"] is None
    assert students[0]["tickets"][0]["score"] is None
    assert students[0]["tickets"][0]["status"] == "ungraded"
    assert students[0]["failed"] == 0


def test_numeric_evaluation_does_not_invent_pass_fail_threshold():
    from backend.models.domain_04 import EvaluationResult
    from backend.core.gradebook_records import resolve_attempt_score_and_status
    score, passed, status, *_ = resolve_attempt_score_and_status(None, eval_result=EvaluationResult(scores={"total":0.0}))
    assert score == 0.0
    assert passed is None
    assert status == "completed"
