"""Durable FIFO report worker with admission and cooperative preemption."""
import asyncio
from datetime import timedelta
import logging
import os
import time

import httpx

from sqlalchemy import func, or_, select, update

from backend.core.dds_report_jobs import classify_error
from backend.core.report_data import aware, collect_report_snapshot
from backend.core.report_inference import generate_report
from backend.core.report_runtime import coordinator, confirm_runtime_idle, memory_required, ResourceMonitor, runtime_sleeping
from backend.core.reports import compact_legacy, initialize_reports, reconcile_reports, utcnow
from backend.database import AsyncSessionLocal
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.report_job import ReportJob

logger = logging.getLogger(__name__)
RETRY_DELAYS = (300, 1800, 7200)


async def learning_active(db):
    lesson = await db.scalar(select(Assignment.assignment_id).where(func.upper(Assignment.status) == "ACTIVE").limit(1))
    if lesson:
        return True
    return bool(await db.scalar(select(ExamSession.session_id).where(
        func.upper(ExamSession.status).in_(["ACTIVE", "IN_PROGRESS", "INITIALIZED"])).limit(1)))


class ReportWorker:
    def __init__(self, session_factory=None, monitor=None):
        self.sessions = session_factory or AsyncSessionLocal
        self.monitor = monitor or ResourceMonitor()
        self.task = None
        self.generation_task = None
        self.last_reconcile = 0

    async def start(self):
        if self.task and not self.task.done():
            return
        async with self.sessions() as db:
            await initialize_reports(db)
        self.task = asyncio.create_task(self.run(), name="dds_report_scheduler")

    async def stop(self):
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        async with coordinator.lock:
            await coordinator.interrupt()

    async def run(self):
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Report scheduler iteration failed: %s", type(exc).__name__)
            await asyncio.sleep(10)

    async def admission(self, db):
        if await learning_active(db):
            coordinator.idle_since = None
            return "learning_active"
        sample = self.monitor.sample()
        if sample is None:
            coordinator.idle_since = None
            return "metrics_unavailable"
        cpu, memory = sample
        if cpu >= float(os.getenv("DDS_REPORT_CPU_MAX_PERCENT", "40")):
            coordinator.idle_since = None
            return "cpu_busy"
        try:
            sleeping = await runtime_sleeping()
        except Exception:
            sleeping = True  # Conservative cold-load budget; actual request gets bounded retries.
        if memory < memory_required(sleeping):
            coordinator.idle_since = None
            return "memory_low"
        now = time.monotonic()
        if coordinator.idle_since is None:
            coordinator.idle_since = now
        if now - coordinator.idle_since < float(os.getenv("DDS_REPORT_IDLE_SECONDS", "30")):
            return "idle_window"
        if coordinator.unconfirmed_cancel:
            coordinator.unconfirmed_cancel = not await confirm_runtime_idle()
            if coordinator.unconfirmed_cancel:
                return "runtime_busy"
        return None

    async def tick(self):
        if time.monotonic() - self.last_reconcile >= 60:
            async with self.sessions() as db:
                await reconcile_reports(db)
            self.last_reconcile = time.monotonic()
        if self.generation_task and not self.generation_task.done():
            # Secondary guard for legacy activity paths and memory pressure during inference.
            async with self.sessions() as db:
                active = await learning_active(db)
            sample = self.monitor.sample()
            if active or sample is None or sample[1] < 1024 ** 3:
                async with coordinator.lock:
                    await coordinator.interrupt()
            return
        async with coordinator.lock:
            async with self.sessions() as db:
                job = await db.scalar(select(ReportJob).where(ReportJob.status == "pending",
                    or_(ReportJob.next_run_at.is_(None), ReportJob.next_run_at <= utcnow())).order_by(
                        ReportJob.created_at, ReportJob.job_id).limit(1))
                if job is None:
                    coordinator.idle_since = None
                    return
                reason = await self.admission(db)
                await db.execute(update(ReportJob).where(ReportJob.status == "pending").values(waiting_reason=reason or "queued"))
                await db.commit()
                if reason:
                    return
                self.generation_task = asyncio.create_task(self.process_single_job(job.job_id), name="dds_report_generation")
                coordinator.task = self.generation_task

    async def process_single_job(self, job_id):
        async with self.sessions() as db:
            claimed = (await db.execute(update(ReportJob).where(ReportJob.job_id == job_id,
                ReportJob.status == "pending").values(status="running", waiting_reason=None, updated_at=utcnow()).returning(
                    ReportJob.attempt))).first()
            await db.commit()
        if not claimed:
            return
        attempt = claimed[0]
        try:
            async with self.sessions() as db:
                job = await db.get(ReportJob, job_id)
                snapshot = job.snapshot
                if snapshot is None:
                    snapshot = await collect_report_snapshot(db, lesson_id=job.lesson_id, owner_id=job.owner_id,
                        period_start=job.period_start, period_end=job.period_end)
                    snapshot["period"] = {"start": aware(job.period_start).isoformat() if job.period_start else None,
                                          "end": aware(job.period_end).isoformat() if job.period_end else None}
                    await db.execute(update(ReportJob).where(ReportJob.job_id == job_id, ReportJob.attempt == attempt,
                        ReportJob.status == "running").values(snapshot=snapshot, snapshot_at=utcnow()))
                    await db.commit()
                elif "sessions" not in snapshot.get("summary", {}):
                    snapshot = compact_legacy(snapshot)
                    snapshot["period"] = {"start": aware(job.period_start).isoformat() if job.period_start else None,
                                          "end": aware(job.period_end).isoformat() if job.period_end else None}
                kind = job.kind
            result = await generate_report(snapshot, kind)
            await self.finish(job_id, attempt, status="completed", report_text=result["analysis_text"],
                model_used=result["model_used"], error_code=None, error_message=None, waiting_reason=None)
        except asyncio.CancelledError:
            await self.finish(job_id, attempt, status="pending", attempt=attempt + 1,
                              waiting_reason="learning_active", next_run_at=None)
            raise
        except Exception as exc:
            code, message = classify_error(exc)
            async with self.sessions() as db:
                job = await db.get(ReportJob, job_id)
                count = job.retry_count
            transient = code in {"llm_timeout", "llm_unavailable", "llm_error"} or isinstance(exc, TimeoutError)
            if isinstance(exc, httpx.HTTPStatusError):
                transient = exc.response.status_code >= 500 or exc.response.status_code == 429
            if transient and count < len(RETRY_DELAYS):
                await self.finish(job_id, attempt, status="pending", attempt=attempt + 1,
                    retry_count=count + 1, next_run_at=utcnow() + timedelta(seconds=RETRY_DELAYS[count]),
                    waiting_reason="retry_wait", error_code=code, error_message=message)
            else:
                await self.finish(job_id, attempt, status="failed", error_code=code, error_message=message, waiting_reason=None)
        finally:
            coordinator.idle_since = None

    async def finish(self, job_id, expected_attempt, **values):
        async with self.sessions() as db:
            await db.execute(update(ReportJob).where(ReportJob.job_id == job_id,
                ReportJob.attempt == expected_attempt, ReportJob.status == "running").values(updated_at=utcnow(), **values))
            await db.commit()


report_worker = ReportWorker()
