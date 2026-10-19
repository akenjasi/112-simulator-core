"""Integration contract between ordered DDS cards and teacher grading."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone

from backend.database import AsyncSessionLocal
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import ExamSession
from backend.tests.test_dds_queue import exercise, launch, act, ready, complete
from backend.tests.test_dds_cycle_acceptance import request


async def test_grade_completed_card_before_queue_finishes_without_touching_next_card():
    users, ids = await exercise(n=1, count=2)
    lesson, states = await launch(users, ids)
    first = states[0]
    await ready(first, users["cadets"][0])
    response = await complete(first, users["cadets"][0])
    assert response.status_code == 200, response.text
    second = response.json()
    assert second["card_id"] != first["card_id"]
    path = f"/api/v1/analytics/records/{first['card_id']}"
    response = await request("GET", path, users["teacher"])
    assert response.status_code == 200, response.text
    before = response.json()
    assert len(before["cadet_actions"]) == 6
    assert before["incident_context"]["description"] == first["incoming_card"]["description"]
    for alias in (first["card_id"],):
        changed = await request("POST", f"/api/v1/analytics/records/{alias}/grade-override", users["teacher"],
                                json={"status": "passed", "score": 73.5, "reason": "Проверена первая карточка"})
        assert changed.status_code == 200, changed.text
    response = await request("GET", path, users["teacher"])
    assert response.json()["status"] == "passed"
    assert response.json()["expert_score"] == 73.5
    response = await request("GET", f"/api/v1/analytics/records/{second['card_id']}", users["teacher"])
    assert response.status_code == 200, response.text
    assert response.json()["score"] is None
    assert response.json()["cadet_actions"] == []
    history = await request("GET", f"/api/v1/lessons/{lesson}", users["teacher"])
    attempts = history.json()["students"][0]["tickets"]
    assert attempts[0]["status"] == "passed"
    assert attempts[0]["record_id"]
    assert attempts[0]["score"] == 73.5
    assert attempts[1]["score"] is None


async def test_queue_keeps_historical_context_and_individual_exam_assignment():
    users, ids = await exercise(n=2, count=2)
    response = await request("POST", "/api/v1/lessons", users["teacher"], json={
        "group_id": users["group_id"], "ticket_ids": ids, "target_role": "DISPATCHER_DDS",
        "cadet_id": users["cadets"][0][0], "mode": "EXAM", "time_limit_seconds": 300,
    })
    assert response.status_code == 201, response.text
    lesson = response.json()["id"]
    assert response.json()["mode"] == "EXAM"
    response = await request("POST", f"/api/v1/lessons/{lesson}/start", users["teacher"])
    assert response.status_code == 200, response.text
    assert len(response.json()["students"]) == 1
    response = await request("GET", "/api/dds/assignments", users["cadets"][0])
    first = next(item for item in response.json() if item["lesson_id"] == lesson)
    await ready(first, users["cadets"][0])
    response = await complete(first, users["cadets"][0])
    assert response.status_code == 200, response.text
    second = response.json()
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, first["session_id"])
        session.start_time = datetime.now(timezone.utc) - timedelta(hours=1)
        ticket = await db.get(ScenarioTicket, ids[0])
        content = deepcopy(ticket.content)
        content["incoming_card"]["description"] = "Изменено после прохождения"
        ticket.content = content
        await db.commit()
    # Exam timing starts with each new card, not the beginning of the queue.
    assert (await act(second, users["cadets"][0])).status_code == 200
    response = await request("GET", f"/api/v1/analytics/records/{first['card_id']}", users["teacher"])
    assert response.status_code == 200, response.text
    assert response.json()["incident_context"]["description"] == first["incoming_card"]["description"]


async def test_assigned_queue_rejects_a_draft_even_when_other_ticket_is_approved():
    users, ids = await exercise(n=1, count=2)
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, ids[1])
        ticket.workflow_state = {"status": "UNDER_REVIEW"}
        await db.commit()
    response = await request("POST", "/api/v1/lessons", users["teacher"], json={
        "group_id": users["group_id"], "ticket_ids": ids, "target_role": "DISPATCHER_DDS"})
    assert response.status_code == 409, response.text
