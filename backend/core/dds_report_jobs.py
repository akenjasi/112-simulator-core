"""DDS Lesson Report Background Worker and Job Lifecycle Management (Task A-04).

Architectural constraint:
-------------------------
This version supports exactly ONE backend worker process (single backend process constraint).
Background report generation runs in-process via FastAPI lifespan without distributed brokers
(e.g., Redis or Celery). Multi-process or multi-replica backend deployments are not supported
in this release without an external distributed queue and locking mechanism.

Invariants:
-----------
- Database sessions and transactions are NEVER held open during LLM HTTP calls.
- Every report job corresponds to a unique lesson_id.
- Snapshot is frozen at creation or explicit retry and passed directly to A-03 generator.
- Atomic claim guarantees only the single winning claimant generates the report.
- Completion/failure/cancellation writes require exact matching job_id, attempt, and running status.
- Stale attempts can never overwrite a newer attempt.
- Previous pending/running jobs are marked failed with error_code='interrupted' on startup.
- Startup recovery failure raises and halts startup (never silently ignored).
- Errors are strictly sanitized: no secrets, raw tracebacks, SQL parameters, or student personal data.
"""

import asyncio
import copy
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import AsyncSessionLocal
from backend.models.dds_report_job import DDSReportJob
from backend.core.dds_report_llm import (
    DDSReportConfigurationError,
    DDSReportGenerationError,
    generate_dds_lesson_report,
)

logger = logging.getLogger("dds_report_jobs")


# ─── Error Classification and Sanitization ───────────────────────────────────

def classify_error(exc: Exception) -> Tuple[str, str]:
    """Sanitize and classify an exception into (error_code, sanitized_message).

    Guarantees:
    - Never leaks secrets, tokens, credentials, or raw stack traces.
    - Never leaks cadet personal data, raw JSON dumps, or SQL parameters.
    - Returns standardized error codes.
    """
    if isinstance(exc, asyncio.CancelledError):
        return "interrupted", "Генерация отчета была прервана."

    msg = str(exc) if exc else ""
    msg_lower = msg.lower()

    if "interrupted" in msg_lower or "прерван" in msg_lower:
        return "interrupted", "Генерация отчета была прервана."

    if "недостаточно данных" in msg_lower or "insufficient" in msg_lower:
        return "insufficient_data", "Недостаточно данных завершенного занятия для формирования отчета."

    if "максимально допустимый" in msg_lower or "max_input_chars" in msg_lower or "oversize" in msg_lower:
        return "input_too_large", "Объем данных занятия превышает установленный лимит входного контекста."

    if "finish_reason='length'" in msg_lower or "лимит токенов" in msg_lower:
        return "length_exceeded", "Превышен лимит токенов генерации отчета."

    if (
        "пустой текст" in msg_lower
        or "без вариантов генерации" in msg_lower
        or "content отсутствует" in msg_lower
        or "empty" in msg_lower
    ):
        return "empty_response", "Сервер инференса вернул пустой ответ."

    if (
        isinstance(exc, httpx.TimeoutException)
        or "время ожидания" in msg_lower
        or "таймаут" in msg_lower
        or "timeout" in msg_lower
    ):
        return "llm_timeout", "Истекло время ожидания ответа от сервера инференса."

    if (
        isinstance(exc, httpx.ConnectError)
        or "соединени" in msg_lower
        or "connect" in msg_lower
    ):
        return "llm_unavailable", "Сервер нейросетевого инференса недоступен."

    if (
        "невалидный json" in msg_lower
        or "непредвиденный формат" in msg_lower
        or "статусом http" in msg_lower
        or "http" in msg_lower
        or "код ошибки" in msg_lower
        or "500" in msg_lower
        or "502" in msg_lower
        or "503" in msg_lower
    ):
        return "llm_error", "Ошибка при обращении к серверу нейросетевого инференса."

    if isinstance(exc, DDSReportConfigurationError) or "конфигурац" in msg_lower:
        return "configuration_error", "Ошибка конфигурации сервиса генерации отчетов."

    return "generation_failed", "Ошибка при формировании нейроотчета занятия."


# ─── Worker Implementation ───────────────────────────────────────────────────

class DDSReportJobWorker:
    """In-process singleton worker for DDS neural report generation.

    Constraint: single backend process.
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._running: bool = False
        self._worker_task: Optional[asyncio.Task] = None
        self._current_job_id: Optional[str] = None
        self._current_attempt: Optional[int] = None
        self._stop_event: asyncio.Event = asyncio.Event()

    async def start(self) -> None:
        """Startup lifecycle hook.

        1. Marks any lingering pending/running jobs from a previous process run
           as failed with error_code='interrupted'. Completed jobs are preserved.
           Failure to recover raises and halts startup.
        2. Starts the background processing loop.
        """
        logger.info("Initializing DDS Report Job Worker (single-process backend constraint)...")
        await self._recover_interrupted_jobs()

        self._running = True
        self._stop_event.clear()
        self._worker_task = asyncio.create_task(self._run_loop(), name="dds_report_job_worker")
        logger.info("DDS Report Job Worker background loop started.")

    async def stop(self, timeout: float = 5.0) -> None:
        """Shutdown lifecycle hook.

        Stops the worker loop cleanly and marks in-flight jobs as interrupted.
        """
        logger.info("Stopping DDS Report Job Worker...")
        self._running = False
        self._stop_event.set()

        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await asyncio.wait_for(self._worker_task, timeout=timeout)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        if self._current_job_id and self._current_attempt is not None:
            await self._mark_interrupted(
                self._current_job_id,
                self._current_attempt,
                "Генерация отчета была прервана остановкой сервера.",
            )

        logger.info("DDS Report Job Worker stopped.")

    def submit(self, job_id: str) -> None:
        """Compatibility notification; the production scheduler polls the durable table.

        This historical worker is no longer started by the application. Keeping
        the hook avoids introducing a second in-memory production queue.
        """
        if self._running:
            # Explicit legacy worker instances retain their documented lifecycle.
            self._queue.put_nowait(job_id)

    async def _recover_interrupted_jobs(self) -> None:
        """Recover lingering pending/running jobs on process startup.

        Must raise on failure so server startup halts instead of proceeding
        with unrecovered jobs.
        """
        async with AsyncSessionLocal() as session:
            now = datetime.now(timezone.utc)
            stmt = (
                update(DDSReportJob)
                .where(DDSReportJob.status.in_(["pending", "running"]))
                .values(
                    status="failed",
                    error_code="interrupted",
                    error_message="Генерация отчета была прервана перезапуском сервера.",
                    report_text=None,
                    updated_at=now,
                )
            )
            result = await session.execute(stmt)
            await session.commit()
            if result.rowcount > 0:
                logger.warning(
                    "Marked %d lingering pending/running DDS report jobs as interrupted.",
                    result.rowcount,
                )

    async def _run_loop(self) -> None:
        """Continuous worker loop picking up submitted job IDs."""
        while self._running:
            try:
                try:
                    job_id = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                except asyncio.CancelledError:
                    break

                await self.process_single_job(job_id)
                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.error("Error encountered in DDS report worker loop.")

    async def process_single_job(self, job_id: str) -> None:
        """Execute generation for a single job with atomic claim and strict DB session isolation."""
        now = datetime.now(timezone.utc)
        snapshot: Optional[Dict[str, Any]] = None
        attempt: Optional[int] = None

        # 1. Atomic claim: UPDATE WHERE job_id AND status=pending RETURNING snapshot, attempt.
        # Snapshot and attempt are read while owning the claim. Only the winning claimant generates.
        async with AsyncSessionLocal() as session:
            stmt = (
                update(DDSReportJob)
                .where(
                    DDSReportJob.job_id == job_id,
                    DDSReportJob.status == "pending",
                )
                .values(status="running", updated_at=now)
                .returning(DDSReportJob.snapshot, DDSReportJob.attempt)
            )
            res = await session.execute(stmt)
            row = res.first()
            if not row:
                await session.rollback()
                logger.debug("Job %s could not be claimed (already claimed or not pending).", job_id)
                return
            snapshot = copy.deepcopy(row[0])
            attempt = row[1]
            await session.commit()

        # Database session is now CLOSED.
        # Only the winning claimant reached this point!
        self._current_job_id = job_id
        self._current_attempt = attempt

        try:
            if not snapshot:
                await self._mark_failed(
                    job_id,
                    attempt,
                    "insufficient_data",
                    "Отсутствует снимок данных завершенного занятия для генерации отчета.",
                )
                return

            # 2. Invoke A-03 LLM generation (zero DB connections held)
            try:
                report_result = await generate_dds_lesson_report(snapshot)
            except Exception as exc:
                err_code, err_msg = classify_error(exc)
                await self._mark_failed(job_id, attempt, err_code, err_msg)
                return

            # 3. Persist success result: condition on job_id, attempt, and running status
            async with AsyncSessionLocal() as session:
                now_comp = datetime.now(timezone.utc)
                stmt = (
                    update(DDSReportJob)
                    .where(
                        DDSReportJob.job_id == job_id,
                        DDSReportJob.attempt == attempt,
                        DDSReportJob.status == "running",
                    )
                    .values(
                        status="completed",
                        report_text=report_result["analysis_text"],
                        model_used=report_result.get("model_used"),
                        error_code=None,
                        error_message=None,
                        updated_at=now_comp,
                    )
                )
                res = await session.execute(stmt)
                await session.commit()
                if res.rowcount > 0:
                    logger.info("Successfully completed DDS report job %s (attempt %d)", job_id, attempt)
                else:
                    logger.warning("Stale completion ignored for job %s (attempt %d)", job_id, attempt)

        except asyncio.CancelledError:
            await self._mark_interrupted(
                job_id,
                attempt,
                "Генерация отчета была прервана отменой процесса.",
            )
            raise
        except Exception as exc:
            err_code, err_msg = classify_error(exc)
            logger.error("Job %s execution failed with error_code=%s", job_id, err_code)
            await self._mark_failed(job_id, attempt, err_code, err_msg)
        finally:
            if self._current_job_id == job_id:
                self._current_job_id = None
                self._current_attempt = None

    async def _mark_failed(
        self,
        job_id: str,
        attempt: int,
        error_code: str,
        error_message: str,
    ) -> None:
        """Mark job as failed, conditioned on same job_id, attempt, and running status."""
        try:
            async with AsyncSessionLocal() as session:
                now = datetime.now(timezone.utc)
                stmt = (
                    update(DDSReportJob)
                    .where(
                        DDSReportJob.job_id == job_id,
                        DDSReportJob.attempt == attempt,
                        DDSReportJob.status == "running",
                    )
                    .values(
                        status="failed",
                        report_text=None,
                        error_code=error_code,
                        error_message=error_message,
                        updated_at=now,
                    )
                )
                res = await session.execute(stmt)
                await session.commit()
                if res.rowcount > 0:
                    logger.warning(
                        "Marked DDS report job %s as failed (code=%s, attempt=%d)",
                        job_id,
                        error_code,
                        attempt,
                    )
                else:
                    logger.warning(
                        "Stale failure write ignored for job %s (attempt %d)",
                        job_id,
                        attempt,
                    )
        except Exception:
            logger.error("Failed to record failure status for job %s", job_id)

    async def _mark_interrupted(
        self,
        job_id: str,
        attempt: int,
        message: str,
    ) -> None:
        """Mark in-flight job as interrupted, conditioned on same job_id, attempt, and running status."""
        try:
            async with AsyncSessionLocal() as session:
                now = datetime.now(timezone.utc)
                stmt = (
                    update(DDSReportJob)
                    .where(
                        DDSReportJob.job_id == job_id,
                        DDSReportJob.attempt == attempt,
                        DDSReportJob.status == "running",
                    )
                    .values(
                        status="failed",
                        report_text=None,
                        error_code="interrupted",
                        error_message=message,
                        updated_at=now,
                    )
                )
                res = await session.execute(stmt)
                await session.commit()
                if res.rowcount > 0:
                    logger.warning(
                        "Marked in-flight DDS report job %s as interrupted (attempt %d)",
                        job_id,
                        attempt,
                    )
        except Exception:
            logger.error("Failed to record interrupted status for job %s", job_id)


# Global worker instance
dds_report_job_worker = DDSReportJobWorker()
