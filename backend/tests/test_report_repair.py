"""Reports read the jobs they create, with frozen data and object access checks."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import uuid

import pytest
from sqlalchemy import select

from backend.core import report_demo, report_worker
from backend.database import AsyncSessionLocal
from backend.models.domain_03 import ExamSession
from backend.models.report_job import ReportJob
from backend.tests.test_dds_cycle_acceptance import request
from backend.tests.test_dds_queue import exercise, launch
from backend.tests.test_report_scheduler import store, seed


async def completed_group(monkeypatch, mode="demo"):
    monkeypatch.setenv("DDS_REPORT_MODE", mode)
    calls = []
    async def infer(snapshot, kind, **kwargs):
        calls.append(deepcopy(snapshot))
        return {"analysis_text": "Свежие рекомендации по сохранённым результатам.", "model_used": "test-runtime"}
    monkeypatch.setattr(report_worker, "generate_report", infer)
    users, ids = await exercise(n=1, count=1)
    lesson, states = await launch(users, ids)
    ended = await request("POST", f"/api/v1/lessons/{lesson}/stop", users["teacher"])
    assert ended.status_code == 200, ended.text
    if mode == "demo":
        await settle()
    return users, states[0], calls


async def settle():
    worker = report_worker.ReportWorker()
    async with AsyncSessionLocal() as db:
        ids = list((await db.scalars(select(ReportJob.job_id).where(ReportJob.status == "pending").order_by(ReportJob.created_at, ReportJob.job_id))).all())
    for job_id in ids:
        await asyncio.wait_for(worker.process_single_job(job_id), 5)


@pytest.mark.asyncio
async def test_group_report_generates_polls_and_preserves_completed_result(monkeypatch):
    users, state, calls = await completed_group(monkeypatch)
    path = f"/api/ai-analytics/groups/{users['group_id']}/report"
    assert (await request("GET", path, users["teacher"])).status_code == 404
    first = await request("POST", path, users["teacher"], json={})
    assert first.status_code == 202, first.text
    assert first.json()["group_id"] == users["group_id"]
    assert first.json()["kind"] == "group"
    await settle()
    count = len(calls)
    saved = (await request("GET", path, users["teacher"])).json()
    assert saved["status"] == "completed"
    assert saved["report_text"] == "Свежие рекомендации по сохранённым результатам."
    assert saved["model_used"] == "test-runtime"
    assert "snapshot" not in saved
    for method in ("GET", "POST"):
        again = await request(method, path, users["teacher"])
        assert again.status_code == 200
        assert again.json()["job_id"] == saved["job_id"]
    assert len(calls) == count
    async with AsyncSessionLocal() as db:
        job = await db.get(ReportJob, saved["job_id"])
        assert job.snapshot["summary"]["sessions"] == 1
        assert set(job.snapshot["source_revisions"]) == {state["session_id"]}
        original = deepcopy(job.snapshot)
        session = await db.get(ExamSession, state["session_id"])
        db.add(ExamSession(assignment_id=session.assignment_id, cadet_id=session.cadet_id,
            ticket_id=session.ticket_id, session_type="CARD_ACTIONS", status="COMPLETED",
            start_time=datetime.now(timezone.utc), end_time=datetime.now(timezone.utc)))
        await db.commit()
    updated = await request("POST", path, users["teacher"])
    assert updated.status_code == 202
    assert updated.json()["job_id"] != saved["job_id"]
    await settle()
    async with AsyncSessionLocal() as db:
        assert (await db.get(ReportJob, saved["job_id"])).snapshot == original


@pytest.mark.asyncio
async def test_group_report_rejects_cadets_other_teachers_and_unknown_groups(monkeypatch):
    users, _, _ = await completed_group(monkeypatch)
    path = f"/api/ai-analytics/groups/{users['group_id']}/report"
    for method in ("GET", "POST"):
        assert (await request(method, path)).status_code == 401
        assert (await request(method, path, users["cadets"][0])).status_code == 403
        assert (await request(method, path, users["other"])).status_code == 403
    assert (await request("GET", f"/api/ai-analytics/groups/{uuid.uuid4()}/report", users["teacher"])).status_code == 404


@pytest.mark.asyncio
async def test_queued_group_report_is_durable_and_does_not_call_demo_inference(monkeypatch):
    users, _, calls = await completed_group(monkeypatch, "queued")
    path = f"/api/ai-analytics/groups/{users['group_id']}/report"
    response = await request("POST", path, users["teacher"])
    assert response.status_code == 202, response.text
    assert response.json()["status"] == "pending"
    assert response.json()["execution_mode"] == "queued"
    assert not calls
    saved = (await request("GET", path, users["teacher"])).json()
    assert saved["job_id"] == response.json()["job_id"]


@pytest.mark.asyncio
async def test_legacy_multi_ticket_attempt_counts_saved_cards_and_completion(store):
    from backend.core.report_data import collect_report_snapshot
    from backend.models.domain_02 import ScenarioTicket
    from backend.models.domain_04 import TicketResult
    await seed(store)
    async with store() as db:
        row = await db.get(ExamSession, "session")
        row.dynamic_state = {}
        db.add_all([ScenarioTicket(scenario_id="second"), ScenarioTicket(scenario_id="third")])
        await db.flush()
        db.add_all([TicketResult(session_id="session", ticket_id=ident, status=status)
                    for ident, status in [("ticket", "COMPLETED"), ("second", "COMPLETED"), ("third", "ACTIVE")]])
        await db.commit()
        snapshot = await collect_report_snapshot(db, lesson_id="lesson")
        assert snapshot["summary"]["total_cards"] == 3
        assert snapshot["summary"]["completed_cards"] == 2
        assert snapshot["summary"]["incomplete_cards"] == 1
        assert snapshot["summary"]["protocols"] == 0
