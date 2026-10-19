"""FIX-07: deterministic timeout, clock origin and preservation of saved work."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from backend.database import AsyncSessionLocal
from backend.models.domain_03 import ExamSession
from backend.core import dds_cycle
from backend.tests.test_worker2_lessons_assignment import api_request, make_action, setup_test_environment


async def started_lesson(mode):
    env = await setup_test_environment(n_cadets=1)
    response = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id": env["group_id"], "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS", "mode": mode, "time_limit_seconds": 10,
    })
    assert response.status_code == 201, response.text
    lesson_id = response.json()["id"]
    started = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert started.status_code == 200, started.text
    async with AsyncSessionLocal() as db:
        session = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        return env, lesson_id, session.session_id


async def age_card(session_id, seconds):
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, session_id)
        state = deepcopy(session.dynamic_state)
        state["dds"]["received_at"] = (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()
        session.dynamic_state = state
        await db.commit()


async def test_exam_poll_reloads_state_after_waiting_for_write_lock(monkeypatch):
    env, _, sid = await started_lesson("EXAM")
    await age_card(sid, 20)
    original_lock = dds_cycle.lock_assignment

    async def prior_writer_finishes(db, lesson_id):
        await original_lock(db, lesson_id)
        session = await db.get(ExamSession, sid)
        new_state = deepcopy(session.dynamic_state)
        # A preceding writer advanced the clock/card and saved an action while
        # this poll was waiting. Its stale pre-lock state must never win.
        new_state["dds"]["received_at"] = datetime.now(timezone.utc).isoformat()
        new_state["dds"]["actions"] = [{"request_id": "saved-before-poll", "kind": "status",
            "service_name": "01 Пожарные", "status": "Принята", "order_number": "Н-1"}]
        await db.execute(update(ExamSession).where(ExamSession.session_id == sid)
                         .values(dynamic_state=new_state).execution_options(synchronize_session=False))

    monkeypatch.setattr(dds_cycle, "lock_assignment", prior_writer_finishes)
    response = await api_request("GET", f"/api/dds/sessions/{sid}", env["cadets"][0])
    assert response.status_code == 200, response.text
    assert response.json()["session_status"] == "ACTIVE"
    assert response.json()["actions"][0]["request_id"] == "saved-before-poll"


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,expected", [("TRAINING", 200), ("EXAM", 409)])
async def test_tester_exam_same_expired_card_has_different_action_policy(mode, expected):
    env, _, sid = await started_lesson(mode)
    await age_card(sid, 20)
    action = await api_request("POST", f"/api/dds/sessions/{sid}/actions", env["cadets"][0], json=make_action())
    assert action.status_code == expected, action.text
    if mode == "EXAM":
        assert "истекло" in action.text
    state = await api_request("GET", f"/api/dds/sessions/{sid}", env["cadets"][0])
    assert state.status_code == 200, state.text
    assert state.json()["is_expired"] is True
    assert len(state.json()["actions"]) == (1 if mode == "TRAINING" else 0)


@pytest.mark.asyncio
async def test_tester_exam_rejection_preserves_prior_work_and_finish_still_recovers():
    env, _, sid = await started_lesson("EXAM")
    cadet = env["cadets"][0]
    prefix = f"/api/dds/sessions/{sid}"
    saved = await api_request("POST", prefix + "/actions", cadet, json=make_action())
    assert saved.status_code == 200, saved.text
    actions = saved.json()["actions"]
    await age_card(sid, 20)
    for _ in range(2):
        rejected = await api_request("POST", prefix + "/actions", cadet,
                                     json=make_action(service_name="02 Полиция"))
        assert rejected.status_code == 409, rejected.text
    restored = (await api_request("GET", prefix, cadet)).json()
    assert restored["actions"] == actions
    # Terminal contract: exam timeout marks session completed and readonly
    assert restored["session_status"] == "COMPLETED"
    assert restored["readonly"] is True
    assert not any(restored["allowed_service_statuses"].values())
    assert restored["stop_reason"] == "exam_timeout"
    finished = await api_request("POST", prefix + "/finish", cadet, json={})
    assert finished.status_code == 200, finished.text
    assert finished.json()["readonly"] is True
    assert finished.json()["actions"] == actions
    assert finished.json()["score"] is None


@pytest.mark.asyncio
async def test_tester_exam_deadline_already_runs_before_first_student_get():
    env, _, sid = await started_lesson("EXAM")
    # No student GET has happened. Age only the persisted received_at clock.
    await age_card(sid, 20)
    first_get = await api_request("GET", f"/api/dds/sessions/{sid}", env["cadets"][0])
    assert first_get.status_code == 200, first_get.text
    assert first_get.json()["time_remaining_seconds"] == 0
    assert first_get.json()["is_expired"] is True
    assert first_get.json()["session_status"] == "COMPLETED"
    assert first_get.json()["readonly"] is True
    assert first_get.json()["stop_reason"] == "exam_timeout"
