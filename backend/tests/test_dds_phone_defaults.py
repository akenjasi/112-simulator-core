"""Automatic audio-only phone exercises, using the real API and isolated SQLite."""
from copy import deepcopy
from datetime import timedelta
import io
import uuid
import wave

import pytest

from backend.core import dds_exercise as training
from backend.core.dds_phone_catalog import AUDIO_DIR, default_phone_plan, recordings
from backend.database import AsyncSessionLocal
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import ExamSession
from backend.tests.test_dds_cycle_acceptance import request
from backend.tests.test_dds_phone_training import phone
from backend.tests.test_dds_queue import act, base, complete, exercise, launch, ready


def test_catalog_is_deterministic_valid_and_has_real_recordings():
    plan = default_phone_plan(["Газ", "Пожарные", "Газ"])
    assert plan == default_phone_plan(["Газ", "Пожарные", "Газ"])
    assert plan["presentation"] == "audio_only"
    assert [c["number"] for c in plan["contacts"]] == ["7000", "7001"]
    assert len(plan["reports"]) == 8
    for contact in plan["contacts"]:
        assert "Начало реагирования. Бригада выехала" in contact["reply"]
        assert "Слушаю" not in contact["reply"]
        assert contact["audio"].endswith("_cycle2_0.wav")
    for filename, transcript in recordings().items():
        assert "Начальник бригады" in transcript and "Бригада номер" in transcript
        with wave.open(str(AUDIO_DIR / filename)) as audio:
            assert audio.getnframes() / audio.getframerate() > 2
            assert any(audio.readframes(audio.getnframes()))


@pytest.mark.parametrize("number, accepted", [("1", True), ("один", True), ("11", False), ("два", False)])
def test_report_note_matches_the_heard_number_without_substring_matches(number, accepted):
    from backend.schemas.dds_cycle import DDSActionPayload
    plan = default_phone_plan(["Газ"])
    data = {"exercise": training.initialize(plan, "card", training.now_utc().isoformat())}
    report = plan["reports"][1]
    data["exercise"].update(accepted=report["id"], notes={report["id"]:
        f"Начальник бригады Иванов Иван Иванович. Бригада {number}. Прибытие."})
    payload = DDSActionPayload(request_id="test", kind="status", service_name="Газ", status=report["status"], order_number="1")
    assert training.action_issue(data, payload, "Начало реагирования") is None
    assert (not training.accuracy_issues(data, payload)) is accepted


@pytest.mark.asyncio
async def test_new_sessions_prepare_existing_tickets_without_changing_ticket_content():
    users, ids = await exercise(n=1, count=1)
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, ids[0])
        before = deepcopy(ticket.content)
    preview = await request("GET", f"/api/dds/tickets/{ids[0]}/exercise", users["teacher"])
    assert preview.json()["plan"]["presentation"] == "audio_only"
    _, states = await launch(users, ids)
    state, user = states[0], users["cadets"][0]
    assert state["exercise"]["total_reports"] == 4
    assert state["exercise"]["contacts"][0]["full_name"] == ""
    assert "Иванов" not in str(state["exercise"])
    async with AsyncSessionLocal() as db:
        assert (await db.get(ScenarioTicket, ids[0])).content == before
    assert (await request("GET", base(state), user)).json()["exercise"] == state["exercise"]
    await ready(state, user)
    done = (await complete(state, user)).json()
    assert done["readonly"] and done["exercise"]["processed_reports"] == 4
    assert len(done["exercise"]["notes"]) == 4
    assert all(c["status"] == "completed" for c in done["criteria"])


@pytest.mark.asyncio
async def test_audio_only_note_is_saved_idempotently_and_required_before_status(monkeypatch):
    users, ids = await exercise(n=1, count=1)
    _, states = await launch(users, ids)
    state, user = states[0], users["cadets"][0]
    await act(state, user)
    called = await phone(state, user, number="7000", service_name="Аварийная служба")
    assert called.json()["exercise"]["outgoing"]["Аварийная служба"]["text"] is None
    sent = await act(state, user, kind="dispatch", who_accepted="Начальник бригады Иванов Иван Иванович")
    await act(state, user, status="Начало реагирования", order_number="1")
    sent = await request("GET", base(state), user)
    monkeypatch.setattr(training, "now_utc", lambda: training.parse_time(sent.json()["exercise"]["due_at"]) + timedelta(seconds=1))
    answered = await phone(state, user, "answer", report_id="dds-report-0-1")
    assert answered.json()["exercise"]["incoming"]["text"] is None
    assert all(e.get("text") is None for e in answered.json()["exercise"]["events"])
    early = await act(state, user, status="Прибытие", order_number="1")
    assert early.json()["last_attempt"]["reason"] == "report_note"
    payload = {"request_id": str(uuid.uuid4()), "card_id": state["card_id"], "operation": "note",
               "report_id": "dds-report-0-1", "note": "Начальник бригады Иванов Иван Иванович. Бригада 1. Прибытие."}
    saved = await request("POST", base(state) + "/phone", user, json=payload)
    repeated = await request("POST", base(state) + "/phone", user, json=payload)
    assert len([e for e in repeated.json()["exercise"]["events"] if e["kind"] == "note" and e.get("report_id") == payload["report_id"]]) == 1
    assert repeated.json()["exercise"]["notes"] == saved.json()["exercise"]["notes"]
    assert (await request("POST", base(state) + "/phone", user, json={**payload, "note": "changed"})).status_code == 409
    assert (await request("GET", base(state), user)).json()["exercise"]["notes"][payload["report_id"]] == payload["note"]
    teacher_notes = await request("GET", base(state) + "/phone-notes", users["teacher"])
    assert teacher_notes.status_code == 200
    note = next(n for n in teacher_notes.json()["cards"][0]["notes"] if n["report_id"] == payload["report_id"])
    assert note["note"] == payload["note"] and "Иванов" in note["expected_text"]
    assert "Проведение работ" not in teacher_notes.text  # Never include future report transcripts.
    assert (await request("GET", base(state) + "/phone-notes", user)).status_code == 403
    assert (await request("GET", base(state) + "/phone-notes", users["other"])).status_code == 403
    progressed = await act(state, user, status="Прибытие", order_number="1")
    assert progressed.json()["last_attempt"]["accepted"]


@pytest.mark.asyncio
async def test_recordings_are_public_fixed_assets_not_arbitrary_files():
    response = await request("GET", "/api/dds/audio/dds_ivanov_0.wav", None)
    assert response.status_code == 200 and response.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(response.content)) as audio:
        assert audio.getnframes() > 1000
    assert (await request("GET", "/api/dds/audio/unknown.wav", None)).status_code == 404
    assert (await request("GET", "/api/dds/audio/dds_ivanov_0.wav?file=/etc/passwd", None)).content == response.content


@pytest.mark.asyncio
async def test_inaccurate_content_is_saved_and_cycle_finishes_with_card_errors(monkeypatch):
    from sqlalchemy import select
    from backend.models.domain_04 import TicketResult
    from backend.core.dds_report_data import _exercise_protocols
    users, ids = await exercise(n=1, count=1)
    _, states = await launch(users, ids)
    state, user = states[0], users["cadets"][0]
    clock = [training.parse_time(state["received_at"])]
    monkeypatch.setattr(training, "now_utc", lambda: clock[0])
    await act(state, user)
    await phone(state, user, number="7000", service_name="Аварийная служба")
    wire = dict(request_id="inaccurate-dispatch", card_id=state["card_id"], kind="dispatch",
                service_name="Аварийная служба", who_accepted="Пупкин", summary="123")
    sent = (await request("POST", base(state) + "/actions", user, json=wire)).json()
    assert sent["last_attempt"]["accepted"] and sent["exercise"]["incoming"]["id"] == "dds-report-0-0"
    assert sent["actions"][-1]["who_accepted"] == "Пупкин" and sent["actions"][-1]["summary"] == "123"
    repeated = (await request("POST", base(state) + "/actions", user, json=wire)).json()
    assert repeated["last_attempt"]["accepted"]
    assert repeated["exercise"]["events"] == sent["exercise"]["events"]
    plan = default_phone_plan(["Аварийная служба"])
    for index, report in enumerate(plan["reports"]):
        clock[0] += timedelta(seconds=3)
        if index > 0:
            assert (await phone(state, user, "answer", report_id=report["id"])).status_code == 200
        note = "Пупкин. Всё уже закончилось, бригада 99." if index == 0 else report["text"]
        assert (await phone(state, user, "note", report_id=report["id"], note=note)).status_code == 200
        if index == 0:
            wrong = (await act(state, user, status="Прибытие", order_number="99")).json()
            assert wrong["last_attempt"]["reason"] == "wrong_stage"
            assert wrong["exercise"]["processed_reports"] == 0
        result = (await act(state, user, status=report["status"], order_number="99" if index == 0 else "1",
                            comment="123" if index == 3 else report["text"])).json()
        assert result["last_attempt"]["accepted"], result
        assert result["exercise"]["processed_reports"] == index + 1
    done = (await complete(state, user)).json()
    assert done["readonly"] and done["exercise"]["processed_reports"] == 4
    assert done["exercise"]["notes"]["dds-report-0-0"] == "Пупкин. Всё уже закончилось, бригада 99."
    accuracy = next(c for c in done["criteria"] if c["key"] == "accuracy")
    assert accuracy["status"] == "not_completed"  # Completion must not pretend content was corrected.
    assert len(accuracy["evidence"]) == 3
    assert all(e["blocking"] is False for e in accuracy["evidence"])
    assert "ФИО докладчика" in accuracy["evidence"][1]["message"]
    assert accuracy["evidence"][1]["action"]["note"].startswith("Пупкин")
    assert "результат работ" in accuracy["evidence"][2]["message"]
    assert next(c for c in done["criteria"] if c["key"] == "completion")["status"] == "completed"
    restored = (await request("GET", base(state) + f"/cards/{state['card_id']}", user)).json()
    assert restored["criteria"] == done["criteria"]
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, state["session_id"])
        saved_result = await db.scalar(select(TicketResult).where(TicketResult.session_id == state["session_id"]))
        assert saved_result.errors_count == 4  # Three content errors plus the blocked wrong stage.
        assert saved_result.error_details["dds_criteria"] == done["criteria"]
        protocols = _exercise_protocols(session.dynamic_state["dds"])
        assert any(e.get("blocking") is False for e in protocols[0]["events"])
        assert "Всё уже закончилось" not in str(protocols)  # Free report notes never enter LLM input.
    teacher = await request("GET", base(state) + "/phone-notes", users["teacher"])
    assert teacher.json()["cards"][0]["notes"][0]["note"].startswith("Пупкин")
    assert "Иванов" in teacher.json()["cards"][0]["notes"][0]["expected_text"]
