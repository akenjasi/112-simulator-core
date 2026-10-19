"""Codex review: independent DDS context checks, without modifying worker tests."""
from copy import deepcopy
from datetime import datetime, timezone

import pytest

from backend.database import AsyncSessionLocal
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import ExamSession
from backend.models.domain_04 import IncidentCard
from tests.test_teacher_grading_acceptance import (
    fixture, detail, request, isolated_tables,
)


START = datetime(2026, 10, 18, 10, 0, tzinfo=timezone.utc)


async def context_fixture(*, actions=None, etalon=None, extra_dds=None):
    data = await fixture()
    incoming = {
        "description": "Исходное описание оператора 112",
        "classification": {"section": "ДТП", "title": "ДТП с пострадавшими"},
        "caller": {"name": "Заявитель", "address": "Исходный адрес"},
        "services": [{"name": "101"}, {"name": "104"}],
    }
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, data["session"])
        session.start_time = START
        session.dynamic_state = {
            "_gradebook_snapshot": {
                "ticket_id": data["ticket"], "etalon": {"fio": "Заявитель"},
                "incoming_card": deepcopy(incoming), "dds_etalon": etalon,
            },
            "dds": {
                "card_id": data["card"], "incoming_card": deepcopy(incoming),
                "actions": actions or [], "submitted_at": "2026-10-18T10:05:00+00:00",
                **(extra_dds or {}),
            },
        }
        card = await db.get(IncidentCard, data["card"])
        card.filled_data = deepcopy(incoming)
        await db.commit()
    return data


async def set_actions(data, actions):
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, data["session"])
        state = deepcopy(session.dynamic_state)
        state["dds"]["actions"] = actions
        session.dynamic_state = state
        await db.commit()


def action(data, **fields):
    return {"kind": "status", "actor_id": data["cadet"], "service_name": "104",
            "status": "Принята", "at": "2026-10-18T10:00:18+00:00", **fields}


@pytest.mark.parametrize("untrusted", [
    {"status": "Принята", "comment": "Автор отсутствует"},
    {"status": "Получена службой", "comment": "Автоматическая доставка"},
])
async def test_unknown_author_and_system_comments_are_not_cadet_actions(untrusted):
    data = await context_fixture(actions=[{"service_name": "104", **untrusted}])
    saved = await detail(data)
    assert saved["cadet_actions"] == [], "Unverified/system authorship must not be attributed to cadet"
    assert saved["dds_comparison"]["has_cadet_actions"] is False


async def test_wrong_actor_is_excluded_but_own_comment_is_preserved():
    data = await context_fixture()
    await set_actions(data, [action(data, actor_id=data["other"], comment="Другой пользователь"),
                             action(data, comment="Дословный текст курсанта")])
    saved = await detail(data)
    assert [a["comment"] for a in saved["cadet_actions"]] == ["Дословный текст курсанта"]


async def test_session_start_is_not_unconditionally_claimed_as_delivery_time():
    data = await context_fixture()
    await set_actions(data, [action(data)])
    timing = (await detail(data))["dds_comparison"]["timeliness"]
    assert timing["is_recorded"] is False, "Start of a legacy session alone proves no service delivery timestamp"
    assert timing["actual_seconds"] is None
    assert timing["directed_at"] is None


async def test_explicitly_unset_timing_requirement_is_not_replaced_by_thirty():
    data = await context_fixture(etalon={"expected_decision": "Принята",
                                         "confirmation_time_limit_seconds": None})
    saved = await detail(data)
    assert saved["dds_etalon"]["confirmation_time_limit_seconds"] is None
    assert saved["dds_comparison"]["timeliness"]["normative_seconds"] is None


async def test_assigned_service_comes_from_task_not_first_notification_recipient():
    data = await context_fixture(etalon={"service_name": "104", "expected_decision": "Принята"})
    saved = await detail(data)
    assert saved["incident_context"]["assigned_service"] == "104"


async def test_no_task_service_is_invented_from_notification_order():
    data = await context_fixture()
    assert (await detail(data))["incident_context"]["assigned_service"] is None


async def test_decision_and_final_status_refer_to_task_service():
    data = await context_fixture(etalon={"service_name": "104", "expected_decision": "Не принята"})
    await set_actions(data, [
        action(data, service_name="101", status="Принята"),
        action(data, status="Не принята", comment="Вне компетенции службы"),
        action(data, service_name="101", status="Работы завершены"),
    ])
    comparison = (await detail(data))["dds_comparison"]
    assert comparison["decision"]["actual_service"] == "104"
    assert comparison["decision"]["actual_decision"] == "Не принята"
    assert comparison["progression"]["final_status"] == "Не принята"


async def test_other_attempt_does_not_inherit_current_session_card_and_actions():
    data = await context_fixture()
    await set_actions(data, [action(data, comment="Текст только первой работы")])
    async with AsyncSessionLocal() as db:
        ticket = ScenarioTicket(title="Другая работа", category="Газ", content={})
        db.add(ticket)
        await db.flush()
        card = IncidentCard(session_id=data["session"], scenario_id=ticket.scenario_id,
                            operator_id=data["cadet"], card_origin="DDS",
                            filled_data={"description": "Контекст второй работы"})
        db.add(card)
        await db.commit()
        second_card_id = card.card_id
    saved = await detail(data, second_card_id)
    assert saved["cadet_actions"] == [], "Session-level actions belong to a different card"
    assert saved["incident_context"]["description"] == "Контекст второй работы"


async def test_no_actions_does_not_return_initial_card_as_student_authored_answer():
    data = await context_fixture()
    saved = await detail(data)
    assert "description" not in saved["student_answer"]
    assert "caller" not in saved["student_answer"]


@pytest.mark.parametrize("limit", [-5, 0, True, 1.5])
async def test_invalid_confirmation_limit_is_rejected_by_ticket_api(limit):
    data = await context_fixture()
    response = await request("PATCH", f"/api/v1/tickets/{data['ticket']}", data,
                             json={"dds_etalon": {"expected_decision": "Принята",
                                                  "confirmation_time_limit_seconds": limit}})
    assert response.status_code == 422, response.text


async def test_invalid_historical_etalon_is_not_reported_as_present():
    data = await context_fixture(etalon={"expected_decision": "Принята", "expected_stages": "invalid-list"})
    saved = await detail(data)
    assert saved["dds_etalon"] is None
    assert saved["has_dds_etalon"] is False


async def test_ticket_etalon_roundtrip_and_historical_snapshot_are_independent():
    original = {"service_name": "104", "expected_decision": "Не принята",
                "required_comment_points": ["Причина отказа"]}
    data = await context_fixture(etalon=original)
    response = await request("PATCH", f"/api/v1/tickets/{data['ticket']}", data,
                             json={"dds_etalon": {"expected_decision": "Принята"}})
    assert response.status_code == 200, response.text
    assert response.json()["dds_etalon"]["expected_decision"] == "Принята"
    assert (await detail(data))["dds_etalon"]["expected_decision"] == "Не принята"


async def test_api_allows_explicit_removal_of_ticket_etalon():
    data = await context_fixture()
    path = f"/api/v1/tickets/{data['ticket']}"
    first = await request("PATCH", path, data, json={"dds_etalon": {"expected_decision": "Принята"}})
    assert first.status_code == 200, first.text
    removed = await request("PATCH", path, data, json={"dds_etalon": None})
    assert removed.status_code == 200, removed.text
    assert removed.json()["dds_etalon"] is None


async def test_service_and_timing_only_etalon_is_not_discarded():
    data = await context_fixture(etalon={"service_name": "104", "confirmation_time_limit_seconds": 45})
    saved = await detail(data)
    assert saved["dds_etalon"] is not None, "Valid timing-only requirements still matter for teacher review"
    assert saved["dds_comparison"]["timeliness"]["normative_seconds"] == 45


async def test_editing_etalon_alone_does_not_rebuild_or_erase_original_card_facts():
    data = await context_fixture()
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, data["ticket"])
        ticket.settings = {"plot": "Имеются пострадавшие", "category": "ДТП", "etalon_services": ["101"]}
        original = {"description": "Имеются пострадавшие", "caller": {"address": "Точный адрес"},
                    "statuses": {"injured": "да", "blocked": "да"}, "services": [{"name": "101"}]}
        ticket.content = {"incoming_card": deepcopy(original)}
        await db.commit()
    response = await request("PATCH", f"/api/v1/tickets/{data['ticket']}", data,
                             json={"dds_etalon": {"expected_decision": "Принята"}})
    assert response.status_code == 200, response.text
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, data["ticket"])
        saved_card = ticket.content["incoming_card"]
        assert saved_card["statuses"]["injured"] == "да", "Editing the etalon must not erase actual injuries"
        assert saved_card["statuses"]["blocked"] == "да"
        assert saved_card["caller"]["address"] == "Точный адрес"


async def test_real_lesson_start_snapshots_context_and_hides_teacher_data_from_cadet():
    from tests.test_dds_cycle_acceptance import setup_group, start, request as cycle_request
    group = await setup_group()
    original = {"service_name": "Аварийная служба", "expected_decision": "Принята",
                "decision_rationale": "Историческое обоснование для преподавателя"}
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, group["ticket_id"])
        ticket.settings = {"dds_etalon": original}
        await db.commit()
    _, states = await start(group)
    session_id = states[0]["session_id"]
    cadet_response = await cycle_request("GET", f"/api/dds/sessions/{session_id}", group["cadets"][0])
    assert cadet_response.status_code == 200, cadet_response.text
    assert original["decision_rationale"] not in cadet_response.text
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, session_id)
        snapshot = deepcopy(session.dynamic_state["_gradebook_snapshots"][group["ticket_id"]])
        assert snapshot["incoming_card"] == session.dynamic_state["dds"]["incoming_card"]
        ticket = await db.get(ScenarioTicket, group["ticket_id"])
        ticket.settings = {"dds_etalon": {"expected_decision": "Не принята"}}
        await db.commit()
        await db.refresh(session)
        assert session.dynamic_state["_gradebook_snapshots"][group["ticket_id"]] == snapshot
