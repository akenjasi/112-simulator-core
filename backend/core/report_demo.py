"""Immediate demo inference: persisted results, no scheduler or admission queue."""
import asyncio
import os

from fastapi import HTTPException
from sqlalchemy import select, update

from backend.core.dds_report_jobs import classify_error
from backend.core.report_data import collect_report_snapshot
from backend.core.report_inference import generate_report
from backend.core.reports import insert_once, utcnow
from backend.database import AsyncSessionLocal
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.report_job import ReportJob

_tasks = {}


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
            lesson_id=lesson_id, status="generating", snapshot=snapshot, snapshot_at=utcnow()))
        launch = bool(getattr(job, "_newly_created", False))
    elif job.status == "pending" or job.status == "failed" and retry:
        expected = job.attempt
        claimed = await db.execute(update(ReportJob).where(ReportJob.job_id == job.job_id,
            ReportJob.attempt == expected, ReportJob.status == job.status).values(
                status="generating", attempt=expected + 1, snapshot=job.snapshot or snapshot,
                snapshot_at=job.snapshot_at or utcnow(), waiting_reason=None,
                error_code=None, error_message=None, next_run_at=None, updated_at=utcnow()))
        launch = claimed.rowcount == 1
        await db.refresh(job)
    return job, launch


def submit(job):
    key = (job.job_id, job.attempt)
    if key in _tasks:
        return
    task = asyncio.create_task(generate(job.job_id, job.attempt), name="dds_demo_report")
    _tasks[key] = task
    task.add_done_callback(lambda done: _tasks.pop(key, None))


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
    if launch:
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
    if launch:
        submit(job)
    sessions = list((await db.scalars(select(ExamSession.session_id).where(
        ExamSession.assignment_id == lesson.assignment_id, ExamSession.session_type == "CARD_ACTIONS"))).all())
    for session_id in sessions:
        await start_session(db, session_id, retry=retry)
    return job


async def generate(job_id, attempt):
    values = {}
    try:
        async with AsyncSessionLocal() as db:
            job = await db.get(ReportJob, job_id)
            if not job or job.status != "generating" or job.attempt != attempt:
                return
            kind = "student" if job.kind == "session_demo" else "lesson"
            snapshot = job.snapshot
            if kind == "lesson" and "sessions" not in snapshot.get("summary", {}):
                from backend.core.reports import compact_legacy
                snapshot = compact_legacy(snapshot)
        result = await generate_report(snapshot, kind, personal=kind == "student")
        values = {"status": "completed", "report_text": result["analysis_text"], "model_used": result["model_used"],
                  "error_code": None, "error_message": None}
    except asyncio.CancelledError:
        values = {"status": "failed", "error_code": "generation_interrupted", "error_message": "Генерация прервана. Повторите запрос."}
    except Exception as exc:
        code, message = classify_error(exc)
        values = {"status": "failed", "error_code": code, "error_message": message}
    finally:
        if values:
            async with AsyncSessionLocal() as db:
                await db.execute(update(ReportJob).where(ReportJob.job_id == job_id,
                    ReportJob.attempt == attempt, ReportJob.status == "generating").values(updated_at=utcnow(), **values))
                await db.commit()


async def stop_demo_reports():
    tasks = list(_tasks.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
