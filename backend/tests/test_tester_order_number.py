"""Tester FIX-09: order number validation on DDS status confirmation.

Contract:
- kind=status requires non-empty trimmed order_number (missing/empty/whitespace -> 422 DDS_ORDER_NUMBER_REQUIRED).
- Invalid status action does not mutate session actions or card services.
- Valid status action trims order_number.
- Legacy replay of an action saved with order_number=None succeeds idempotently before validation.
- Refusal preserves both order_number and comment requirement.
- kind=dispatch is independent of order_number rules.
"""
import uuid
import pytest
from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models.domain_03 import ExamSession
from backend.models.domain_04 import IncidentCard
from backend.tests.test_worker2_lessons_assignment import api_request, make_action, setup_test_environment


async def started_lesson():
    env = await setup_test_environment(n_cadets=1)
    response = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id": env["group_id"], "ticket_id": env["ticket_id"],
        "target_role": "DISPATCHER_DDS", "mode": "TRAINING",
    })
    assert response.status_code == 201, response.text
    lesson_id = response.json()["id"]
    started = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert started.status_code == 200, started.text
    async with AsyncSessionLocal() as db:
        session = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        return env, lesson_id, session.session_id


@pytest.mark.asyncio
@pytest.mark.parametrize("blank_order", [None, "", "   ", "\t\n"])
async def test_status_action_rejects_missing_or_blank_order_number_without_mutation(blank_order):
    env, _, sid = await started_lesson()
    cadet = env["cadets"][0]
    prefix = f"/api/dds/sessions/{sid}"

    payload = make_action(service_name="01 Пожарные", status_val="Принята")
    if blank_order is None:
        payload.pop("order_number", None)
    else:
        payload["order_number"] = blank_order

    res = await api_request("POST", f"{prefix}/actions", cadet, json=payload)
    assert res.status_code == 422, res.text
    assert res.json().get("detail", {}).get("code") == "DDS_ORDER_NUMBER_REQUIRED"

    state = (await api_request("GET", prefix, cadet)).json()
    assert len(state["actions"]) == 0
    # Service status must not have changed
    svc = next(s for s in state["incoming_card"]["services"] if s["name"] == "01 Пожарные")
    assert svc["status"] == "Получена службой"


@pytest.mark.asyncio
async def test_status_action_saves_trimmed_order_number():
    env, _, sid = await started_lesson()
    cadet = env["cadets"][0]
    prefix = f"/api/dds/sessions/{sid}"

    payload = make_action(service_name="01 Пожарные", status_val="Принята")
    payload["order_number"] = "   П-101-А   "

    res = await api_request("POST", f"{prefix}/actions", cadet, json=payload)
    assert res.status_code == 200, res.text
    saved_action = res.json()["actions"][-1]
    assert saved_action["order_number"] == "П-101-А"

    state = (await api_request("GET", prefix, cadet)).json()
    assert state["actions"][-1]["order_number"] == "П-101-А"

    replay = await api_request("POST", f"{prefix}/actions", cadet, json=payload)
    assert replay.status_code == 200, replay.text
    assert len(replay.json()["actions"]) == 1


@pytest.mark.asyncio
async def test_legacy_replay_with_null_order_number_succeeds_idempotently():
    env, _, sid = await started_lesson()
    cadet = env["cadets"][0]
    prefix = f"/api/dds/sessions/{sid}"

    # Pre-seed a legacy action directly in dynamic_state with order_number=None
    req_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, sid)
        state_data = dict(session.dynamic_state)
        dds_data = dict(state_data.get("dds", {}))
        card_id = dds_data.get("card_id")
        legacy_action = {
            "request_id": req_id,
            "kind": "status",
            "service_name": "01 Пожарные",
            "actor_id": cadet[0],
            "actor_name": "Cadet",
            "card_id": card_id,
            "status": "Принята",
            "comment": "Legacy save",
            "order_number": None,
            "at": "2026-10-18T10:00:00Z",
        }
        dds_data["actions"] = [legacy_action]
        state_data["dds"] = dds_data
        session.dynamic_state = state_data
        card = await db.get(IncidentCard, card_id)
        card.assigned_services = {"01 Пожарные": {"status": "Принята", "history": []}}
        await db.commit()

    # Replay identical legacy payload without order_number
    replay_payload = {
        "request_id": req_id,
        "kind": "status",
        "service_name": "01 Пожарные",
        "status": "Принята",
        "comment": "Legacy save",
        "order_number": None,
    }
    replay_res = await api_request("POST", f"{prefix}/actions", cadet, json=replay_payload)
    assert replay_res.status_code == 200, replay_res.text
    assert len(replay_res.json()["actions"]) == 1
    assert replay_res.json()["actions"][0]["order_number"] is None


@pytest.mark.asyncio
async def test_refusal_requires_both_order_number_and_reason():
    env, _, sid = await started_lesson()
    cadet = env["cadets"][0]
    prefix = f"/api/dds/sessions/{sid}"

    # Missing order_number
    res1 = await api_request("POST", f"{prefix}/actions", cadet, json={
        "request_id": str(uuid.uuid4()), "kind": "status",
        "service_name": "01 Пожарные", "status": "Не принята",
        "comment": "Не наша компетенция", "order_number": "",
    })
    assert res1.status_code == 422, res1.text
    assert res1.json().get("detail", {}).get("code") == "DDS_ORDER_NUMBER_REQUIRED"

    # Missing comment
    res2 = await api_request("POST", f"{prefix}/actions", cadet, json={
        "request_id": str(uuid.uuid4()), "kind": "status",
        "service_name": "01 Пожарные", "status": "Не принята",
        "comment": "   ", "order_number": "П-999",
    })
    assert res2.status_code == 200, res2.text
    assert res2.json()["last_attempt"]["accepted"] is False
    assert res2.json()["last_attempt"]["reason"] == "refusal"

    # Valid with both
    res3 = await api_request("POST", f"{prefix}/actions", cadet, json={
        "request_id": str(uuid.uuid4()), "kind": "status",
        "service_name": "01 Пожарные", "status": "Не принята",
        "comment": "Не профильный вызов", "order_number": "П-999",
    })
    assert res3.status_code == 200, res3.text
    assert res3.json()["actions"][-1]["status"] == "Не принята"
    assert res3.json()["actions"][-1]["order_number"] == "П-999"


@pytest.mark.asyncio
async def test_dispatch_action_does_not_require_order_number():
    env, _, sid = await started_lesson()
    cadet = env["cadets"][0]
    prefix = f"/api/dds/sessions/{sid}"

    # First accept the service with valid order number
    accept_res = await api_request("POST", f"{prefix}/actions", cadet, json=make_action(
        service_name="01 Пожарные", status_val="Принята",
    ))
    assert accept_res.status_code == 200, accept_res.text

    called = await api_request("POST", f"{prefix}/phone", cadet, json={
        "request_id": str(uuid.uuid4()), "card_id": accept_res.json()["card_id"], "operation": "dial",
        "service_name": "01 Пожарные", "number": "7000",
    })
    assert called.json()["last_attempt"]["accepted"]
    # Dispatch action without order_number
    disp_res = await api_request("POST", f"{prefix}/actions", cadet, json={
        "request_id": str(uuid.uuid4()),
        "kind": "dispatch",
        "service_name": "01 Пожарные",
        "who_accepted": "Начальник бригады Иванов Иван Иванович",
        "summary": "Бригада направлена на автоцистерне",
    })
    assert disp_res.status_code == 200, disp_res.text
    actions = disp_res.json()["actions"]
    assert len(actions) == 2
    assert actions[-1]["kind"] == "dispatch"
    assert actions[-1]["who_accepted"] == "Начальник бригады Иванов Иван Иванович"
