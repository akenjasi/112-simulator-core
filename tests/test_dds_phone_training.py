"""Prepared DDS phone acceptance; private synthetic database from conftest."""
from copy import deepcopy
from datetime import timedelta
import uuid
import pytest
from sqlalchemy import select
from backend.database import AsyncSessionLocal
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import ExamSession
from backend.models.domain_04 import TicketResult
from backend.core import dds_exercise as training
from backend.core.dds_report_data import _exercise_protocols
from backend.schemas.dds_exercise import ExercisePlan
from tests.test_dds_queue import exercise, launch, base, act, complete
from tests.test_dds_cycle_acceptance import request


def prepared(services):
    contacts, reports = [], []
    for i, service in enumerate(services):
        contacts.append(dict(id=f"c{i}", service_name=service, number=f"700{i}",
                             full_name="Иванов Иван Иванович", position="Мастер", brigade=str(i+1),
                             reply="Мастер Иванов Иван Иванович, слушаю", dispatch_keywords=["адрес"],
                             audio="/audio/tts/generic_reply.wav"))
        for j, status in enumerate(training.STAGES):
            reports.append(dict(id=f"r{i}-{j}", contact_id=f"c{i}", status=status,
                                text=f"Бригада {i+1}: {status}. Доступ восстановлен.",
                                comment_keywords=["доступ восстановлен"] if j == 3 else []))
    return dict(version=1, source="prepared", contacts=contacts, reports=reports)


async def start(two=False):
    users, ids = await exercise(n=2, count=1)
    services = ["Аварийная служба"]
    if two:
        services.append("Скорая помощь")
        async with AsyncSessionLocal() as db:
            ticket = await db.get(ScenarioTicket, ids[0])
            content = deepcopy(ticket.content)
            content["incoming_card"]["services"].append({"id": "med", "name": services[1]})
            ticket.content = content
            await db.commit()
    plan = prepared(services)
    response = await request("PUT", f"/api/dds/tickets/{ids[0]}/exercise", users["teacher"], json=plan)
    assert response.status_code == 200, response.text
    lesson, states = await launch(users, ids)
    return users, ids, states, plan


async def phone(state, user, operation="dial", **extra):
    return await request("POST", base(state)+"/phone", user, json={
        "request_id": str(uuid.uuid4()), "card_id": state["card_id"], "operation": operation, **extra})


@pytest.mark.asyncio
async def test_complete_two_services_with_evidence_and_corrected_errors(monkeypatch):
    users, ids, states, plan = await start(two=True)
    state, user = states[0], users["cadets"][0]
    clock = [training.now_utc()]
    monkeypatch.setattr(training, "now_utc", lambda: clock[0])
    assert state["exercise"]["source"] == "prepared"
    assert "Доступ восстановлен" not in str(state["exercise"])
    for contact in plan["contacts"]:
        response = await act(state, user, service_name=contact["service_name"])
        assert response.json()["last_attempt"]["accepted"]
        response = await phone(state, user, number=contact["number"], service_name=contact["service_name"])
        assert response.json()["last_attempt"]["accepted"]
        response = await act(state, user, kind="dispatch", service_name=contact["service_name"],
                             who_accepted="Мастер Иванов Иван Иванович", summary="Передан адрес")
        assert response.json()["last_attempt"]["accepted"], response.text
    # No report has been answered: cannot run ahead, cannot close.
    early = await act(state, user, status="Начало реагирования")
    assert early.json()["last_attempt"]["reason"] == "premature"
    assert not early.json()["can_complete"]
    close = await complete(state, user)
    assert close.status_code == 200 and close.json()["last_attempt"]["reason"] == "completion"
    for index, report in enumerate(plan["reports"]):
        clock[0] += timedelta(seconds=3)
        loaded = (await request("GET", base(state), user)).json()
        assert loaded["exercise"]["incoming"]["ringing"] is True
        assert loaded["exercise"]["incoming"]["text"] is None
        answered = await phone(state, user, "answer", report_id=report["id"])
        assert answered.status_code == 200 and answered.json()["exercise"]["incoming"]["text"] == report["text"]
        contact = next(c for c in plan["contacts"] if c["id"] == report["contact_id"])
        if index == 0:
            wrong = await act(state, user, status=report["status"], service_name="Скорая помощь", order_number="2")
            assert wrong.json()["last_attempt"]["reason"] == "wrong_service"
            assert not any(a.get("status") == report["status"] for a in wrong.json()["actions"])
        result = await act(state, user, status=report["status"], service_name=contact["service_name"],
                           order_number=contact["brigade"], comment="Доступ восстановлен")
        assert result.json()["last_attempt"]["accepted"], result.text
    state = result.json()
    assert state["can_complete"]
    done = (await complete(state, user)).json()
    assert done["readonly"] and done["score"] is None
    assert {c["status"] for c in done["criteria"]} == {"completed", "completed_after_correction"}
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, state["session_id"])
        assert len(_exercise_protocols(session.dynamic_state["dds"])) == 1
        saved_result = await db.scalar(select(TicketResult).where(TicketResult.session_id == state["session_id"]))
        assert saved_result.errors_count == 3
        assert saved_result.score_total is None
        assert len(saved_result.error_details["dds_criteria"]) == 5
    other = (await request("GET", base(states[1]), users["cadets"][1])).json()
    assert len(other["exercise"]["events"]) == 1


@pytest.mark.asyncio
async def test_phone_ownership_idempotency_unknown_and_wrong_contact():
    users, ids, states, plan = await start(two=True)
    state, user = states[0], users["cadets"][0]
    for outsider in [None, users["teacher"], users["cadets"][1]]:
        response = await phone(state, outsider, number="7000", service_name="Аварийная служба")
        assert response.status_code in (401, 403)
    await act(state, user)
    wire = {"request_id": "same", "card_id": state["card_id"], "operation": "dial", "number": "999", "service_name": "Аварийная служба"}
    url = base(state)+"/phone"
    bad = await request("POST", url, user, json=wire)
    assert bad.json()["last_attempt"]["reason"] == "unknown_number"
    repeated = await request("POST", url, user, json=wire)
    assert repeated.json()["exercise"]["events"] == bad.json()["exercise"]["events"]
    collision = await request("POST", url, user, json={**wire, "number": "7000"})
    assert collision.status_code == 409
    wrong = await phone(state, user, number="7001", service_name="Аварийная служба")
    assert wrong.json()["last_attempt"]["reason"] == "wrong_contact"
    call = await phone(state, user, number="7000", service_name="Аварийная служба")
    outgoing = call.json()["exercise"]["outgoing"]["Аварийная служба"]
    audio = await phone(state, user, "audio", call_id=outgoing["call_id"], audio_result="unavailable")
    assert audio.json()["exercise"]["events"][-1]["result"] == "unavailable"
    inaccurate = await act(state, user, kind="dispatch", who_accepted="Любой", summary="Любой")
    assert inaccurate.json()["last_attempt"]["reason"] == "record_accuracy"
    early = await phone(state, user, "answer", report_id="r0-0")
    assert early.status_code == 409
    for outsider in [user, None]:
        response = await request("PUT", f"/api/dds/tickets/{ids[0]}/exercise", outsider, json=plan)
        assert response.status_code in (401,403)


@pytest.mark.parametrize("change", ["duplicate", "missing_stage", "empty_result", "external_audio", "limit"])
def test_plan_validation(change):
    plan = prepared(["Аварийная служба"])
    if change == "duplicate": plan["contacts"] *= 2
    if change == "missing_stage": plan["reports"][1]["status"] = "Прибытие"; plan["reports"].pop(0)
    if change == "empty_result": plan["reports"][-1]["comment_keywords"] = []
    if change == "external_audio": plan["contacts"][0]["audio"] = "https://example.org/tracking.wav"
    if change == "limit":
        plan["contacts"] = [{**plan["contacts"][0], "id": str(i), "number": str(i)} for i in range(11)]
    with pytest.raises(ValueError): ExercisePlan.model_validate(plan)


@pytest.mark.asyncio
@pytest.mark.parametrize("seconds, expected", [(30, "completed"), (30.001, "not_completed")])
async def test_confirmation_boundary_is_server_time(monkeypatch, seconds, expected):
    users, ids, states, plan = await start()
    state = states[0]
    instant = training.parse_time(state["received_at"]) + timedelta(seconds=seconds)
    monkeypatch.setattr(training, "now_utc", lambda: instant)
    result = (await act(state, users["cadets"][0])).json()
    criterion = next(c for c in result["criteria"] if c["key"] == "confirmation")
    assert criterion["status"] == expected
    assert criterion["evidence"][0]["seconds"] == seconds


@pytest.mark.asyncio
async def test_rejected_action_retry_after_another_action_keeps_original_outcome():
    users, ids, states, plan = await start()
    state, user = states[0], users["cadets"][0]
    wire = dict(card_id=state["card_id"], request_id="bad-action", kind="status", service_name="Аварийная служба", status="Прибытие")
    first = await request("POST", base(state)+"/actions", user, json=wire)
    assert first.json()["last_attempt"]["accepted"] is False
    await act(state, user)
    repeat = await request("POST", base(state)+"/actions", user, json=wire)
    assert repeat.json()["last_attempt"]["accepted"] is False
    assert repeat.json()["last_attempt"]["request_id"] == "bad-action"
    assert len([e for e in repeat.json()["exercise"]["events"] if e["kind"] == "mistake"]) == 1


@pytest.mark.asyncio
async def test_two_tabs_answer_once_restore_and_early_finish(monkeypatch):
    import asyncio
    users, ids, states, plan = await start()
    state, user = states[0], users["cadets"][0]
    await act(state, user)
    await phone(state, user, number="7000", service_name="Аварийная служба")
    sent = (await act(state, user, kind="dispatch", who_accepted="Мастер Иванов Иван Иванович", summary="Передан адрес")).json()
    instant = training.parse_time(sent["exercise"]["due_at"])
    monkeypatch.setattr(training, "now_utc", lambda: instant)
    # Two independent requests/tabs, one accepted report.
    responses = await asyncio.gather(phone(state, user, "answer", report_id="r0-0"), phone(state, user, "answer", report_id="r0-0"))
    assert sorted(r.status_code for r in responses) == [200,409]
    restored = (await request("GET", base(state), user)).json()
    assert restored["exercise"]["incoming"]["text"] == plan["reports"][0]["text"]
    assert len([e for e in restored["exercise"]["events"] if e["kind"] == "answered"]) == 1
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, state["session_id"])
        saved = deepcopy(session.dynamic_state)
    assert saved["dds"]["exercise"]["accepted"] == "r0-0"
    stopped = (await request("POST", base(state)+"/finish", user, json={})).json()
    assert stopped["readonly"] and stopped["exercise"]["incoming"]["ringing"] is False
    assert next(c for c in stopped["criteria"] if c["key"] == "completion")["status"] == "not_completed"
    after = await phone(state, user, number="7000", service_name="Аварийная служба")
    assert after.status_code == 409


@pytest.mark.asyncio
async def test_configuration_is_snapshot_and_legacy_criteria_are_ungraded():
    users, ids, states, plan = await start()
    edited = deepcopy(plan); edited["contacts"][0]["full_name"] = "Петров Пётр Петрович"
    response = await request("PUT", f"/api/dds/tickets/{ids[0]}/exercise", users["teacher"], json=edited)
    assert response.status_code == 200
    state = (await request("GET", base(states[0]), users["cadets"][0])).json()
    assert state["exercise"]["contacts"][0]["full_name"] == "Иванов Иван Иванович"
    legacy_users, legacy_ids = await exercise(n=1, count=1)
    _, legacy = await launch(legacy_users, legacy_ids)
    assert legacy[0]["exercise"] is None
    assert all(c["status"] == "not_evaluated" for c in legacy[0]["criteria"])


@pytest.mark.asyncio
async def test_criteria_reset_between_cards_and_archive_keeps_protocol(monkeypatch):
    users, ids = await exercise(n=1, count=2)
    plan = prepared(["Аварийная служба"])
    for ticket_id in ids:
        assert (await request("PUT", f"/api/dds/tickets/{ticket_id}/exercise", users["teacher"], json=plan)).status_code == 200
    _, states = await launch(users, ids)
    state, user = states[0], users["cadets"][0]
    clock = [training.parse_time(state["received_at"])]
    monkeypatch.setattr(training, "now_utc", lambda: clock[0])
    await act(state, user)
    await phone(state, user, number="7000", service_name="Аварийная служба")
    await act(state, user, kind="dispatch", who_accepted="Мастер Иванов Иван Иванович", summary="Передан адрес")
    for report in plan["reports"]:
        clock[0] += timedelta(seconds=3)
        await phone(state, user, "answer", report_id=report["id"])
        response = await act(state, user, status=report["status"], order_number="1", comment="Доступ восстановлен")
        assert response.json()["last_attempt"]["accepted"]
    advanced = (await complete(state, user)).json()
    assert advanced["card_id"] != state["card_id"]
    assert all(c["status"] == "not_evaluated" for c in advanced["criteria"])
    assert len(advanced["exercise"]["events"]) == 1
    old = (await request("GET", base(state)+f"/cards/{state['card_id']}", user)).json()
    assert old["readonly"] and old["exercise"]["processed_reports"] == 4
    assert all(c["status"] == "completed" for c in old["criteria"])
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, state["session_id"])
        assert len(_exercise_protocols(session.dynamic_state["dds"])) == 2


@pytest.mark.asyncio
async def test_teacher_report_contains_criteria_without_exposing_future_plan():
    users, ids, states, plan = await start()
    state, user = states[0], users["cadets"][0]
    await act(state, user, status="Прибытие")
    await request("POST", base(state)+"/finish", user, json={})
    response = await request("POST", f"/api/v1/lessons/{state['lesson_id']}/stop", users["teacher"])
    assert response.status_code == 200, response.text
    response = await request("GET", f"/api/ai-analytics/lessons/{state['lesson_id']}/data", users["teacher"])
    assert response.status_code == 200, response.text
    protocols = [p for s in response.json()["sessions"] for p in s["exercise_protocols"]]
    protocol = next(p for p in protocols if p["card_id"] == state["card_id"])
    assert len(protocol["criteria"]) == 5
    assert any(e.get("reason") == "premature" for e in protocol["events"])
    assert "dispatch_keywords" not in response.text and "r0-3" not in response.text
    other_teacher = users.get("other") or users.get("other_teacher")
    if other_teacher:
        assert (await request("GET", f"/api/ai-analytics/lessons/{state['lesson_id']}/data", other_teacher)).status_code == 403


@pytest.mark.asyncio
async def test_refusal_requires_reason_is_saved_and_does_not_invent_successful_reports():
    users, ids, states, plan = await start()
    state, user = states[0], users["cadets"][0]
    rejected = (await act(state, user, status="Не принята", comment="")).json()
    assert rejected["last_attempt"]["reason"] == "refusal"
    accepted = (await act(state, user, status="Не принята", comment="Дублирующая карточка, работы ведутся по учебной карточке 2")).json()
    assert accepted["last_attempt"]["accepted"]
    assert accepted["can_complete"]
    assert accepted["exercise"]["processed_reports"] == 0
    assert accepted["exercise"]["incoming"] is None
    assert accepted["actions"][-1]["comment"].startswith("Дублирующая")
    done = (await complete(state, user)).json()
    assert done["readonly"]
    assert next(c for c in done["criteria"] if c["key"] == "stage")["status"] == "not_evaluated"
    assert next(c for c in done["criteria"] if c["key"] == "completion")["status"] == "completed"


@pytest.mark.asyncio
async def test_criteria_report_does_not_need_numeric_scores_and_llm_outage_is_explicit():
    import httpx
    from unittest.mock import AsyncMock
    from backend.core.dds_report_llm import generate_dds_lesson_report, DDSLLMSettings, DDSReportGenerationError
    from tests.test_dds_report_llm_unit import make_valid_snapshot
    snapshot = make_valid_snapshot(evaluations=0, tickets=0)
    snapshot["sessions"][0]["exercise_protocols"] = [{"card_id": "card", "criteria": [
        {"key": "stage", "label": "Соответствие этапу", "status": "not_completed", "evidence": []}], "events": [], "actions": []}]
    client = AsyncMock()
    client.post.side_effect = httpx.ConnectError("isolated synthetic outage")
    with pytest.raises(DDSReportGenerationError, match="сетевого соединения"):
        await generate_dds_lesson_report(snapshot, settings=DDSLLMSettings(), client=client)
    assert client.post.await_count == 1
    wire = client.post.call_args.kwargs["json"]
    assert "exercise_protocols" in wire["messages"][1]["content"]
    assert snapshot["sessions"][0]["exercise_protocols"][0]["criteria"][0]["status"] == "not_completed"
