"""Resource-aware DDS reporting contracts, each with a private SQLite database."""
import asyncio
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.core import report_runtime, report_worker, reports
from backend.core.dds_report_llm import DDSLLMSettings, DDSReportGenerationError
from backend.core.report_data import collect_report_snapshot, student_period
from backend.core.report_inference import generate_report
from backend.models.base import Base
from backend.models.dds_report_job import LegacyDDSReportJob
from backend.models.domain_01 import StudentGroup, User
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import TicketResult
from backend.models.report_job import ReportJob

NOW = datetime(2026, 10, 19, 9, tzinfo=timezone.utc)


@pytest.fixture
async def store(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/reports.sqlite")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    report_runtime.coordinator.idle_since = None
    report_runtime.coordinator.task = None
    report_runtime.coordinator.unconfirmed_cancel = False
    yield factory
    await engine.dispose()


async def seed(factory, end=None):
    async with factory() as db:
        db.add_all([User(user_id="cadet", username="cadet", password_hash="test", role="CADET"),
                    User(user_id="teacher", username="teacher", password_hash="test", role="TEACHER")])
        db.add(ScenarioTicket(scenario_id="ticket", title="Учебная карточка"))
        await db.flush()
        db.add(StudentGroup(group_id="group", group_name="Учебная группа", teacher_id="teacher", cadet_ids=["cadet"]))
        await db.flush()
        lesson = Assignment(assignment_id="lesson", assigned_by="teacher", target_role="DISPATCHER_DDS",
            group_id="group",
            status="COMPLETED", started_at=NOW - timedelta(days=2), completed_at=NOW - timedelta(days=1))
        db.add(lesson)
        await db.flush()
        db.add(ExamSession(session_id="session", assignment_id="lesson", cadet_id="cadet", ticket_id="ticket", session_type="CARD_ACTIONS",
            status="COMPLETED", start_time=NOW - timedelta(days=2), end_time=end or NOW - timedelta(days=1),
            dynamic_state={"dds": {"queue": [{}, {}], "completed_cards": [{"card_id": "card"}],
                "notes": "PRIVATE_PHONE_NOTE", "incoming_card": {"caller": "PRIVATE_NAME"}}}))
        await db.commit()


def snapshot():
    return {"summary": {"sessions": 1}, "source_revisions": {"session": "v1"}}


def test_moscow_day_cutoff_and_seven_full_days():
    before = student_period(datetime(2026, 10, 18, 21, 9, 59, tzinfo=timezone.utc))
    after = student_period(datetime(2026, 10, 18, 21, 10, tzinfo=timezone.utc))
    assert before[1] == datetime(2026, 10, 17, 21, tzinfo=timezone.utc)
    assert after[1] == datetime(2026, 10, 18, 21, tzinfo=timezone.utc)
    assert after[1] - after[0] == timedelta(days=7)


@pytest.mark.asyncio
async def test_daily_idempotency_no_new_data_and_grade_revision(store):
    await seed(store)
    async with store() as db:
        job = await reports.request_student_report(db, "cadet", NOW)
        await db.commit()
        repeated = await reports.request_student_report(db, "cadet", NOW + timedelta(hours=1))
        assert repeated.job_id == job.job_id
        job.snapshot = await collect_report_snapshot(db, owner_id="cadet", period_start=job.period_start, period_end=job.period_end)
        job.status = "completed"
        await db.commit()
        unchanged = await reports.request_student_report(db, "cadet", NOW + timedelta(days=1))
        assert unchanged.job_id == job.job_id
        db.add(TicketResult(session_id="session", status="completed", score_total=80))
        await db.commit()
        changed = await reports.request_student_report(db, "cadet", NOW + timedelta(days=1))
        assert changed.job_id != job.job_id


@pytest.mark.asyncio
async def test_period_includes_self_training_excludes_current_day_and_other_student(store):
    await seed(store)
    start, end = student_period(NOW)
    async with store() as db:
        lesson = await db.get(Assignment, "lesson")
        lesson.card_pool_source = "self_training"
        lesson.assigned_by = None
        for sid, stamp in [("lower", start), ("older", start - timedelta(seconds=1)), ("today", end)]:
            db.add(ExamSession(session_id=sid, assignment_id="lesson", cadet_id="cadet", session_type="CARD_ACTIONS",
                               status="COMPLETED", end_time=stamp))
        await db.commit()
        result = await collect_report_snapshot(db, owner_id="cadet", period_start=start, period_end=end)
        assert set(result["source_revisions"]) == {"session", "lower"}
        assert result["summary"]["incomplete_cards"] == 2
        assert "PRIVATE" not in json.dumps(result)
        assert result["summary"]["sessions_with_score"] == 0
        assert await reports.enqueue_lesson(db, lesson) is None


@pytest.mark.asyncio
async def test_restart_import_keeps_source_and_pending_and_frozen_snapshot(store):
    async with store() as db:
        db.add(LegacyDDSReportJob(job_id="old", lesson_id="legacy", status="completed", report_text="Сохранённый отчёт"))
        db.add(ReportJob(job_id="running", lesson_id="running", status="running", snapshot=snapshot()))
        db.add(ReportJob(job_id="pending", lesson_id="pending", status="pending"))
        await db.commit()
        await reports.initialize_reports(db, NOW)
        await reports.initialize_reports(db, NOW + timedelta(days=1))
        assert (await db.get(LegacyDDSReportJob, "old")).report_text == "Сохранённый отчёт"
        old = await db.get(ReportJob, "old")
        assert old.status == "completed" and old.report_text == "Сохранённый отчёт"
        running = await db.get(ReportJob, "running", populate_existing=True)
        assert running.status == "pending" and running.attempt == 2
        assert running.snapshot == snapshot()
        assert (await db.get(ReportJob, "pending")).status == "pending"


@pytest.mark.asyncio
async def test_reconciliation_does_not_backfill_old_lessons_and_coalesces_student_jobs(store):
    await seed(store)
    async with store() as db:
        await reports.initialize_reports(db, NOW)
        await reports.reconcile_reports(db, NOW)
        assert not await db.scalar(select(ReportJob).where(ReportJob.kind == "lesson"))
        first = await db.scalar(select(ReportJob).where(ReportJob.kind == "student"))
        first_id = first.job_id
        await reports.reconcile_reports(db, NOW + timedelta(days=1))
        await db.refresh(first)
        assert first.status == "superseded"
        pending = list((await db.scalars(select(ReportJob).where(ReportJob.status == "pending"))).all())
        assert len(pending) == 1 and pending[0].job_id != first_id


@pytest.mark.asyncio
async def test_long_outage_drops_unsent_student_reports_even_without_recent_activity(store):
    await seed(store, end=NOW - timedelta(days=20))
    async with store() as db:
        db.add(ReportJob(job_id="obsolete", kind="student", scope_key="student:cadet:old", owner_id="cadet",
                         period_start=NOW - timedelta(days=25), period_end=NOW - timedelta(days=18), status="pending"))
        await db.commit()
        await reports.initialize_reports(db, NOW)
        await reports.reconcile_reports(db, NOW)
        old = await db.get(ReportJob, "obsolete", populate_existing=True)
        assert old.status == "superseded"
        assert not await db.scalar(select(ReportJob).where(ReportJob.status == "pending"))


@pytest.mark.asyncio
async def test_atomic_claim_stale_result_and_retry_delays(store, monkeypatch):
    async with store() as db:
        db.add(ReportJob(job_id="job", lesson_id="lesson", snapshot=snapshot()))
        await db.commit()
    generate = AsyncMock(return_value={"analysis_text": "Результат", "model_used": "dds-qwen"})
    monkeypatch.setattr(report_worker, "generate_report", generate)
    worker = report_worker.ReportWorker(store)
    await asyncio.gather(*(worker.process_single_job("job") for _ in range(4)))
    assert generate.await_count == 1
    await worker.finish("job", 1, status="failed", report_text="STALE")
    async with store() as db:
        job = await db.get(ReportJob, "job")
        assert job.status == "completed" and job.report_text == "Результат"
        job.status = "pending"
        await db.commit()
    generate.side_effect = httpx.ConnectError("PRIVATE ERROR")
    for index, delay in enumerate([300, 1800, 7200]):
        begin = reports.utcnow()
        await worker.process_single_job("job")
        async with store() as db:
            job = await db.get(ReportJob, "job")
            assert job.status == "pending" and job.retry_count == index + 1
            assert abs((reports.aware(job.next_run_at) - begin).total_seconds() - delay) < 3
            assert "PRIVATE" not in job.error_message
    await worker.process_single_job("job")
    async with store() as db:
        assert (await db.get(ReportJob, "job")).status == "failed"


@pytest.mark.asyncio
async def test_learning_start_cancels_generation_before_issuing_card(store, monkeypatch):
    async with store() as db:
        db.add(ReportJob(job_id="job", lesson_id="lesson", snapshot=snapshot()))
        await db.commit()
    started = asyncio.Event()
    async def slow(*args):
        started.set()
        await asyncio.Event().wait()
    monkeypatch.setattr(report_worker, "generate_report", slow)
    confirmed = AsyncMock(return_value=True)
    monkeypatch.setattr(report_runtime, "confirm_runtime_idle", confirmed)
    worker = report_worker.ReportWorker(store)
    task = asyncio.create_task(worker.process_single_job("job"))
    report_runtime.coordinator.task = task
    await started.wait()
    @report_runtime.learning_start
    async def start():
        assert task.done()
        confirmed.assert_awaited_once()
        async with store() as db:
            job = await db.get(ReportJob, "job")
            assert job.status == "pending" and job.snapshot == snapshot() and job.retry_count == 0
        return "card issued"
    assert await start() == "card issued"


@pytest.mark.asyncio
async def test_admission_requires_idle_cpu_ram_and_no_learning(store, monkeypatch):
    monitor = SimpleNamespace(sample=lambda: (10, 20 * 1024 ** 3))
    worker = report_worker.ReportWorker(store, monitor)
    monkeypatch.setattr(report_worker, "runtime_sleeping", AsyncMock(return_value=True))
    monkeypatch.setattr(report_worker.time, "monotonic", lambda: 100)
    async with store() as db:
        assert await worker.admission(db) == "idle_window"
        monkeypatch.setattr(report_worker.time, "monotonic", lambda: 131)
        assert await worker.admission(db) is None
        monitor.sample = lambda: (40, 20 * 1024 ** 3)
        assert await worker.admission(db) == "cpu_busy"
        monitor.sample = lambda: (10, 3 * 1024 ** 3)
        assert await worker.admission(db) == "memory_low"
        monitor.sample = lambda: None
        assert await worker.admission(db) == "metrics_unavailable"
        db.add(Assignment(target_role="DISPATCHER_DDS", status="ACTIVE"))
        await db.commit()
        assert await worker.admission(db) == "learning_active"


@pytest.mark.asyncio
async def test_stream_requires_complete_response_and_excludes_revision_metadata():
    async def handler(request):
        payload = json.loads(request.content)
        assert payload["stream"] is True and payload["max_tokens"] == 1200
        assert "source_revisions" not in payload["messages"][1]["content"]
        chunks = [{"choices": [{"delta": {"content": "Отчёт"}, "finish_reason": None}]},
                  {"choices": [{"delta": {}, "finish_reason": "stop"}]}]
        return httpx.Response(200, text="".join("data: " + json.dumps(c) + "\n\n" for c in chunks) + "data: [DONE]\n\n")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await generate_report(snapshot(), "student", client=client)
        assert result["analysis_text"].endswith("Рекомендации ИИ\nОтчёт")
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, text='data: [DONE]\n\n'))) as client:
        with pytest.raises(DDSReportGenerationError):
            await generate_report(snapshot(), "student", client=client)


@pytest.mark.asyncio
async def test_model_receives_inclusive_moscow_calendar_days_without_changing_snapshot():
    frozen = {**snapshot(), "period": {"start": "2026-10-11T21:00:00+00:00", "end": "2026-10-18T21:00:00+00:00"}}
    original = json.dumps(frozen, sort_keys=True)
    def handler(request):
        payload = json.loads(request.content)
        facts = json.loads(payload["messages"][1]["content"])
        assert facts["period"] == {"timezone": "Europe/Moscow", "first_day": "2026-10-12",
            "last_day_inclusive": "2026-10-18", "label": "12.10.2026 — 18.10.2026"}
        assert "service — соответствие службе" in payload["messages"][0]["content"]
        return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"Отчёт"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        text = (await generate_report(frozen, "student", client=client))["analysis_text"]
        assert "Завершённых прохождений: 1." in text
        assert "Прохождений без числовой оценки: 1." in text
        assert text.endswith("Рекомендации ИИ\nОтчёт")
    assert json.dumps(frozen, sort_keys=True) == original


def test_cgroup_memory_headroom_and_unknown_metrics(tmp_path, monkeypatch):
    (tmp_path / "memory.max").write_text(str(4 * 1024 ** 3))
    (tmp_path / "memory.current").write_text(str(3 * 1024 ** 3))
    monkeypatch.setattr(report_runtime.psutil, "cpu_percent", lambda **_: 10)
    monkeypatch.setattr(report_runtime.psutil, "virtual_memory", lambda: SimpleNamespace(available=20 * 1024 ** 3))
    monitor = report_runtime.ResourceMonitor(str(tmp_path))
    assert monitor.sample() == (10, 1024 ** 3)
    (tmp_path / "memory.current").write_text("invalid")
    assert monitor.sample() is None


@pytest.mark.asyncio
async def test_student_api_owns_identity_and_reads_do_not_generate(store, monkeypatch):
    from backend.main import app
    from backend.database import get_db
    from backend.core.security import create_access_token
    await seed(store)
    async def database():
        async with store() as db:
            yield db
    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(reports, "utcnow", lambda: NOW)
    generator = AsyncMock()
    monkeypatch.setattr(report_worker, "generate_report", generator)
    token = create_access_token(subject="cadet", role="CADET")
    teacher = create_access_token(subject="teacher", role="TEACHER")
    path = "/api/ai-analytics/students/me/reports"
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get(path)).status_code == 401
            assert (await client.get(path, headers={"Authorization": f"Bearer {teacher}"})).status_code == 403
            headers = {"Authorization": f"Bearer {token}"}
            first = await client.post(path, headers=headers, json={"owner_id": "teacher"})
            assert first.status_code == 202, first.text
            again = await client.post(path, headers=headers)
            assert again.json()["job_id"] == first.json()["job_id"]
            history = await client.get(path, headers=headers)
            assert len(history.json()) == 1
            assert history.json()[0]["period_end"].endswith("Z")
            assert "snapshot" not in history.json()[0]
            async with store() as db:
                assert (await db.get(ReportJob, first.json()["job_id"])).owner_id == "cadet"
            generator.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stop_lesson_atomically_enqueues_teacher_report(store):
    from backend.main import app
    from backend.database import get_db
    from backend.core.security import create_access_token
    await seed(store)
    async def database():
        async with store() as db:
            yield db
    async with store() as db:
        lesson = await db.get(Assignment, "lesson")
        lesson.status = "ACTIVE"
        lesson.completed_at = None
        await db.commit()
    app.dependency_overrides[get_db] = database
    token = create_access_token(subject="teacher", role="TEACHER")
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/v1/lessons/lesson/stop", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 200, response.text
            again = await client.post("/api/v1/lessons/lesson/stop", headers={"Authorization": f"Bearer {token}"})
            assert again.status_code == 200
        async with store() as db:
            jobs = list((await db.scalars(select(ReportJob))).all())
            assert len(jobs) == 1 and jobs[0].lesson_id == "lesson" and jobs[0].status == "pending"
            assert (await db.get(Assignment, "lesson")).status == "COMPLETED"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_foreign_lesson_start_cannot_preempt_reports(store, monkeypatch):
    from backend.main import app
    from backend.database import get_db
    from backend.core.security import create_access_token
    await seed(store)
    async def database():
        async with store() as db:
            yield db
    async with store() as db:
        db.add(User(user_id="outsider", username="outsider", password_hash="test", role="TEACHER"))
        await db.commit()
    interrupt = AsyncMock()
    monkeypatch.setattr(report_runtime.coordinator, "interrupt", interrupt)
    app.dependency_overrides[get_db] = database
    try:
        token = create_access_token(subject="outsider", role="TEACHER")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            result = await client.post("/api/v1/lessons/lesson/start", headers={"Authorization": f"Bearer {token}"})
            assert result.status_code == 403
        interrupt.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_cgroup_cpu_quota_blocks_even_when_host_is_idle(tmp_path, monkeypatch):
    (tmp_path / "cpu.max").write_text("100000 100000")
    (tmp_path / "cpu.stat").write_text("usage_usec 0\n")
    monkeypatch.setattr(report_runtime.psutil, "cpu_percent", lambda **_: 5)
    monkeypatch.setattr(report_runtime.psutil, "virtual_memory", lambda: SimpleNamespace(available=20 * 1024 ** 3))
    clock = [1.0]
    monkeypatch.setattr(report_runtime.time, "monotonic", lambda: clock[0])
    monitor = report_runtime.ResourceMonitor(str(tmp_path))
    assert monitor.sample() is None
    clock[0] = 2
    (tmp_path / "cpu.stat").write_text("usage_usec 800000\n")
    assert monitor.sample()[0] == 80
