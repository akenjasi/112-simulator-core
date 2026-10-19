"""Independent handoff contract: teacher lesson -> cadet -> saved work -> teacher.

The activity assertions intentionally expose the current missing live-monitor signal.
Do not change these tests to hide a failure while implementing the Gemini brief.
"""

from datetime import datetime

import pytest

from tests.test_dds_cycle_acceptance import request
from tests.test_dds_queue import act, base, complete, exercise, launch, ready


def own_student(payload, cadet):
    return next(person for person in payload["students"] if person["cadet_id"] == cadet[0])


def same_instant(actual, expected):
    assert actual, "Teacher monitor last_activity is missing despite saved DDS actions"
    assert datetime.fromisoformat(actual.replace("Z", "+00:00")) == datetime.fromisoformat(expected.replace("Z", "+00:00"))


@pytest.mark.asyncio
async def test_teacher_cards_reach_only_assigned_cadets_and_saved_actions_reach_teacher():
    users, tickets = await exercise(n=2, count=2)
    lesson, states = await launch(users, tickets)
    first, second = states
    cadet = users["cadets"][0]
    assert first["incoming_card"]["caller"]["address"] == "Учебная улица, 1"
    assert first["ticket_id"] == tickets[0]
    assert first["lesson_id"] == lesson
    assert first["session_id"] != second["session_id"]

    saved = await act(first, cadet, comment="Учебная бригада уведомлена")
    assert saved.status_code == 200, saved.text
    actions = saved.json()["actions"]
    assert len(actions) == 1

    # A new request/session must read persisted data, not an in-memory console draft.
    restored = await request("GET", base(first), cadet)
    assert restored.json()["actions"] == actions
    monitor = await request("GET", f"/api/v1/lessons/{lesson}", users["teacher"])
    person = own_student(monitor.json(), cadet)
    assert person["tickets"][0]["actions"] == actions
    assert person["tickets"][0]["card_id"] == first["card_id"]
    assert person["progress"] == 0  # Saved activity does not mean a closed card.
    assert person["score"] is None
    assert own_student(monitor.json(), users["cadets"][1])["tickets"][0]["actions"] == []
    for outsider in [users["cadets"][1], users["outsider"], users["other"]]:
        assert (await request("GET", base(first), outsider)).status_code == 403
    assert (await request("GET", f"/api/v1/lessons/{lesson}", users["other"])).status_code == 403

    # Both lists must reference the same attempt and card as the teacher monitor.
    assigned = await request("GET", "/api/dds/assignments", cadet)
    own = next(item for item in assigned.json() if item["lesson_id"] == lesson)
    assert own["session_id"] == first["session_id"] and own["card_id"] == first["card_id"]
    assert own["actions"] == actions
    assert "HIDDEN_ETALON" not in assigned.text


@pytest.mark.asyncio
async def test_closing_card_advances_same_lesson_for_cadet_and_teacher_then_stop_preserves_work():
    users, tickets = await exercise(n=2, count=2)
    lesson, states = await launch(users, tickets)
    first, cadet = states[0], users["cadets"][0]
    finished_card = await ready(first, cadet)
    advanced_response = await complete(first, cadet)
    assert advanced_response.status_code == 200, advanced_response.text
    advanced = advanced_response.json()
    assert advanced["session_id"] == first["session_id"]
    assert advanced["ticket_id"] == tickets[1] and advanced["card_id"] != first["card_id"]
    assert advanced["incoming_card"]["caller"]["address"] == "Учебная улица, 2"
    monitor = (await request("GET", f"/api/v1/lessons/{lesson}", users["teacher"])).json()
    person = own_student(monitor, cadet)
    assert person["progress"] == 50
    assert [ticket["status"] for ticket in person["tickets"]] == ["ungraded", "in_progress"]
    assert person["tickets"][0]["actions"] == finished_card["actions"]
    assert person["tickets"][1]["card_id"] == advanced["card_id"]
    assert own_student(monitor, users["cadets"][1])["progress"] == 0

    stopped = await request("POST", f"/api/v1/lessons/{lesson}/stop", users["teacher"])
    assert stopped.status_code == 200, stopped.text
    person = own_student(stopped.json(), cadet)
    assert person["status"] == "INCOMPLETE" and person["progress"] == 50
    assert person["tickets"][0]["actions"] == finished_card["actions"]
    restored = (await request("GET", base(first), cadet)).json()
    assert restored["readonly"] and restored["session_status"] == "COMPLETED"
    assert restored["submitted_at"] is None
    assert (await act(advanced, cadet)).status_code == 409
    history = await request("GET", "/api/dds/assignments?include_history=true", cadet)
    closed = next(item for item in history.json() if item["card_id"] == first["card_id"])
    assert closed["actions"] == finished_card["actions"]


@pytest.mark.asyncio
async def test_teacher_activity_updates_before_card_completion():
    users, tickets = await exercise(n=1, count=3)
    lesson, states = await launch(users, tickets)
    cadet = users["cadets"][0]
    saved = await act(states[0], cadet, comment="Заявка принята, работа начата")
    assert saved.status_code == 200, saved.text
    monitor = await request("GET", f"/api/v1/lessons/{lesson}", users["teacher"])
    person = own_student(monitor.json(), cadet)
    assert person["progress"] == 0 and person["score"] is None
    same_instant(person["last_activity"], saved.json()["actions"][-1]["at"])


@pytest.mark.asyncio
async def test_teacher_activity_survives_transition_and_teacher_stop():
    users, tickets = await exercise(n=1, count=2)
    lesson, states = await launch(users, tickets)
    cadet = users["cadets"][0]
    finished = await ready(states[0], cadet)
    expected = finished["actions"][-1]["at"]
    assert (await complete(states[0], cadet)).status_code == 200
    for endpoint in [f"/api/v1/lessons/{lesson}", "/api/v1/lessons"]:
        monitor = (await request("GET", endpoint, users["teacher"])).json()
        payload = next(item for item in monitor if item["id"] == lesson) if isinstance(monitor, list) else monitor
        same_instant(own_student(payload, cadet)["last_activity"], expected)
    stopped = await request("POST", f"/api/v1/lessons/{lesson}/stop", users["teacher"])
    same_instant(own_student(stopped.json(), cadet)["last_activity"], expected)
