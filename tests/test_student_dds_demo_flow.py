"""The lobby's demo launch must produce a usable, isolated DDS session."""

import uuid
from datetime import datetime
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.main import app
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import ExamSession
from backend.models.domain_04 import IncidentCard
from backend.schemas.dds_cycle import DispatcherData
from backend.core.dds_cycle import build_incoming_card
from tests.conftest import create_user_and_token


async def _ensure_demo_ticket(db_session):
    card = build_incoming_card(
        category="Пожары",
        plot="Учебный пожар",
        etalon_services=["01 Пожарные", "02 Полиция"],
        ground_truth={"fio": "Иван Иванов", "phone": "+79991234567", "address": "ул. Ленина, 1"},
    )
    ticket = ScenarioTicket(
        title="Демо билет",
        category="Пожары",
        content={"incoming_card": card},
        workflow_state={"status": "APPROVED"},
    )
    db_session.add(ticket)
    await db_session.commit()
    return ticket


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/v1/sessions/demo", "/api/v2/sessions/demo"])
async def test_lobby_demo_card_actions_finish_and_reload(path, cadet_auth_client, db_session):
    await _ensure_demo_ticket(db_session)
    launched = await cadet_auth_client.post(path, json={"target_role": "DISPATCHER_DDS"})
    assert launched.status_code == 200, launched.text
    launch = launched.json()
    query = parse_qs(urlparse(launch["redirect_url"]).query)
    assert urlparse(launch["redirect_url"]).path == "/dds/journal"
    assert "session_id" not in query and "ticket_id" not in query
    assert query["focus_session_id"] == [launch["session_id"]]
    assert query["focus_ticket_id"] == [launch["ticket_id"]]
    state_url = f"/api/dds/sessions/{launch['session_id']}"

    loaded = await cadet_auth_client.get(state_url)
    assert loaded.status_code == 200, loaded.text
    initial = loaded.json()
    assert datetime.fromisoformat(initial["started_at"]).tzinfo is not None
    card = DispatcherData.model_validate(initial["incoming_card"])
    assert card.caller.name and card.caller.address and card.phones.aon
    assert initial["ticket_id"] == launch["ticket_id"]
    assert initial["score"] is None
    assert initial["actions"] == []
    assignments = await cadet_auth_client.get("/api/dds/assignments")
    assert assignments.status_code == 200
    assert initial in assignments.json()

    session = await db_session.get(ExamSession, launch["session_id"])
    stored_card = await db_session.get(IncidentCard, initial["card_id"])
    assert session.ticket_id == stored_card.scenario_id == launch["ticket_id"]

    action = {"request_id": str(uuid.uuid4()), "kind": "status",
              "service_name": card.services[0].name, "status": "Принята", "order_number": "Н-101"}
    saved = await cadet_auth_client.post(state_url + "/actions", json=action)
    assert saved.status_code == 200, saved.text
    retry = await cadet_auth_client.post(state_url + "/actions", json=action)
    assert retry.status_code == 200, retry.text
    assert len(retry.json()["actions"]) == 1
    dispatched = await cadet_auth_client.post(state_url + "/actions", json={
        "request_id": str(uuid.uuid4()), "kind": "dispatch", "service_name": card.services[0].name,
        "who_accepted": "Учебный дежурный", "summary": "Учебный вызов принят",
    })
    assert dispatched.status_code == 200, dispatched.text
    assert len(dispatched.json()["actions"]) == 2
    for stage in ["Начало реагирования", "Прибытие", "Проведение работ", "Работы завершены"]:
        saved = await cadet_auth_client.post(state_url + "/actions", json={
            "request_id": str(uuid.uuid4()), "kind": "status", "service_name": card.services[0].name, "status": stage,
            "order_number": "Н-101",
        })
        assert saved.status_code == 200, saved.text
    for service in card.services[1:]:
        saved = await cadet_auth_client.post(state_url + "/actions", json={
            "request_id": str(uuid.uuid4()), "kind": "status", "service_name": service.name,
            "status": "Не принята", "comment": "Учебный сценарий: не входит в компетенцию службы",
            "order_number": "Н-101",
        })
        assert saved.status_code == 200, saved.text
    finished = await cadet_auth_client.post(state_url + f"/cards/{initial['card_id']}/complete",
                                            json={"request_id": str(uuid.uuid4())})
    assert finished.status_code == 200, finished.text
    assert finished.json()["session_status"] == "COMPLETED"
    assert finished.json()["submitted_at"]
    assert finished.json()["score"] is None
    reloaded = await cadet_auth_client.get(state_url)
    assert reloaded.json() == finished.json()
    assert reloaded.json()["incoming_card"] == initial["incoming_card"]


@pytest.mark.asyncio
async def test_demo_isolation_and_legacy_mutations_remain_blocked(cadet_auth_client, db_session):
    await _ensure_demo_ticket(db_session)
    launch = (await cadet_auth_client.post("/api/v1/sessions/demo", json={})).json()
    state_url = f"/api/dds/sessions/{launch['session_id']}"
    own = await cadet_auth_client.get(state_url)
    assert own.status_code == 200, own.text
    _, _, headers = await create_user_and_token("CADET")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as other:
        assert (await other.get(state_url)).status_code == 403
        assert (await other.post(state_url + "/finish", json={})).status_code == 403
        action = {"request_id": str(uuid.uuid4()), "kind": "status", "service_name": "01 Пожарные", "status": "Принята", "order_number": "Н-101"}
        assert (await other.post(state_url + "/actions", json=action)).status_code == 403
        assignments = await other.get("/api/dds/assignments")
        assert launch["session_id"] not in [item["session_id"] for item in assignments.json()]
    legacy = await cadet_auth_client.post(f"/api/v2/sessions/{launch['session_id']}/message", json={"text": "test"})
    assert legacy.status_code == 409
    stored = (await db_session.scalars(
        select(IncidentCard).where(IncidentCard.session_id == launch["session_id"])
    )).one()
    blocked = await cadet_auth_client.post(f"/api/dds/cards/{stored.card_id}/action", json={"service_name": "01 Пожарные", "status": "Принята"})
    assert blocked.status_code == 409


@pytest.mark.asyncio
async def test_teacher_can_open_own_dds_demo(teacher_auth_client, db_session):
    await _ensure_demo_ticket(db_session)
    launch = await teacher_auth_client.post("/api/v1/sessions/demo", json={})
    assert launch.status_code == 200, launch.text
    state = await teacher_auth_client.get(f"/api/dds/sessions/{launch.json()['session_id']}")
    assert state.status_code == 200, state.text
