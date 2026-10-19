"""Pre-phone saved sessions retain their service policy through retries and races.

New sessions use the phone policy tested in test_dds_phone_training/defaults.
"""
import asyncio
from copy import deepcopy

import pytest

from backend.tests.test_dds_cycle_acceptance import action, request, setup_group, start, state


async def fixture():
    users = await setup_group(1)
    _, sessions = await start(users)
    session = sessions[0]
    # Reproduce persisted sessions from before automatic phone plans, not a runtime bypass.
    from backend.database import AsyncSessionLocal
    from backend.models.domain_03 import ExamSession
    async with AsyncSessionLocal() as db:
        stored = await db.get(ExamSession, session["session_id"])
        data = deepcopy(stored.dynamic_state)
        data["dds"]["exercise"] = None
        for card in data["dds"]["queue"]:
            card["exercise_plan"] = None
        stored.dynamic_state = data
        await db.commit()
    session = await state(users, session)
    return users, session, f"/api/dds/sessions/{session['session_id']}/actions"


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", [None, "", " \t\n "])
@pytest.mark.parametrize("rejected", ["Не принята", "Отказ от выполнения работ"])
async def test_refusal_requires_a_real_reason_without_writes(reason, rejected):
    users, session, path = await fixture()
    if rejected != "Не принята":
        assert (await request("POST", path, users["cadets"][0], json=action())).status_code == 200
    before = await state(users, session)
    response = await request("POST", path, users["cadets"][0], json=action(status=rejected, comment=reason))
    assert response.status_code == 422, response.text
    assert await state(users, session) == before


@pytest.mark.asyncio
@pytest.mark.parametrize("target", ["Прибытие", "Проведение работ", "Работы завершены"])
async def test_acceptance_cannot_skip_intermediate_steps(target):
    users, session, path = await fixture()
    assert session["allowed_service_statuses"]["Аварийная служба"] == ["Принята", "Не принята"]
    accepted = action()
    assert (await request("POST", path, users["cadets"][0], json=accepted)).status_code == 200
    assert (await request("POST", path, users["cadets"][0], json=action(status=target))).status_code == 409
    payload = action(status="Начало реагирования")
    result = await request("POST", path, users["cadets"][0], json=payload)
    assert result.status_code == 200, result.text
    assert result.json()["incoming_card"] == session["incoming_card"]
    assert result.json()["actions"][-1]["status"] == "Начало реагирования"
    assert (await request("POST", path, users["cadets"][0], json=payload)).json() == result.json()
    assert (await request("POST", path, users["cadets"][0], json=accepted)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("target", ["Работы завершены", "Отказ от выполнения работ", "Добавлена", "Получена службой", "Отказ", "Завершена", "В обработке", "Направлена"])
async def test_initial_decision_cannot_be_bypassed(target):
    users, session, path = await fixture()
    result = await request("POST", path, users["cadets"][0], json=action(status=target))
    assert result.status_code == 409, result.text
    assert (await state(users, session))["actions"] == []


@pytest.mark.asyncio
async def test_refusal_can_only_be_corrected_to_acceptance():
    users, session, path = await fixture()
    rejected = action(status="Не принята", comment="Передано в другую службу")
    result = await request("POST", path, users["cadets"][0], json=rejected)
    assert result.status_code == 200, result.text
    assert result.json()["allowed_service_statuses"]["Аварийная служба"] == ["Принята"]
    assert (await request("POST", path, users["cadets"][0], json=action(status="Работы завершены"))).status_code == 409
    assert (await request("POST", path, users["cadets"][0], json=action())).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal", ["Работы завершены", "Отказ от выполнения работ"])
async def test_terminal_service_is_read_only_but_original_retries_succeed(terminal):
    users, session, path = await fixture()
    accept = action()
    assert (await request("POST", path, users["cadets"][0], json=accept)).status_code == 200
    if terminal == "Работы завершены":
        dispatched = await request("POST", path, users["cadets"][0], json=action(
            kind="dispatch", status=None, who_accepted="Учебная бригада", summary="Направлена на место"))
        assert dispatched.status_code == 200, dispatched.text
        for stage in ["Начало реагирования", "Прибытие", "Проведение работ"]:
            assert (await request("POST", path, users["cadets"][0], json=action(status=stage))).status_code == 200
    final = action(status=terminal)
    result = await request("POST", path, users["cadets"][0], json=final)
    assert result.status_code == 200, result.text
    assert result.json()["allowed_service_statuses"]["Аварийная служба"] == []
    before = deepcopy(result.json())
    for payload in [action(), action(status=terminal), {
        "request_id": "late-dispatch", "kind": "dispatch", "service_name": "Аварийная служба",
        "who_accepted": "Дежурный", "summary": "Направление после завершения",
    }]:
        assert (await request("POST", path, users["cadets"][0], json=payload)).status_code == 409
    assert (await request("POST", path, users["cadets"][0], json=accept)).status_code == 200
    assert (await request("POST", path, users["cadets"][0], json=final)).json() == before
    assert await state(users, session) == before


@pytest.mark.asyncio
async def test_dispatch_cannot_smuggle_status_or_skip_acceptance():
    users, session, path = await fixture()
    dispatch = {"request_id": "dispatch", "kind": "dispatch", "service_name": "Аварийная служба",
                "who_accepted": "Дежурный", "summary": "Направлена бригада"}
    assert (await request("POST", path, users["cadets"][0], json=dispatch)).status_code == 409
    assert (await request("POST", path, users["cadets"][0], json={**dispatch, "status": "Работы завершены"})).status_code == 422
    assert (await state(users, session))["actions"] == []


@pytest.mark.asyncio
async def test_competing_terminal_actions_do_not_both_write():
    users, session, path = await fixture()
    assert (await request("POST", path, users["cadets"][0], json=action())).status_code == 200
    for stage in ["Начало реагирования", "Прибытие", "Проведение работ"]:
        assert (await request("POST", path, users["cadets"][0], json=action(status=stage))).status_code == 200
    results = await asyncio.gather(*[
        request("POST", path, users["cadets"][0], json=action(status=target))
        for target in ["Работы завершены", "Отказ от выполнения работ"]
    ])
    assert sorted(r.status_code for r in results) == [200, 409]
    restored = await state(users, session)
    assert len(restored["actions"]) == 5
    assert restored["allowed_service_statuses"]["Аварийная служба"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["Начало реагирования", "Прибытие", "Проведение работ"])
async def test_intermediate_progress_is_sequential_with_comment_supplements(stage):
    users, session, path = await fixture()
    progress = ["Принята", "Начало реагирования", "Прибытие", "Проведение работ", "Работы завершены"]
    for target in progress[:progress.index(stage) + 1]:
        if target == "Начало реагирования":
            result = await request("POST", path, users["cadets"][0], json={"request_id":"progress-dispatch", "kind":"dispatch", "service_name":"Аварийная служба", "who_accepted":"Дежурный", "summary":"Бригада направлена"})
            assert result.status_code == 200, result.text
        assert (await request("POST", path, users["cadets"][0], json=action(status=target))).status_code == 200
    dispatched = await request("POST", path, users["cadets"][0], json=action(
        kind="dispatch", status=None, who_accepted="Учебная бригада", summary="Направлена на место"))
    assert dispatched.status_code == 200, dispatched.text
    before = await state(users, session)
    assert (await request("POST", path, users["cadets"][0], json=action(status="Принята"))).status_code == 409
    assert (await request("POST", path, users["cadets"][0], json=action(status=stage, comment=" \t"))).status_code == 422
    assert await state(users, session) == before
    supplement = action(status=stage, comment="Дополнение к работам", order_number="Н-19")
    saved = await request("POST", path, users["cadets"][0], json=supplement)
    assert saved.status_code == 200, saved.text
    assert saved.json()["actions"][-1]["comment"] == "Дополнение к работам"
    assert saved.json()["actions"][-1]["order_number"] == "Н-19"
    for target in progress[progress.index(stage) + 1:]:
        assert (await request("POST", path, users["cadets"][0], json=action(status=target))).status_code == 200


def test_legacy_and_unknown_snapshot_statuses_are_safe_without_rewriting():
    from backend.core.dds_service_policy import allowed_statuses, current_service_statuses
    incoming = {"services": [{"name": "Служба", "status": "Прибыли"}]}
    original = deepcopy(incoming)
    statuses = current_service_statuses(incoming, {}, [])
    assert statuses == {"Служба": "Прибыли"}
    assert allowed_statuses(statuses["Служба"]) == ["Проведение работ", "Отказ от выполнения работ", "Прибытие"]
    assert incoming == original
    for legacy in ["Завершена", "Завершение работ без бригады", "Отказ", "неизвестный статус"]:
        assert allowed_statuses(legacy) == []
