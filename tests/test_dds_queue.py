"""Acceptance for the ordered DDS workflow; synthetic data and independent API assertions."""
import asyncio
from copy import deepcopy
from datetime import datetime
import uuid

import pytest
from sqlalchemy import func, select

from backend.database import AsyncSessionLocal, engine
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult
from tests.test_dds_cycle_acceptance import INCOMING, request, setup_group


async def exercise(n=2, count=3):
    users = await setup_group(n)
    ids = []
    async with AsyncSessionLocal() as db:
        for index in range(count):
            card = deepcopy(INCOMING)
            card["description"] = f"QUEUE-{uuid.uuid4().hex}-{index}"
            card["caller"]["address"] = f"Учебная улица, {index + 1}"
            card["incident"]["number"] = f"QUEUE-{index}"
            ticket = ScenarioTicket(title=f"Упражнение {index}", content={"incoming_card": card},
                                    ground_truth={"HIDDEN_ETALON": "secret"}, workflow_state={"status": "APPROVED"})
            db.add(ticket)
            ids.append(ticket.scenario_id)
        await db.commit()
    return users, ids


async def launch(users, ids):
    response = await request("POST", "/api/v1/lessons", users["teacher"], json={
        "group_id": users["group_id"], "ticket_ids": ids, "target_role": "DISPATCHER_DDS"})
    assert response.status_code == 201, response.text
    lesson = response.json()["id"]
    assert response.json()["ticket_ids"] == ids
    started = await request("POST", f"/api/v1/lessons/{lesson}/start", users["teacher"])
    assert started.status_code == 200, started.text
    states = []
    for cadet in users["cadets"]:
        response = await request("GET", "/api/dds/assignments", cadet)
        assert response.status_code == 200, response.text
        states.append(next(item for item in response.json() if item["lesson_id"] == lesson))
    return lesson, states


def base(state):
    return f"/api/dds/sessions/{state['session_id']}"


async def act(state, user, *, kind="status", status="Принята", **extra):
    payload = {"card_id": state["card_id"], "request_id": str(uuid.uuid4()),
               "kind": kind, "service_name": "Аварийная служба"}
    if kind == "status":
        payload["status"] = status
    else:
        payload.update(who_accepted="Начальник учебной бригады", summary="Бригада направлена по адресу")
    payload.update(extra)
    return await request("POST", base(state) + "/actions", user, json=payload)


async def ready(state, user):
    accepted = await act(state, user)
    assert accepted.status_code == 200, accepted.text
    dispatch = await act(state, user, kind="dispatch")
    assert dispatch.status_code == 200, dispatch.text
    for status in ["Начало реагирования", "Прибытие", "Проведение работ", "Работы завершены"]:
        response = await act(state, user, status=status)
        assert response.status_code == 200, response.text
    assert response.json()["can_complete"] is True
    return response.json()


async def complete(state, user, key=None):
    return await request("POST", base(state) + f"/cards/{state['card_id']}/complete", user,
                         json={"request_id": key or str(uuid.uuid4())})


@pytest.mark.asyncio
async def test_two_cadets_complete_three_distinct_cards_in_one_session_each():
    users, ids = await exercise()
    lesson, states = await launch(users, ids)
    assert states[0]["session_id"] != states[1]["session_id"]
    for index, user in enumerate(users["cadets"]):
        current = states[index]
        session_id = current["session_id"]
        previous_received = None
        for position, ticket_id in enumerate(ids):
            assert current["ticket_id"] == ticket_id
            assert current["current_index"] == position and current["total_cards"] == 3
            assert current["completed_cards"] == position
            assert current["session_id"] == session_id and current["actions"] == []
            assert current["incoming_card"]["caller"]["address"] == f"Учебная улица, {position + 1}"
            received = datetime.fromisoformat(current["received_at"])
            if previous_received:
                assert received > previous_received
            previous_received = received
            original = deepcopy(current["incoming_card"])
            ready_state = await ready(current, user)
            assert ready_state["incoming_card"] == original
            assert all(a["card_id"] == current["card_id"] and a["actor_id"] == user[0]
                       and a["actor_name"] for a in ready_state["actions"])
            done = await complete(current, user)
            assert done.status_code == 200, done.text
            current = done.json()
            assert current["completed_cards"] == position + 1
            if position < 2:
                assert current["session_status"] == "ACTIVE" and current["submitted_at"] is None
                assert current["card_id"] != states[index]["card_id"]
            else:
                assert current["session_status"] == "COMPLETED" and current["submitted_at"]
                assert current["readonly"] and current["score"] is None
        if index == 0:
            untouched = await request("GET", base(states[1]), users["cadets"][1])
            assert untouched.json()["current_index"] == 0 and untouched.json()["actions"] == []
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == lesson)) == 2
        for state in states:
            cards = (await db.scalars(select(IncidentCard).where(IncidentCard.session_id == state["session_id"]))).all()
            assert len(cards) == 3 and all(card.status == "Отработана" for card in cards)
            results = (await db.scalars(select(TicketResult).where(TicketResult.session_id == state["session_id"]))).all()
            assert len(results) == 3 and all(row.score_total is None and row.status == "ungraded" for row in results)


@pytest.mark.asyncio
async def test_future_snapshots_hidden_and_frozen_before_activation_reload_and_history():
    users, ids = await exercise()
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    async with AsyncSessionLocal() as db:
        future = await db.get(ScenarioTicket, ids[1])
        expected = deepcopy(future.content["incoming_card"])
        future.content = {"incoming_card": {**expected, "description": "CHANGED-AFTER-START"}}
        future.is_deleted = True
        await db.commit()
    for response in [await request("GET", base(current), user),
                     await request("GET", "/api/dds/assignments", user)]:
        assert expected["description"] not in response.text and "HIDDEN_ETALON" not in response.text
        assert "queue" not in response.json() if isinstance(response.json(), dict) else True
    saved = await ready(current, user)
    next_card = await complete(current, user)
    assert next_card.json()["incoming_card"]["description"] == expected["description"]
    # A fresh connection pool reconstructs the same persisted queue and timestamps.
    await engine.dispose()
    reloaded = await request("GET", base(current), user)
    assert reloaded.json() == next_card.json()
    history = await request("GET", base(current) + f"/cards/{current['card_id']}", user)
    assert history.status_code == 200, history.text
    assert history.json()["readonly"] and history.json()["actions"] == saved["actions"]
    assert history.json()["incoming_card"] == current["incoming_card"]
    assert history.json()["can_complete"] is False
    assert len(history.json()["cards"]) == 2
    assert history.json()["cards"][-1]["card_id"] == next_card.json()["card_id"]
    assert (await request("GET", base(current), user)).json()["card_id"] == next_card.json()["card_id"]
    # Generic session/card aliases must not expose the internal future queue or mutate its current card.
    assert (await request("GET", f"/api/v2/sessions/{current['session_id']}", user)).status_code == 409
    assert (await request("GET", base(current) + f"/cards/{uuid.uuid4()}", user)).status_code == 404
    legacy = await request("POST", f"/api/dds/cards/{next_card.json()['card_id']}/action", user,
                           json={"service_name": "Аварийная служба", "status": "Принята"})
    assert legacy.status_code == 409


@pytest.mark.asyncio
async def test_completion_requires_final_status_and_dispatch_before_final_transition():
    users, ids = await exercise(n=1)
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    blocked = await complete(current, user)
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "DDS_CARD_NOT_READY"
    for status in ["Принята", "Начало реагирования", "Прибытие", "Проведение работ"]:
        assert (await act(current, user, status=status)).status_code == 200
    response = await act(current, user, status="Работы завершены")
    assert response.status_code == 409 and response.json()["detail"]["code"] == "DDS_DISPATCH_REQUIRED"
    assert (await act(current, user, kind="dispatch", who_accepted=" ")).status_code == 422
    assert (await act(current, user, kind="dispatch")).status_code == 200
    assert (await act(current, user, status="Работы завершены")).status_code == 200
    assert (await complete(current, user)).json()["current_index"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["Не принята", "Отказ от выполнения работ"])
async def test_motivated_refusal_can_close_card_without_dispatch(status):
    users, ids = await exercise(n=1)
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    if status == "Отказ от выполнения работ":
        assert (await act(current, user)).status_code == 200
    assert (await act(current, user, status=status, comment=" ")).status_code == 422
    assert (await act(current, user, status=status, comment="Вне зоны ответственности службы")).status_code == 200
    assert (await complete(current, user)).json()["current_index"] == 1


@pytest.mark.asyncio
async def test_concurrent_close_retries_stale_card_actions_and_request_conflicts():
    users, ids = await exercise(n=1)
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    missing = await act(current, user, card_id=None)
    assert missing.status_code == 409
    saved = await ready(current, user)
    key = str(uuid.uuid4())
    responses = await asyncio.gather(*(complete(current, user, key) for _ in range(3)))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
    assert all(r.json()["current_index"] == 1 for r in responses)
    next_card = responses[0].json()
    assert (await act(current, user)).status_code == 409
    old_action = saved["actions"][0]
    replay = {k: v for k, v in old_action.items() if k not in ("actor_id", "actor_name", "at")}
    response = await request("POST", base(current) + "/actions", user, json=replay)
    assert response.status_code == 200 and response.json()["actions"] == []
    assert (await act(next_card, user, request_id=old_action["request_id"])).status_code == 409
    assert (await complete(next_card, user, key)).status_code == 409
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(IncidentCard).where(IncidentCard.session_id == current["session_id"])) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["read", "history", "action", "complete", "finish"])
async def test_queue_ownership_and_teacher_cannot_act_as_cadet(operation):
    users, ids = await exercise()
    _, states = await launch(users, ids)
    current = states[0]
    for forbidden in [users["cadets"][1], users["outsider"], users["other"], users["teacher"]]:
        if operation in ("read", "history") and forbidden == users["teacher"]:
            continue
        if operation == "read":
            response = await request("GET", base(current), forbidden)
        elif operation == "history":
            response = await request("GET", base(current) + f"/cards/{current['card_id']}", forbidden)
        elif operation == "action":
            response = await act(current, forbidden)
        elif operation == "complete":
            response = await complete(current, forbidden)
        else:
            response = await request("POST", base(current) + "/finish", forbidden, json={})
        assert response.status_code == 403, response.text
    restored = await request("GET", base(current), users["cadets"][0])
    assert restored.json()["actions"] == [] and restored.json()["current_index"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("by_teacher", [False, True])
async def test_early_stop_preserves_completed_card_and_never_marks_queue_submitted(by_teacher):
    users, ids = await exercise(n=1)
    lesson, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    await ready(current, user)
    following = (await complete(current, user)).json()
    if by_teacher:
        response = await request("POST", f"/api/v1/lessons/{lesson}/stop", users["teacher"])
    else:
        response = await request("POST", base(current) + "/finish", user, json={})
    assert response.status_code == 200, response.text
    stopped = (await request("GET", base(current), user)).json()
    assert stopped["submitted_at"] is None and stopped["completed_cards"] == 1
    assert stopped["stop_reason"] == ("teacher" if by_teacher else "cadet")
    assert stopped["readonly"] and stopped["score"] is None
    assert (await complete(following, user)).status_code == 409
    assert (await act(following, user)).status_code == 409
    assert (await request("GET", base(current) + f"/cards/{current['card_id']}", user)).json()["actions"]


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["empty", "duplicate", "missing", "malformed", "conflicting"])
async def test_invalid_pool_is_rejected_without_partial_assignment(invalid):
    users, ids = await exercise(n=1)
    pools = {"empty": [], "duplicate": [ids[0], ids[0]], "missing": [ids[0], str(uuid.uuid4())],
             "malformed": [ids[0], users["bad_ticket_id"]], "conflicting": ids}
    payload = {"group_id": users["group_id"], "ticket_ids": pools[invalid]}
    if invalid == "conflicting":
        payload["ticket_id"] = ids[0]
    response = await request("POST", "/api/v1/lessons", users["teacher"], json=payload)
    assert response.status_code in (409, 422), response.text
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(Assignment).where(Assignment.group_id == users["group_id"])) == 0


@pytest.mark.asyncio
async def test_start_is_atomic_and_idempotent_after_source_changes():
    users, ids = await exercise(n=1)
    response = await request("POST", "/api/v1/lessons", users["teacher"], json={
        "group_id": users["group_id"], "ticket_ids": ids})
    lesson = response.json()["id"]
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, ids[-1])
        ticket.is_deleted = True
        await db.commit()
    assert (await request("POST", f"/api/v1/lessons/{lesson}/start", users["teacher"])).status_code == 409
    async with AsyncSessionLocal() as db:
        assert (await db.get(Assignment, lesson)).status == "WAITING"
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == lesson)) == 0
        ticket = await db.get(ScenarioTicket, ids[-1])
        ticket.is_deleted = False
        await db.commit()
    assert (await request("POST", f"/api/v1/lessons/{lesson}/start", users["teacher"])).status_code == 200
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, ids[-1])
        ticket.is_deleted = True
        await db.commit()
    assert (await request("POST", f"/api/v1/lessons/{lesson}/start", users["teacher"])).status_code == 200
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == lesson)) == 1


@pytest.mark.asyncio
async def test_self_training_catalog_filters_draft_protection_and_idempotent_launch():
    users, ids = await exercise(n=1)
    user = users["cadets"][0]
    async with AsyncSessionLocal() as db:
        draft = ScenarioTicket(title="UNPUBLISHED-DRAFT", content={"incoming_card": INCOMING},
                               workflow_state={"status": "draft"})
        db.add(draft)
        await db.commit()
        draft_id = draft.scenario_id
    catalog = await request("GET", "/api/dds/training/tickets?category=ЖКХ&complexity=1", user)
    assert catalog.status_code == 200
    assert set(ids).issubset({item["ticket_id"] for item in catalog.json()})
    assert draft_id not in catalog.text and "HIDDEN_ETALON" not in catalog.text
    assert all(set(item) == {"ticket_id", "title", "category", "subcategory", "complexity"} for item in catalog.json())
    payload = {"request_id": str(uuid.uuid4()), "ticket_ids": ids}
    responses = await asyncio.gather(*(request("POST", "/api/dds/training", user, json=payload) for _ in range(2)))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
    assert responses[0].json()["session_id"] == responses[1].json()["session_id"]
    assert responses[0].json()["ticket_id"] == ids[0] and responses[0].json()["total_cards"] == 3
    conflict = await request("POST", "/api/dds/training", user, json={**payload, "ticket_ids": list(reversed(ids))})
    assert conflict.status_code == 409
    for forbidden in [users["teacher"], users["admin"]]:
        assert (await request("POST", "/api/dds/training", forbidden, json=payload)).status_code == 403
    for endpoint in ["/api/v1/sessions/demo", "/api/v2/sessions/demo"]:
        assert (await request("POST", endpoint, user, json={"ticket_id": draft_id})).status_code == 404
    assert (await request("POST", "/api/dds/training", user, json={
        "request_id": str(uuid.uuid4()), "ticket_ids": [ids[0], draft_id]})).status_code == 409
    current = responses[0].json()
    for _ in ids:
        await ready(current, user)
        current = (await complete(current, user)).json()
    assert current["session_status"] == "COMPLETED" and current["lesson_status"] == "COMPLETED"
    replay = await request("POST", "/api/dds/training", user, json=payload)
    assert replay.status_code == 200 and replay.json()["session_id"] == current["session_id"]
    assert replay.json()["completed_cards"] == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["/api/v1/sessions/demo", "/api/v2/sessions/demo"])
async def test_legacy_demo_alias_uses_persistent_queue_and_never_fabricates_a_ticket(endpoint):
    users, ids = await exercise(n=1, count=1)
    user = users["cadets"][0]
    launched = await request("POST", endpoint, user, json={"ticket_id": ids[0]})
    assert launched.status_code == 200, launched.text
    loaded = await request("GET", f"/api/dds/sessions/{launched.json()['session_id']}", user)
    assert loaded.status_code == 200
    current = loaded.json()
    async with AsyncSessionLocal() as db:
        card = await db.get(IncidentCard, current["card_id"])
        marker = await db.scalar(select(TicketResult).where(TicketResult.session_id == current["session_id"]))
        assert card.card_origin == "112_CALL" and marker.status == "active" and marker.score_total is None
    await ready(current, user)
    assert (await complete(current, user)).json()["submitted_at"]
    async with AsyncSessionLocal() as db:
        before = await db.scalar(select(func.count()).select_from(ScenarioTicket))
    # Model an empty/unavailable catalog, regardless of synthetic data from other tests.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr("backend.core.dds_cycle.is_suitable_dds_ticket", lambda ticket: False)
        unavailable = await request("POST", endpoint, user, json={})
    assert unavailable.status_code == 409
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ScenarioTicket)) == before


@pytest.mark.asyncio
async def test_multiple_services_and_concurrent_action_updates_are_not_lost():
    users, ids = await exercise(n=1, count=1)
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, ids[0])
        content = deepcopy(ticket.content)
        content["incoming_card"]["services"].append({"id": "gas", "name": "04 Газ", "status": "Получена службой"})
        ticket.content = content
        await db.commit()
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    assert (await act(current, user)).status_code == 200
    responses = await asyncio.gather(*(act(current, user, comment=f"Дополнение {index}") for index in range(3)))
    assert all(response.status_code == 200 for response in responses)
    restored = (await request("GET", base(current), user)).json()
    assert len(restored["actions"]) == 4
    assert (await act(current, user, status="Отказ от выполнения работ", comment="Нет бригады")).status_code == 200
    blocked = await complete(current, user)
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["blockers"] == [{"code": "DDS_SERVICE_NOT_FINISHED", "service_name": "04 Газ"}]
    assert (await act(current, user, service_name="04 Газ", status="Не принята", comment="Другой район")).status_code == 200
    assert (await complete(current, user)).json()["submitted_at"]


@pytest.mark.asyncio
async def test_concurrent_stop_and_close_do_not_revive_or_skip_cards():
    users, ids = await exercise(n=1)
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    await ready(current, user)
    responses = await asyncio.gather(complete(current, user),
                                    request("POST", base(current) + "/finish", user, json={}))
    assert {response.status_code for response in responses}.issubset({200, 409})
    restored = (await request("GET", base(current), user)).json()
    assert restored["session_status"] == "COMPLETED" and restored["submitted_at"] is None
    assert restored["current_index"] in (0, 1) and restored["completed_cards"] in (0, 1)
    assert restored["readonly"]


@pytest.mark.asyncio
async def test_completed_legacy_session_and_its_history_are_preserved():
    users, ids = await exercise(n=1, count=1)
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    await ready(current, user)
    assert (await complete(current, user)).status_code == 200
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, current["session_id"])
        data = session.dynamic_state["dds"]
        legacy = {key: data[key] for key in ["incoming_card", "card_id", "actions", "submitted_at"]}
        session.dynamic_state = {"dds": legacy}
        await db.commit()
    for _ in range(2):
        loaded = await request("GET", base(current), user)
        assert loaded.status_code == 200 and loaded.json()["readonly"]
        assert loaded.json()["submitted_at"] == legacy["submitted_at"]
        assert loaded.json()["actions"] == legacy["actions"]
    async with AsyncSessionLocal() as db:
        assert (await db.get(ExamSession, current["session_id"])).dynamic_state == {"dds": legacy}


@pytest.mark.asyncio
async def test_legacy_single_card_state_is_read_without_rewriting_and_can_complete():
    users, ids = await exercise(n=1, count=1)
    _, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    # Reproduce a pre-queue persisted session; no backfill/migration is needed to read it.
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, current["session_id"])
        data = session.dynamic_state["dds"]
        legacy = {key: data[key] for key in ["incoming_card", "card_id", "actions", "submitted_at"]}
        session.dynamic_state = {"dds": legacy}
        await db.commit()
    response = await request("GET", base(current), user)
    assert response.status_code == 200 and response.json()["total_cards"] == 1
    async with AsyncSessionLocal() as db:
        assert (await db.get(ExamSession, current["session_id"])).dynamic_state == {"dds": legacy}
    await ready(current, user)
    completed = await complete(current, user)
    assert completed.status_code == 200 and completed.json()["submitted_at"]
    assert completed.json()["readonly"] and completed.json()["score"] is None


@pytest.mark.asyncio
async def test_queue_is_consistent_in_teacher_stats_student_history_and_journal():
    users, ids = await exercise()
    lesson, states = await launch(users, ids)
    current, user = states[0], users["cadets"][0]
    await ready(current, user)
    following = (await complete(current, user)).json()
    teacher = await request("GET", f"/api/v1/lessons/{lesson}", users["teacher"])
    assert teacher.status_code == 200, teacher.text
    person = next(item for item in teacher.json()["students"] if item["cadet_id"] == user[0])
    assert person["progress"] == 33 and person["score"] is None
    assert [ticket["status"] for ticket in person["tickets"]] == ["ungraded", "in_progress", "pending"]
    assert person["tickets"][0]["card_id"] == current["card_id"]
    assert person["tickets"][1]["card_id"] == following["card_id"]
    assert person["tickets"][2]["card_id"] is None and person["tickets"][2]["actions"] == []
    history = await request("GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", user)
    assert history.status_code == 200, history.text
    own = next(item for item in history.json() if item["session_id"] == current["session_id"])
    assert own["score"] is None and len(own["tickets"]) == 3
    assert all(ticket["score"] is None for ticket in own["tickets"])
    stats = await request("GET", "/api/v1/students/me/stats?role=DISPATCHER_DDS", user)
    assert stats.status_code == 200, stats.text
    assert stats.json()["graded_cards"] == 0 and stats.json()["cards_solved"] == 1
    journal = await request("GET", "/api/dds/assignments?include_history=true", user)
    assert journal.status_code == 200, journal.text
    rows = [item for item in journal.json() if item["session_id"] == current["session_id"]]
    assert len(rows) == 2
    assert {row["card_id"] for row in rows} == {current["card_id"], following["card_id"]}
    assert next(row for row in rows if row["card_id"] == current["card_id"])["readonly"]
    assert (await request("POST", f"/api/v1/lessons/{lesson}/stop", users["teacher"])).status_code == 200
    report = await request("GET", f"/api/ai-analytics/lessons/{lesson}/data", users["teacher"])
    assert report.status_code == 200, report.text
    session = next(item for item in report.json()["sessions"] if item["session_id"] == current["session_id"])
    assert session["exercise_status"] == "incomplete" and session["completed_cards"] == 1 and session["total_cards"] == 3
    assert session["ticket_results"][0]["status"] == "ungraded"
    assert session["ticket_results"][0]["score_total"] is None
