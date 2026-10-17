"""API Router for DDS Lesson Report Background Jobs (Task A-04).

Endpoints:
  POST /api/ai-analytics/lessons/{lesson_id}/report — Create or retrieve report generation job.
  GET  /api/ai-analytics/lessons/{lesson_id}/report — Retrieve existing report job or result.

Architectural constraint:
  Single backend process constraint. Background execution runs in-process via
  the singleton DDSReportJobWorker.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user
from backend.core.dds_report_data import collect_lesson_report_data
from backend.core.dds_report_jobs import dds_report_job_worker
from backend.database import get_db
from backend.models.domain_01 import User
from backend.models.domain_03 import Assignment
from backend.models.dds_report_job import DDSReportJob

logger = logging.getLogger("router_dds_reports")

router = APIRouter(
    prefix="/api/ai-analytics",
    tags=["DDS Reports"],
)


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class DDSReportJobCreateRequest(BaseModel):
    """Optional payload for POST /lessons/{lesson_id}/report."""
    retry: bool = False


class DDSReportJobResponse(BaseModel):
    """Response contract for DDS report job status and result.

    Invariant:
    - report_text is populated ONLY when status == 'completed'.
    - error_code is populated ONLY when status == 'failed'.
    - model_used is nullable.
    - snapshot is never returned in the API response.
    """
    model_config = ConfigDict(from_attributes=True)

    job_id: str
    lesson_id: str
    status: str
    attempt: int
    created_at: datetime
    updated_at: datetime
    report_text: Optional[str] = None
    error_code: Optional[str] = None
    model_used: Optional[str] = None


# ─── Helper Functions ────────────────────────────────────────────────────────

def format_job_response(job: DDSReportJob) -> DDSReportJobResponse:
    """Format DB model into response schema enforcing contract field rules."""
    created = job.created_at
    if created and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)

    updated = job.updated_at
    if updated and updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)

    return DDSReportJobResponse(
        job_id=job.job_id,
        lesson_id=job.lesson_id,
        status=job.status,
        attempt=job.attempt,
        created_at=created,
        updated_at=updated,
        report_text=job.report_text if job.status == "completed" else None,
        error_code=job.error_code if job.status == "failed" else None,
        model_used=job.model_used,
    )


async def verify_lesson_access(
    lesson_id: str,
    db: AsyncSession,
    current_user: User,
) -> Assignment:
    """Enforce authorization and lesson eligibility checks prior to report access.

    Access rules (identical to Task A-02):
    - 401 if unauthenticated (enforced by get_current_user).
    - 403 if role is CADET or not in (ADMIN, TEACHER).
    - 404 if lesson does not exist.
    - 403 if role is TEACHER and lesson.assigned_by != current_user.user_id.
    - 409 if lesson status is not COMPLETED or target_role is not DISPATCHER_DDS.
    """
    if current_user.role not in ("ADMIN", "TEACHER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Cadets are not authorized to access lesson reports.",
        )

    stmt = select(Assignment).where(Assignment.assignment_id == lesson_id)
    res = await db.execute(stmt)
    lesson = res.scalar_one_or_none()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lesson '{lesson_id}' not found.",
        )

    if current_user.role == "TEACHER" and lesson.assigned_by != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Teachers can only access report data for their own lessons.",
        )

    status_str = (lesson.status or "").strip().upper()
    target_role_str = (lesson.target_role or "").strip().upper()
    if status_str != "COMPLETED" or target_role_str != "DISPATCHER_DDS":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lesson is not completed or target role is not DISPATCHER_DDS.",
        )

    return lesson


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/lessons/{lesson_id}/report",
    response_model=DDSReportJobResponse,
)
async def create_or_get_lesson_report_job(
    lesson_id: str,
    response: Response,
    req: Optional[DDSReportJobCreateRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DDSReportJobResponse:
    """Create or retrieve a background DDS neural report job for a completed lesson.

    Behavior:
    - POST for pending/running returns existing job (202 Accepted).
    - POST for completed returns existing result (200 OK).
    - POST for failed returns 409 Conflict unless explicit retry=true (202 Accepted, new attempt).
    - retry=true does NOT restart completed or active (pending/running) jobs.
    - Snapshot from A-02 is captured at creation or retry attempt and frozen in DB.
    - Only newly created or successfully reset jobs get queue entries (avoid duplicate queue).
    """
    lesson = await verify_lesson_access(lesson_id, db, current_user)
    retry_requested = req.retry if req is not None else False

    # Check for existing job using populate_existing to guarantee fresh state
    stmt = (
        select(DDSReportJob)
        .where(DDSReportJob.lesson_id == lesson_id)
        .execution_options(populate_existing=True)
    )
    res = await db.execute(stmt)
    existing_job = res.scalar_one_or_none()

    if existing_job:
        # Existing completed job: return 200, retry does not restart completed
        if existing_job.status == "completed":
            response.status_code = status.HTTP_200_OK
            return format_job_response(existing_job)

        # Existing active job (pending or running): return 202, retry does not restart active.
        # Do NOT re-enqueue existing active jobs on repeated POST!
        if existing_job.status in ("pending", "running"):
            response.status_code = status.HTTP_202_ACCEPTED
            return format_job_response(existing_job)

        # Existing failed job
        if existing_job.status == "failed":
            if not retry_requested:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Previous report generation failed. Specify retry=true to retry.",
                )

            # Explicit retry: capture observed attempt and condition update on lesson_id, status=failed, attempt=observed_attempt
            observed_attempt = existing_job.attempt
            snapshot = await collect_lesson_report_data(db, lesson_id, lesson=lesson)
            now = datetime.now(timezone.utc)

            update_stmt = (
                update(DDSReportJob)
                .where(
                    DDSReportJob.lesson_id == lesson_id,
                    DDSReportJob.status == "failed",
                    DDSReportJob.attempt == observed_attempt,
                )
                .values(
                    status="pending",
                    attempt=observed_attempt + 1,
                    snapshot=snapshot,
                    report_text=None,
                    error_code=None,
                    error_message=None,
                    model_used=None,
                    updated_at=now,
                )
            )
            upd_res = await db.execute(update_stmt)
            await db.commit()

            # Refresh ORM state with populate_existing
            stmt = (
                select(DDSReportJob)
                .where(DDSReportJob.lesson_id == lesson_id)
                .execution_options(populate_existing=True)
            )
            res = await db.execute(stmt)
            job = res.scalar_one()

            if upd_res.rowcount > 0:
                # Winning retry claimant: enqueue to worker
                dds_report_job_worker.submit(job.job_id)
                response.status_code = status.HTTP_202_ACCEPTED
                return format_job_response(job)
            else:
                # Concurrent update won the race. Return actual state semantics
                if job.status == "completed":
                    response.status_code = status.HTTP_200_OK
                elif job.status in ("pending", "running"):
                    response.status_code = status.HTTP_202_ACCEPTED
                elif job.status == "failed":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Previous report generation failed. Specify retry=true to retry.",
                    )
                return format_job_response(job)

    # No existing job: create new job
    snapshot = await collect_lesson_report_data(db, lesson_id, lesson=lesson)
    now = datetime.now(timezone.utc)
    new_job = DDSReportJob(
        job_id=str(uuid.uuid4()),
        lesson_id=lesson_id,
        status="pending",
        attempt=1,
        snapshot=snapshot,
        created_at=now,
        updated_at=now,
    )
    db.add(new_job)

    try:
        await db.commit()
        await db.refresh(new_job)
        # Only newly created job gets queue entry
        dds_report_job_worker.submit(new_job.job_id)
        response.status_code = status.HTTP_202_ACCEPTED
        return format_job_response(new_job)
    except IntegrityError:
        # Race condition handling: concurrent request inserted a job for this lesson
        await db.rollback()
        stmt = (
            select(DDSReportJob)
            .where(DDSReportJob.lesson_id == lesson_id)
            .execution_options(populate_existing=True)
        )
        res = await db.execute(stmt)
        concurrent_job = res.scalar_one()

        if concurrent_job.status == "completed":
            response.status_code = status.HTTP_200_OK
        elif concurrent_job.status in ("pending", "running"):
            response.status_code = status.HTTP_202_ACCEPTED
        elif concurrent_job.status == "failed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Previous report generation failed. Specify retry=true to retry.",
            )

        return format_job_response(concurrent_job)


@router.get(
    "/lessons/{lesson_id}/report",
    response_model=DDSReportJobResponse,
)
async def get_lesson_report_job(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DDSReportJobResponse:
    """Retrieve saved DDS report job status or result (200 OK).

    Returns 404 if no report job has been initiated for the lesson.
    Read-only: does not regenerate or invoke LLM on repeated reads.
    """
    await verify_lesson_access(lesson_id, db, current_user)

    stmt = select(DDSReportJob).where(DDSReportJob.lesson_id == lesson_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report job for lesson '{lesson_id}' not found.",
        )

    return format_job_response(job)
