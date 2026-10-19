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
    report = plan["reports"][0]
    data["exercise"].update(accepted=report["id"], notes={report["id"]:
        f"Начальник бригады Иванов Иван Иванович. Бригада {number}. Начало реагирования."})
    payload = DDSActionPayload(request_id="test", kind="status", service_name="Газ", status=report["status"], order_number="1")
    assert (training.action_issue(data, payload, "Принята") is None) is accepted


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
    monkeypatch.setattr(training, "now_utc", lambda: training.parse_time(sent.json()["exercise"]["due_at"]) + timedelta(seconds=1))
    answered = await phone(state, user, "answer", report_id="dds-report-0-0")
    assert answered.json()["exercise"]["incoming"]["text"] is None
    assert all(e.get("text") is None for e in answered.json()["exercise"]["events"])
    early = await act(state, user, status="Начало реагирования", order_number="1")
    assert early.json()["last_attempt"]["reason"] == "report_note"
    payload = {"request_id": str(uuid.uuid4()), "card_id": state["card_id"], "operation": "note",
               "report_id": "dds-report-0-0", "note": "Начальник бригады Иванов Иван Иванович. Бригада 1. Начало реагирования."}
    saved = await request("POST", base(state) + "/phone", user, json=payload)
    repeated = await request("POST", base(state) + "/phone", user, json=payload)
    assert len([e for e in repeated.json()["exercise"]["events"] if e["kind"] == "note"]) == 1
    assert repeated.json()["exercise"]["notes"] == saved.json()["exercise"]["notes"]
    assert (await request("POST", base(state) + "/phone", user, json={**payload, "note": "changed"})).status_code == 409
    assert (await request("GET", base(state), user)).json()["exercise"]["notes"][payload["report_id"]] == payload["note"]
    teacher_notes = await request("GET", base(state) + "/phone-notes", users["teacher"])
    assert teacher_notes.status_code == 200
    note = teacher_notes.json()["cards"][0]["notes"][0]
    assert note["note"] == payload["note"] and "Иванов" in note["expected_text"]
    assert "Прибытие" not in teacher_notes.text  # Never include future report transcripts.
    assert (await request("GET", base(state) + "/phone-notes", user)).status_code == 403
    assert (await request("GET", base(state) + "/phone-notes", users["other"])).status_code == 403
    progressed = await act(state, user, status="Начало реагирования", order_number="1")
    assert progressed.json()["last_attempt"]["accepted"]


@pytest.mark.asyncio
async def test_recordings_are_public_fixed_assets_not_arbitrary_files():
    response = await request("GET", "/api/dds/audio/dds_ivanov_0.wav", None)
    assert response.status_code == 200 and response.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(response.content)) as audio:
        assert audio.getnframes() > 1000
    assert (await request("GET", "/api/dds/audio/unknown.wav", None)).status_code == 404
    assert (await request("GET", "/api/dds/audio/dds_ivanov_0.wav?file=/etc/passwd", None)).content == response.content
