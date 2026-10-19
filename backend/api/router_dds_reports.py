"""Persisted teacher/student reports. Reads never invoke inference."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user
from backend.core.report_data import aware
from backend.core.dds_report_jobs import dds_report_job_worker
from backend.core.reports import enqueue_lesson, import_legacy, request_student_report, retry_report
from backend.database import get_db
from backend.models.domain_01 import User
from backend.models.domain_03 import Assignment
from backend.models.report_job import ReportJob

router = APIRouter(prefix="/api/ai-analytics", tags=["DDS Reports"])

class DDSReportJobCreateRequest(BaseModel):
    retry: bool = False

class DDSReportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    job_id: str
    lesson_id: Optional[str] = None
    kind: str
    status: str
    attempt: int
    created_at: datetime
    updated_at: datetime
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    snapshot_at: Optional[datetime] = None
    waiting_reason: Optional[str] = None
    next_run_at: Optional[datetime] = None
    report_text: Optional[str] = None
    error_code: Optional[str] = None
    model_used: Optional[str] = None
    execution_mode: str = "queued"


def format_job_response(job):
    result = DDSReportJobResponse.model_validate(job)
    from backend.core.report_demo import demo_enabled
    result.execution_mode = "demo" if job.kind == "session_demo" or job.status == "generating" or demo_enabled() else "queued"
    for name in ("created_at", "updated_at", "period_start", "period_end", "snapshot_at", "next_run_at"):
        setattr(result, name, aware(getattr(result, name)))
    if job.status != "completed":
        result.report_text = None
    if job.status != "failed":
        result.error_code = None
    return result

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



async def respond_to_request(db, job, response, retry=False):
    if job is None:
        response.status_code = 204
        return None
    if job.status == "failed":
        if not retry:
            raise HTTPException(409, "Previous report generation failed. Specify retry=true to retry.")
        job = await retry_report(db, job)
    await db.commit()
    await db.refresh(job)
    if getattr(job, "_newly_created", False):
        dds_report_job_worker.submit(job.job_id)
    response.status_code = 200 if job.status == "completed" else 202
    return format_job_response(job)


@router.post("/lessons/{lesson_id}/report", response_model=DDSReportJobResponse)
async def create_or_get_lesson_report_job(lesson_id: str, response: Response,
    req: Optional[DDSReportJobCreateRequest] = Body(default=None), db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    lesson = await verify_lesson_access(lesson_id, db, current_user)
    from backend.core.report_demo import demo_enabled, start_lesson
    if demo_enabled():
        job = await start_lesson(db, lesson, retry=bool(req and req.retry))
        response.status_code = 200 if job.status == "completed" else 202
        return format_job_response(job)
    await import_legacy(db)
    job = await enqueue_lesson(db, lesson)
    if job is None:
        raise HTTPException(409, "Teacher reports require an assigned DDS lesson")
    return await respond_to_request(db, job, response, bool(req and req.retry))


@router.get("/lessons/{lesson_id}/report", response_model=DDSReportJobResponse)
async def get_lesson_report_job(lesson_id: str, db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    await verify_lesson_access(lesson_id, db, current_user)
    job = await db.scalar(select(ReportJob).where(ReportJob.scope_key == "lesson:" + lesson_id))
    if job is None:
        # Read-only compatibility for a pre-upgrade database; startup copies these rows.
        from backend.models.dds_report_job import LegacyDDSReportJob
        old = await db.scalar(select(LegacyDDSReportJob).where(LegacyDDSReportJob.lesson_id == lesson_id))
        if old is not None:
            return DDSReportJobResponse(job_id=old.job_id, lesson_id=old.lesson_id, kind="lesson", status=old.status,
                attempt=old.attempt, created_at=old.created_at, updated_at=old.updated_at,
                report_text=old.report_text if old.status == "completed" else None,
                error_code=old.error_code if old.status == "failed" else None, model_used=old.model_used)
        raise HTTPException(404, "Report has not been requested")
    return format_job_response(job)


async def session_recommendation(db, session, lesson):
    from backend.core.report_demo import demo_enabled, eligible
    job = await db.scalar(select(ReportJob).where(ReportJob.scope_key == "session:" + session.session_id))
    result = {"mode": "demo" if demo_enabled() else "queued", "session_id": session.session_id,
              "status": "not_started" if eligible(session, lesson) else "awaiting_lesson"}
    if not job:
        if not demo_enabled():
            result["status"] = "disabled"
        return result
    result.update(format_job_response(job).model_dump(mode="json"))
    return result


@router.get("/sessions/{session_id}/recommendation")
async def get_session_recommendation(session_id: str, db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    from backend.core.report_demo import session_access
    session, lesson = await session_access(db, session_id, current_user)
    return await session_recommendation(db, session, lesson)


@router.post("/sessions/{session_id}/recommendation")
async def request_session_recommendation(session_id: str, response: Response,
    req: Optional[DDSReportJobCreateRequest] = Body(default=None), db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    from backend.core.report_demo import demo_enabled, eligible, session_access, start_session
    session, lesson = await session_access(db, session_id, current_user)
    if not demo_enabled():
        raise HTTPException(409, "Immediate recommendations require DDS_REPORT_MODE=demo")
    if not eligible(session, lesson):
        raise HTTPException(409, "Recommendations are available after the lesson has ended")
    await start_session(db, session_id, retry=bool(req and req.retry))
    result = await session_recommendation(db, session, lesson)
    response.status_code = 200 if result["status"] == "completed" else 202
    return result


@router.get("/lessons/{lesson_id}/personal-reports")
async def get_personal_lesson_reports(lesson_id: str, db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    from backend.core.report_demo import demo_enabled
    from backend.models.domain_03 import ExamSession
    lesson = await verify_lesson_access(lesson_id, db, current_user)
    rows = (await db.execute(select(ExamSession, User).join(User, User.user_id == ExamSession.cadet_id).where(
        ExamSession.assignment_id == lesson_id, ExamSession.session_type == "CARD_ACTIONS").order_by(ExamSession.session_id))).all()
    items = []
    for session, user in rows:
        item = await session_recommendation(db, session, lesson)
        item["cadet_name"] = user.full_name or user.username
        items.append(item)
    return {"mode": "demo" if demo_enabled() else "queued", "lesson_id": lesson_id, "reports": items}


def require_student(user):
    if user.role != "CADET":
        raise HTTPException(403, "Student reports are available to the authenticated cadet only")


@router.get("/students/me/reports", response_model=list[DDSReportJobResponse])
async def get_my_reports(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_student(current_user)
    jobs = (await db.scalars(select(ReportJob).where(ReportJob.kind == "student",
        ReportJob.owner_id == current_user.user_id, ReportJob.status != "superseded").order_by(
            ReportJob.period_end.desc()).limit(30))).all()
    return [format_job_response(job) for job in jobs]


@router.post("/students/me/reports", response_model=Optional[DDSReportJobResponse])
async def request_my_report(response: Response, req: Optional[DDSReportJobCreateRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_student(current_user)
    job = await request_student_report(db, current_user.user_id)
    return await respond_to_request(db, job, response, bool(req and req.retry))
