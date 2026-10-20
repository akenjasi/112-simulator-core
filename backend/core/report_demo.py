"""Immediate report requests backed by the common durable worker."""
import os

from fastapi import HTTPException
from sqlalchemy import select, update

from backend.core.report_data import collect_report_snapshot
from backend.core.reports import insert_once, utcnow
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.report_job import ReportJob

def demo_enabled():
    return os.getenv("DDS_REPORT_MODE", "queued").strip().lower() == "demo"


async def session_access(db, session_id, user):
    session = await db.get(ExamSession, session_id)
    lesson = await db.get(Assignment, session.assignment_id) if session else None
    if not session or not lesson or lesson.target_role != "DISPATCHER_DDS" or session.session_type != "CARD_ACTIONS":
        raise HTTPException(404, "DDS session not found")
    if not (user.role == "ADMIN" or user.role == "CADET" and session.cadet_id == user.user_id or
            user.role == "TEACHER" and lesson.assigned_by == user.user_id):
        raise HTTPException(403, "Access denied")
    return session, lesson


def eligible(session, lesson):
    return session.status == "COMPLETED" and lesson.status == "COMPLETED"


async def prepare(db, key, kind, owner, snapshot, *, lesson_id=None, retry=False):
    job = await db.scalar(select(ReportJob).where(ReportJob.scope_key == key))
    launch = False
    if job is None:
        job = await insert_once(db, ReportJob(scope_key=key, kind=kind, owner_id=owner,
            lesson_id=lesson_id, status="pending", snapshot=snapshot, snapshot_at=utcnow()))
        launch = bool(getattr(job, "_newly_created", False))
    elif job.status == "failed" and retry:
        expected = job.attempt
        claimed = await db.execute(update(ReportJob).where(ReportJob.job_id == job.job_id,
            ReportJob.attempt == expected, ReportJob.status == job.status).values(
                status="pending", attempt=expected + 1, snapshot=job.snapshot or snapshot,
                snapshot_at=job.snapshot_at or utcnow(), waiting_reason=None,
                error_code=None, error_message=None, next_run_at=None, updated_at=utcnow()))
        launch = claimed.rowcount == 1
        await db.refresh(job)
    return job, launch


def submit(job):
    # Wake only after the transaction commits. All modes share one durable worker.
    from backend.core.report_worker import report_worker
    report_worker.wake()


async def start_session(db, session_id, retry=False):
    if not demo_enabled():
        return None
    session = await db.get(ExamSession, session_id)
    lesson = await db.get(Assignment, session.assignment_id) if session else None
    if not lesson or lesson.target_role != "DISPATCHER_DDS" or not eligible(session, lesson):
        return None
    snapshot = await collect_report_snapshot(db, session_id=session_id, owner_id=session.cadet_id)
    snapshot["period"] = {"start": session.start_time.isoformat() if session.start_time else None,
                          "end": session.end_time.isoformat() if session.end_time else None}
    job, launch = await prepare(db, "session:" + session_id, "session_demo", session.cadet_id, snapshot, retry=retry)
    await db.commit()
    if launch or job.status == "pending":
        submit(job)
    return job


async def start_lesson(db, lesson, retry=False):
    if not demo_enabled() or lesson.target_role != "DISPATCHER_DDS" or lesson.status != "COMPLETED":
        return None
    snapshot = await collect_report_snapshot(db, lesson_id=lesson.assignment_id)
    snapshot["period"] = {"start": lesson.started_at.isoformat() if lesson.started_at else None,
                          "end": lesson.completed_at.isoformat() if lesson.completed_at else None}
    job, launch = await prepare(db, "lesson:" + lesson.assignment_id, "lesson", lesson.assigned_by,
                               snapshot, lesson_id=lesson.assignment_id, retry=retry)
    await db.commit()
    if launch or job.status == "pending":
        submit(job)
    sessions = list((await db.scalars(select(ExamSession.session_id).where(
        ExamSession.assignment_id == lesson.assignment_id, ExamSession.session_type == "CARD_ACTIONS"))).all())
    for session_id in sessions:
        await start_session(db, session_id, retry=retry)
    return job


async def stop_demo_reports():
    # Kept as a lifecycle compatibility hook; generation belongs to ReportWorker.
    return
