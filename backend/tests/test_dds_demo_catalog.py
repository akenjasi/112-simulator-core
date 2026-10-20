"""Real storage, scoped replacement and four-card API/phone flow on disposable DBs."""
import sqlite3
import uuid

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.core.dds_demo_catalog import CATALOG, prepare_demo, validate_demo
from backend.core.dds_phone_catalog import default_phone_plan
from backend.core.ticket_storage import save_generated_ticket
from backend.database import AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, IncidentCard, TicketResult
from backend.models.report_job import ReportJob
from backend.scripts.db.prepare_dds_demo import run, target_path
from backend.tests.test_dds_cycle_acceptance import request, setup_group
from backend.tests.test_dds_queue import base, complete, ready


@pytest.fixture
async def demo_database(tmp_path):
    path = tmp_path / "demo.sqlite"
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")

    @event.listens_for(engine.sync_engine, "connect")
    def fk(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        for i in (1, 2):
            root = f"prototype-dds-phone-{i}"
            db.add(ScenarioTicket(scenario_id=root, title=f"old-{i}", is_deleted=True))
            db.add(ScenarioTicket(scenario_id=f"old-v2-{i}", title=f"active-{i}",
                                  settings={"replaces_ticket_id": root}))
            db.add(GeneratedTicket(id=f"old-v2-{i}", category="ЖКХ", sequence_number=i))
        await db.flush()
        db.add_all([
            Assignment(assignment_id="past", scenario_id="prototype-dds-phone-1", status="COMPLETED", target_role="DISPATCHER_DDS"),
            Assignment(assignment_id="active", scenario_id="old-v2-2", status="ACTIVE", target_role="DISPATCHER_DDS"),
            Assignment(assignment_id="waiting", scenario_id="old-v2-1", card_pool_ids=["old-v2-1", "old-v2-2"], target_role="DISPATCHER_DDS"),
            Assignment(assignment_id="unrelated", target_role="OPERATOR_112")])
        await db.flush()
        db.add(ExamSession(session_id="old-session", assignment_id="active", ticket_id="old-v2-2", session_type="CARD_ACTIONS"))
        db.add(ExamSession(session_id="unrelated-session", assignment_id="unrelated", session_type="CALL_SIMULATION"))
        await db.flush()
        db.add(IncidentCard(card_id="old-card", session_id="old-session", scenario_id="old-v2-2", card_origin="OPERATOR_112"))
        await db.flush()
        db.add(EvaluationResult(evaluation_id="old-grade", card_id="old-card", session_id="old-session"))
        db.add(TicketResult(result_id="old-result", session_id="old-session", ticket_id="old-v2-2"))
        db.add(ReportJob(lesson_id="active"))
        await db.commit()
    yield path, factory
    await engine.dispose()


def test_preparation_is_reproducible_and_source_backed():
    first, second = prepare_demo(), prepare_demo()
    assert first.tickets == second.tickets
    assert len({t.data.ground_truth["phone"] for t in first.tickets}) == 4
    assert [len(t.data.etalon_services) for t in first.tickets] == [2, 2, 3, 2]
    assert first.tickets[2].data.ground_truth["blocked"] == "да"
    assert all(t.data.ground_truth["caller_status"] == "очевидец" for t in first.tickets)
    modified = first.model_copy(deep=True)
    modified.tickets[0].final_type = "Made up class"
    with pytest.raises(ValueError, match="classifier identity"):
        validate_demo(modified)
    modified = first.model_copy(deep=True)
    modified.tickets[2].data.ground_truth["blocked"] = "нет"
    with pytest.raises(ValueError, match="flags"):
        validate_demo(modified)


@pytest.mark.asyncio
async def test_dry_run_backup_replacement_and_repeat(demo_database):
    path, factory = demo_database
    manifest = prepare_demo()
    before = path.read_bytes()
    checked = await run(path, manifest)
    assert checked == dict(database=str(path), applied=False, backup=None, created=4, lessons=2, sessions=1, cards=1)
    assert path.read_bytes() == before
    assert not (path.parent / "backups").exists()
    applied = await run(path, manifest, apply=True)
    with sqlite3.connect(applied["backup"]) as backup:
        assert backup.execute("select count(*) from exam_sessions").fetchone()[0] == 2
        assert backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    async with factory() as db:
        scenarios = (await db.scalars(select(ScenarioTicket).where(ScenarioTicket.is_deleted.is_(False)))).all()
        assert {t.scenario_id for t in scenarios} == {t.data.ticket_id for t in manifest.tickets}
        mirrors = (await db.scalars(select(GeneratedTicket).where(GeneratedTicket.is_deleted.is_(False)))).all()
        assert sorted(t.sequence_number for t in mirrors) == [3, 4, 5, 6]
        for t in scenarios:
            gt, card = t.ground_truth, t.content["incoming_card"]
            assert t.workflow_state["status"] == "APPROVED"
            assert t.settings["demo_catalog"] == CATALOG
            assert card["caller"]["name"] == gt["fio"]
            assert card["phones"] == {"aon": gt["phone"], "provided": gt["phone"], "onSite": ""}
            assert card["classification"]["class"] == gt["class"]
            assert card["classification"]["class"] != card["classification"]["title"]
            assert card["classification"]["visClass"] == ""
            assert t.content["dds_exercise"]["version"] == 2
        waiting = await db.get(Assignment, "waiting")
        assert waiting.card_pool_ids == [manifest.tickets[1].data.ticket_id, manifest.tickets[3].data.ticket_id]
        assert await db.get(ExamSession, "old-session") is None
        assert await db.get(IncidentCard, "old-card") is None
        assert await db.get(EvaluationResult, "old-grade") is None
        assert await db.get(TicketResult, "old-result") is None
        assert await db.get(ExamSession, "unrelated-session") is not None
        assert not (await db.execute(text("PRAGMA foreign_key_check"))).all()
        seq_before = (await db.execute(text("select last_val from sys_sequences"))).scalar_one()
    repeated = await run(path, manifest, apply=True)
    assert repeated["created"] == repeated["sessions"] == 0
    async with factory() as db:
        assert (await db.execute(text("select last_val from sys_sequences"))).scalar_one() == seq_before


@pytest.mark.asyncio
async def test_replacement_rolls_back_if_history_cannot_be_cleared(demo_database):
    path, factory = demo_database
    async with factory() as db:
        session = await db.get(ExamSession, "old-session")
        session.session_type = "CALL_SIMULATION"
        await db.commit()
    before = path.read_bytes()
    with pytest.raises(ValueError, match="non-DDS attempt"):
        await run(path, prepare_demo(), apply=True)
    assert path.read_bytes() == before
    async with factory() as db:
        assert (await db.scalar(select(ScenarioTicket).where(ScenarioTicket.scenario_id == "old-v2-2"))).is_deleted is False


@pytest.mark.asyncio
async def test_unrelated_catalog_and_missing_audio_are_refused(demo_database, monkeypatch, tmp_path):
    path, factory = demo_database
    manifest = prepare_demo()
    async with factory() as db:
        db.add(ScenarioTicket(title="Keep me"))
        await db.commit()
    with pytest.raises(ValueError, match="unrelated active tickets"):
        await run(path, manifest)
    monkeypatch.setattr("backend.core.dds_demo_catalog.AUDIO_DIR", tmp_path / "missing")
    with pytest.raises(ValueError, match="Missing bundled"):
        validate_demo(manifest)


def test_main_database_is_protected():
    from backend.core.paths import PROJECT_ROOT
    if (PROJECT_ROOT / "data/112_simulator.db").exists():
        with pytest.raises(ValueError, match="main database"):
            target_path(PROJECT_ROOT / "data/112_simulator.db")


@pytest.mark.asyncio
async def test_four_tickets_catalog_edit_approval_self_training_and_phone_cycle():
    users = await setup_group(1)
    manifest = prepare_demo()
    async with AsyncSessionLocal() as db:
        for t in manifest.tickets:
            await save_generated_ticket(db, t.data, category=t.category, subcategory=t.short_title,
                status="APPROVED", now=manifest.prepared_at,
                exercise=default_phone_plan(t.data.etalon_services),
                settings={"classifier_source": {"id": t.classifier_id, "final_type": t.final_type}})
        await db.commit()
    counts = (await request("GET", "/api/v1/tickets/counts", users["teacher"])).json()
    training = (await request("GET", "/api/dds/training/tickets", users["cadets"][0])).json()
    for t in manifest.tickets:
        listing = await request("GET", "/api/v1/tickets", users["teacher"], params={"category": t.category, "subcategory": t.short_title})
        assert listing.status_code == 200, listing.text
        assert t.data.ticket_id in {r["id"] for r in listing.json()}
        assert any(t.short_title in c["subcategories"] for c in counts)
        assert t.data.ticket_id in {r.get("ticket_id", r.get("id")) for r in training}
    chosen = manifest.tickets[0]
    edited = await request("PATCH", f"/api/v1/tickets/{chosen.data.ticket_id}", users["teacher"], json={
        "ground_truth": {"phone": "+79991234567"}, "plot": chosen.data.plot + " Уточнение: проход закрыт."})
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "UNDER_REVIEW"
    approved = await request("POST", f"/api/v1/tickets/{chosen.data.ticket_id}/approve", users["teacher"])
    assert approved.status_code == 200 and approved.json()["status"] == "APPROVED"
    launched = await request("POST", "/api/dds/training", users["cadets"][0], json={
        "ticket_ids": [t.data.ticket_id for t in manifest.tickets], "request_id": str(uuid.uuid4())})
    assert launched.status_code in (200, 201), launched.text
    sid = launched.json()["session_id"]
    cadet = users["cadets"][0]
    for t in manifest.tickets:
        current = (await request("GET", f"/api/dds/sessions/{sid}", cadet)).json()
        assert current["ticket_id"] == t.data.ticket_id
        card = current["incoming_card"]
        assert card["classification"] == {"section": t.category, "title": t.short_title, "class": t.final_type, "visClass": ""}
        assert card["caller"]["name"] == t.data.ground_truth["fio"]
        assert card["phones"]["aon"] == ("+79991234567" if t is chosen else t.data.ground_truth["phone"])
        await ready(current, cadet)
        reloaded = (await request("GET", base(current), cadet)).json()
        assert reloaded["incoming_card"] == card
        assert reloaded["exercise"]["processed_reports"] == len(t.data.etalon_services) * 4
        completed = await complete(current, cadet)
        assert completed.status_code == 200, completed.text
    assert completed.json()["readonly"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("individual", [True, False], ids=["different-pairs", "shared-pair"])
async def test_teacher_assigns_two_tickets_to_each_of_two_cadets(individual):
    """Exercise both supported teacher choices without confusing pool size and allocation."""
    users = await setup_group(2)
    manifest = prepare_demo()
    async with AsyncSessionLocal() as db:
        for ticket in manifest.tickets:
            # Keep this acceptance independent of other tests' edits to the fixed demo IDs.
            ticket.data.ticket_id = str(uuid.uuid4())
            await save_generated_ticket(db, ticket.data, category=ticket.category,
                subcategory=ticket.short_title, status="APPROVED", now=manifest.prepared_at,
                exercise=default_phone_plan(ticket.data.etalon_services))
        await db.commit()
    pairs = [[t.data.ticket_id for t in manifest.tickets[:2]],
             [t.data.ticket_id for t in manifest.tickets[2:]]] if individual else [
                 [t.data.ticket_id for t in manifest.tickets[:2]]] * 2
    lessons = []
    for index in range(2 if individual else 1):
        payload = {"group_id": users["group_id"], "target_role": "DISPATCHER_DDS",
                   "ticket_ids": pairs[index]}
        if individual:
            payload["cadet_id"] = users["cadets"][index][0]
        created = await request("POST", "/api/v1/lessons", users["teacher"], json=payload)
        assert created.status_code == 201, created.text
        lesson_id = created.json()["id"]
        started = await request("POST", f"/api/v1/lessons/{lesson_id}/start", users["teacher"])
        assert started.status_code == 200, started.text
        assert started.json()["total_cadets"] == (1 if individual else 2)
        lessons.append(lesson_id)
    current = []
    for index, cadet in enumerate(users["cadets"]):
        assigned = (await request("GET", "/api/dds/assignments", cadet)).json()
        matching = [s for s in assigned if s["lesson_id"] in lessons]
        assert len(matching) == 1
        assert matching[0]["total_cards"] == 2
        assert matching[0]["ticket_id"] == pairs[index][0]
        current.append(matching[0])
    assert current[0]["session_id"] != current[1]["session_id"]
    denied = await request("GET", base(current[1]), users["cadets"][0])
    assert denied.status_code == 403
    for card_index in range(2):
        for cadet_index, cadet in enumerate(users["cadets"]):
            before = (await request("GET", base(current[cadet_index]), cadet)).json()
            assert before["ticket_id"] == pairs[cadet_index][card_index]
            assert before["completed_cards"] == card_index
            await ready(before, cadet)
            restored = (await request("GET", base(before), cadet)).json()
            assert restored["incoming_card"] == before["incoming_card"]
            finished = await complete(before, cadet)
            assert finished.status_code == 200, finished.text
            current[cadet_index] = finished.json()
            assert current[cadet_index]["completed_cards"] == card_index + 1
            # The other cadet's queue does not move when this cadet submits a card.
            if cadet_index == 0:
                other = (await request("GET", base(current[1]), users["cadets"][1])).json()
                assert other["completed_cards"] == card_index
    for index, state in enumerate(current):
        assert state["readonly"] is True
        assert state["total_cards"] == state["completed_cards"] == 2
        archived = (await request("GET", base(state), users["cadets"][index])).json()
        assert archived["completed_cards"] == 2
        assert len(archived["cards"]) == 2
    for lesson_id in lessons:
        review = await request("GET", f"/api/v1/lessons/{lesson_id}", users["teacher"])
        assert review.status_code == 200, review.text
        assert all(c["progress"] == 100 for c in review.json()["cadets"])
