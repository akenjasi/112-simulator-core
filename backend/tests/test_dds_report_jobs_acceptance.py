"""Independent A-04 acceptance owned by the supervising tech lead.

HTTP contracts and database behavior are verified independently of executor tests.
"""
import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from backend.main import app
from backend.database import AsyncSessionLocal
from backend.tests.test_dds_report_data_acceptance import fixture_data


def path(d, lesson="selected"):
    return f"/api/ai-analytics/lessons/{d['lessons'][lesson]}/report"


async def request(d, method="post", lesson="selected", role="teacher", **kwargs):
    async with AsyncClient(app=app, base_url="http://test") as c:
        return await getattr(c, method)(path(d, lesson), headers=d["headers"][role], **kwargs)


@pytest.mark.asyncio
async def test_independent_access_checked_on_both_read_and_create():
    d = await fixture_data()
    for method in ("get", "post"):
        async with AsyncClient(app=app, base_url="http://test") as c:
            r = await getattr(c, method)(path(d))
            assert r.status_code == 401, r.text
        for role in ("cadet", "other"):
            r = await request(d, method, role=role)
            assert r.status_code == 403, r.text
    created = await request(d)
    assert created.status_code == 202, created.text
    for role in ("cadet", "other"):
        r = await request(d, "get", role=role)
        assert r.status_code == 403, r.text
        assert created.json()["job_id"] not in r.text
    assert (await request(d, "get", role="admin")).status_code == 200


@pytest.mark.asyncio
async def test_independent_wrong_lesson_type_and_status_rejected():
    d = await fixture_data()
    for method in ("get", "post"):
        for lesson in ("active", "operator"):
            r = await request(d, method, lesson=lesson)
            assert r.status_code == 409, r.text
    async with AsyncClient(app=app, base_url="http://test") as c:
        for method in ("get", "post"):
            r = await getattr(c, method)(f"/api/ai-analytics/lessons/{uuid.uuid4()}/report", headers=d["headers"]["teacher"])
            assert r.status_code == 404, r.text


@pytest.mark.asyncio
async def test_independent_snapshot_is_private_and_post_is_idempotent():
    d = await fixture_data()
    assert (await request(d, "get")).status_code == 404
    a = await request(d)
    assert a.status_code == 202, a.text
    body = a.json()
    assert body["lesson_id"] == d["lessons"]["selected"]
    assert body["status"] == "pending"
    assert body["attempt"] == 1
    assert body.get("report_text") is None and body.get("error_code") is None
    assert "snapshot" not in body and "EVIDENCE_" not in a.text
    b = await request(d, json={"retry": True})
    assert b.status_code == 202 and b.json()["job_id"] == body["job_id"]
    assert b.json()["attempt"] == 1
    c = await request(d, "get")
    assert c.status_code == 200 and c.json() == body


@pytest.mark.asyncio
async def test_independent_parallel_posts_create_one_attempt():
    d = await fixture_data()
    responses = await asyncio.gather(*(request(d) for _ in range(5)))
    assert all(r.status_code == 202 for r in responses), [(r.status_code, r.text) for r in responses]
    assert len({r.json()["job_id"] for r in responses}) == 1
    assert {r.json()["attempt"] for r in responses} == {1}


@pytest.mark.asyncio
async def test_independent_lessons_have_separate_jobs():
    d = await fixture_data()
    a = await request(d)
    b = await request(d, lesson="same_group_other_lesson")
    assert a.status_code == b.status_code == 202
    assert a.json()["job_id"] != b.json()["job_id"]
    assert (await request(d, "get")).json()["lesson_id"] == d["lessons"]["selected"]


@pytest.mark.asyncio
async def test_independent_completed_read_survives_sessions_and_cannot_regenerate():
    from backend.models.dds_report_job import DDSReportJob
    d = await fixture_data()
    initial = await request(d)
    assert initial.status_code == 202, initial.text
    async with AsyncSessionLocal() as db:
        await db.execute(update(DDSReportJob).where(DDSReportJob.lesson_id == d["lessons"]["selected"]).values(
            status="completed", report_text="Проверенный сохранённый результат", model_used="dds-qwen"))
        await db.commit()
    for kwargs in ({}, {"json": {"retry": True}}):
        r = await request(d, **kwargs)
        assert r.status_code == 200, r.text
        assert r.json()["job_id"] == initial.json()["job_id"]
        assert r.json()["attempt"] == 1
        assert r.json()["report_text"] == "Проверенный сохранённый результат"
    read = await request(d, "get")
    assert read.json()["report_text"] == "Проверенный сохранённый результат"
    assert read.json()["model_used"] == "dds-qwen"


@pytest.mark.asyncio
async def test_independent_failed_retry_is_explicit_atomic_and_clears_output():
    from backend.models.dds_report_job import DDSReportJob
    d = await fixture_data()
    initial = await request(d)
    assert initial.status_code == 202, initial.text
    async with AsyncSessionLocal() as db:
        await db.execute(update(DDSReportJob).where(DDSReportJob.lesson_id == d["lessons"]["selected"]).values(
            status="failed", error_code="generation_failed", report_text=None))
        await db.commit()
    assert (await request(d)).status_code == 409
    failed = await request(d, "get")
    assert failed.status_code == 200 and failed.json()["status"] == "failed"
    results = await asyncio.gather(*(request(d, json={"retry": True}) for _ in range(5)))
    assert all(r.status_code == 202 for r in results), [(r.status_code, r.text) for r in results]
    assert {r.json()["attempt"] for r in results} == {2}
    assert {r.json()["job_id"] for r in results} == {initial.json()["job_id"]}
    assert all(r.json().get("error_code") is None and r.json().get("report_text") is None for r in results)


@pytest.mark.asyncio
async def test_independent_snapshot_contains_only_selected_evidence_and_is_frozen():
    import json
    from backend.models.dds_report_job import DDSReportJob
    from backend.models.domain_04 import EvaluationResult
    d = await fixture_data()
    r = await request(d)
    assert r.status_code == 202, r.text
    async with AsyncSessionLocal() as db:
        job = (await db.execute(select(DDSReportJob).where(DDSReportJob.lesson_id == d["lessons"]["selected"]))).scalar_one()
        snapshot_before = json.dumps(job.snapshot, sort_keys=True, ensure_ascii=False)
        assert "EVIDENCE_selected_0" in snapshot_before
        for private in ("EVIDENCE_foreign", "EVIDENCE_same_group_other_lesson", "EVIDENCE_in_progress", "PRIVATE_CALLER"):
            assert private not in snapshot_before
        await db.execute(update(EvaluationResult).where(EvaluationResult.session_id == d["sessions"]["selected"]).values(errors_list=["LATER_EDIT"]))
        await db.commit()
    assert (await request(d)).json()["attempt"] == 1
    async with AsyncSessionLocal() as db:
        job = (await db.execute(select(DDSReportJob).where(DDSReportJob.lesson_id == d["lessons"]["selected"]))).scalar_one()
        assert json.dumps(job.snapshot, sort_keys=True, ensure_ascii=False) == snapshot_before
        await db.execute(update(DDSReportJob).where(DDSReportJob.job_id == job.job_id).values(status="failed", error_code="interrupted"))
        await db.commit()
    assert (await request(d, json={"retry": True})).json()["attempt"] == 2
    async with AsyncSessionLocal() as db:
        job = (await db.execute(select(DDSReportJob).where(DDSReportJob.lesson_id == d["lessons"]["selected"]))).scalar_one()
        assert "LATER_EDIT" in json.dumps(job.snapshot)


@pytest.mark.asyncio
async def test_independent_worker_claims_once_and_uses_saved_snapshot(monkeypatch):
    from backend.core import dds_report_jobs as jobs
    d = await fixture_data()
    created = await request(d)
    assert created.status_code == 202, created.text
    calls = []

    async def generate(snapshot):
        calls.append(snapshot)
        await asyncio.sleep(0.03)
        return {"lesson_id": snapshot["lesson_id"], "analysis_text": "Независимый результат", "model_used": "dds-qwen"}

    monkeypatch.setattr(jobs, "generate_dds_lesson_report", generate)
    worker = jobs.DDSReportJobWorker()
    await asyncio.gather(*(worker.process_single_job(created.json()["job_id"]) for _ in range(4)))
    assert len(calls) == 1, "Concurrent claims must not invoke LLM more than once"
    assert calls[0]["lesson_id"] == d["lessons"]["selected"]
    r = await request(d, "get")
    assert r.json()["status"] == "completed"
    assert r.json()["report_text"] == "Независимый результат"
    await worker.process_single_job(created.json()["job_id"])
    assert len(calls) == 1


from backend.tests.test_dds_report_llm_acceptance import upstream


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["length", "empty", "network", "http_error", "timeout", "invalid_json"])
async def test_independent_upstream_failures_never_complete_or_leak(kind, upstream):
    from backend.core import dds_report_jobs as jobs
    import httpx
    d = await fixture_data()
    created = await request(d)
    assert created.status_code == 202, created.text
    calls, _, state = upstream
    if kind == "length":
        state["body"]["choices"][0]["finish_reason"] = "length"
    elif kind == "empty":
        state["body"]["choices"][0]["message"]["content"] = ""
    elif kind == "network":
        state["exception"] = httpx.ConnectError("SECRET_UPSTREAM_DETAIL")
    elif kind == "timeout":
        state["exception"] = httpx.ReadTimeout("SECRET_UPSTREAM_DETAIL")
    elif kind == "invalid_json":
        state["raw"] = b"SECRET_UPSTREAM_DETAIL"
    else:
        state["status"] = 503
        state["raw"] = b"SECRET_UPSTREAM_DETAIL"
    await jobs.DDSReportJobWorker().process_single_job(created.json()["job_id"])
    r = await request(d, "get")
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "failed"
    expected_codes = {"length":"length_exceeded", "empty":"empty_response", "network":"llm_unavailable",
                      "http_error":"llm_error", "timeout":"llm_timeout", "invalid_json":"llm_error"}
    assert b["error_code"] == expected_codes[kind]
    assert b.get("report_text") is None
    assert "SECRET_UPSTREAM_DETAIL" not in r.text and "EVIDENCE_" not in r.text
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_independent_restart_marks_unfinished_and_preserves_completed():
    from backend.core import dds_report_jobs as jobs
    from backend.models.dds_report_job import DDSReportJob
    d = await fixture_data()
    a = await request(d)
    b = await request(d, lesson="same_group_other_lesson")
    assert a.status_code == b.status_code == 202
    async with AsyncSessionLocal() as db:
        await db.execute(update(DDSReportJob).where(DDSReportJob.job_id == b.json()["job_id"]).values(
            status="completed", report_text="Сохранено до перезапуска", model_used="dds-qwen"))
        await db.commit()
    worker = jobs.DDSReportJobWorker()
    await worker.start()
    try:
        r = await request(d, "get")
        assert r.json()["status"] == "failed" and r.json()["error_code"] == "interrupted"
        preserved = await request(d, "get", lesson="same_group_other_lesson")
        assert preserved.json()["status"] == "completed"
        assert preserved.json()["report_text"] == "Сохранено до перезапуска"
        assert (await request(d)).status_code == 409
    finally:
        await worker.stop()


@pytest.mark.asyncio
async def test_independent_shutdown_interrupts_inflight_without_phantom_success(monkeypatch):
    from backend.core import dds_report_jobs as jobs
    started = asyncio.Event()

    async def blocked(snapshot):
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(jobs, "generate_dds_lesson_report", blocked)
    worker = jobs.DDSReportJobWorker()
    await worker.start()
    try:
        d = await fixture_data()
        created = await request(d)
        assert created.status_code == 202, created.text
        worker.submit(created.json()["job_id"])
        await asyncio.wait_for(started.wait(), 3)
        assert (await request(d, "get")).json()["status"] == "running"
    finally:
        await worker.stop()
    r = await request(d, "get")
    assert r.json()["status"] == "failed" and r.json()["error_code"] == "interrupted"
    assert r.json().get("report_text") is None


@pytest.mark.asyncio
async def test_independent_old_attempt_cannot_overwrite_new_running_attempt(monkeypatch):
    from backend.core import dds_report_jobs as jobs
    from backend.models.dds_report_job import DDSReportJob
    d = await fixture_data()
    created = await request(d)
    assert created.status_code == 202, created.text
    entered, release = asyncio.Event(), asyncio.Event()

    async def delayed(snapshot):
        entered.set()
        await release.wait()
        return {"lesson_id": snapshot["lesson_id"], "analysis_text": "STALE_RESULT", "model_used": "dds-qwen"}

    monkeypatch.setattr(jobs, "generate_dds_lesson_report", delayed)
    worker = jobs.DDSReportJobWorker()
    task = asyncio.create_task(worker.process_single_job(created.json()["job_id"]))
    try:
        await asyncio.wait_for(entered.wait(), 3)
        async with AsyncSessionLocal() as db:
            await db.execute(update(DDSReportJob).where(DDSReportJob.job_id == created.json()["job_id"]).values(
                status="running", attempt=2, report_text=None))
            await db.commit()
        release.set()
        await asyncio.wait_for(task, 3)
        r = await request(d, "get")
        assert r.json()["attempt"] == 2
        assert r.json()["status"] == "running" and r.json().get("report_text") is None
    finally:
        release.set()
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("lesson", ["empty", "no_results"])
async def test_independent_insufficient_evidence_fails_before_llm(lesson, upstream):
    from backend.core import dds_report_jobs as jobs
    d = await fixture_data()
    r = await request(d, lesson=lesson)
    assert r.status_code == 202, r.text
    await jobs.DDSReportJobWorker().process_single_job(r.json()["job_id"])
    b = (await request(d, "get", lesson=lesson)).json()
    assert b["status"] == "failed" and b["error_code"] == "insufficient_data"
    assert not upstream[0]


@pytest.mark.asyncio
async def test_independent_unexpected_exception_is_sanitized_in_response_and_logs(monkeypatch, caplog):
    from backend.core import dds_report_jobs as jobs
    d = await fixture_data()
    r = await request(d)

    async def broken(snapshot):
        raise RuntimeError("SECRET_SNAPSHOT_SQL_PARAMETER")

    monkeypatch.setattr(jobs, "generate_dds_lesson_report", broken)
    await jobs.DDSReportJobWorker().process_single_job(r.json()["job_id"])
    result = await request(d, "get")
    assert result.json()["status"] == "failed"
    assert "SECRET_SNAPSHOT_SQL_PARAMETER" not in result.text
    assert "SECRET_SNAPSHOT_SQL_PARAMETER" not in caplog.text


@pytest.mark.asyncio
async def test_independent_database_recovery_error_blocks_worker_start(monkeypatch, caplog):
    from backend.core import dds_report_jobs as jobs

    def unavailable():
        raise RuntimeError("SECRET_DB_PARAMETERS")

    monkeypatch.setattr(jobs, "AsyncSessionLocal", unavailable)
    worker = jobs.DDSReportJobWorker()
    try:
        with pytest.raises(Exception):
            await worker.start()
        assert not worker._worker_task or worker._worker_task.done()
        assert "SECRET_DB_PARAMETERS" not in caplog.text
    finally:
        await worker.stop()


@pytest.mark.asyncio
async def test_independent_repeated_posts_enqueue_once(monkeypatch):
    from backend.core import dds_report_jobs as jobs
    d = await fixture_data()
    submissions = []
    monkeypatch.setattr(jobs.dds_report_job_worker, "submit", submissions.append)
    r = await request(d)
    assert r.status_code == 202, r.text
    for _ in range(4):
        assert (await request(d, json={"retry":True})).status_code == 202
    assert submissions == [r.json()["job_id"]]


@pytest.mark.asyncio
async def test_independent_llm_runs_without_open_worker_database_session(monkeypatch):
    from contextlib import asynccontextmanager
    from backend.core import dds_report_jobs as jobs
    d = await fixture_data()
    r = await request(d)
    assert r.status_code == 202, r.text
    sessions_open = 0
    original_factory = jobs.AsyncSessionLocal

    @asynccontextmanager
    async def counted_session():
        nonlocal sessions_open
        async with original_factory() as session:
            sessions_open += 1
            try:
                yield session
            finally:
                sessions_open -= 1

    async def generator(snapshot):
        assert sessions_open == 0, "Worker must release DB sessions before inference"
        return {"lesson_id": snapshot["lesson_id"], "analysis_text":"Сессия БД закрыта", "model_used":"dds-qwen"}

    monkeypatch.setattr(jobs, "AsyncSessionLocal", counted_session)
    monkeypatch.setattr(jobs, "generate_dds_lesson_report", generator)
    await jobs.DDSReportJobWorker().process_single_job(r.json()["job_id"])
    b = (await request(d, "get")).json()
    assert b["status"] == "completed" and b["report_text"] == "Сессия БД закрыта"
