"""DDS queue creation, non-destructive import, and daily reconciliation."""
from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from backend.core.report_data import aware, collect_report_snapshot, has_new_results, student_period
from backend.core.report_data import digest
from backend.models.dds_report_job import LegacyDDSReportJob
from backend.models.domain_01 import User
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.report_job import ReportJob, ReportSchedulerState


def utcnow():
    return datetime.now(timezone.utc)


async def insert_once(db, job):
    try:
        async with db.begin_nested():
            db.add(job)
            await db.flush()
        job._newly_created = True
        return job
    except IntegrityError:
        return await db.scalar(select(ReportJob).where(ReportJob.scope_key == job.scope_key))


async def enqueue_lesson(db, lesson, now=None):
    from backend.core.report_demo import demo_enabled
    if demo_enabled():
        return None
    if lesson.target_role != "DISPATCHER_DDS" or lesson.card_pool_source == "self_training" or not lesson.assigned_by:
        return None
    key = "lesson:" + lesson.assignment_id
    existing = await db.scalar(select(ReportJob).where(ReportJob.scope_key == key))
    if existing:
        return existing
    # Keep the established teacher snapshot contract. Student aggregation is
    # frozen lazily, and the inference adapter compacts these teacher facts.
    from backend.core.dds_report_data import collect_lesson_report_data
    snapshot = await collect_lesson_report_data(db, lesson.assignment_id, lesson=lesson)
    return await insert_once(db, ReportJob(scope_key=key, kind="lesson", lesson_id=lesson.assignment_id,
        owner_id=lesson.assigned_by, status="pending", waiting_reason="queued",
        snapshot=snapshot, snapshot_at=now or utcnow(),
        period_start=lesson.started_at, period_end=lesson.completed_at, created_at=now or utcnow(), updated_at=now or utcnow()))


async def request_student_report(db, owner_id, now=None):
    now = now or utcnow()
    start, end = student_period(now)
    key = f"student:{owner_id}:{end.isoformat()}"
    existing = await db.scalar(select(ReportJob).where(ReportJob.scope_key == key))
    if existing:
        return existing
    await supersede_student_jobs(db, end, now, owner_id)
    preview = await collect_report_snapshot(db, owner_id=owner_id, period_start=start, period_end=end)
    previous = await db.scalar(select(ReportJob).where(ReportJob.kind == "student", ReportJob.owner_id == owner_id,
        ReportJob.status == "completed").order_by(ReportJob.period_end.desc()).limit(1))
    if not preview["summary"]["sessions"] or not has_new_results(preview, previous.snapshot if previous else None):
        return previous
    return await insert_once(db, ReportJob(scope_key=key, kind="student", owner_id=owner_id,
        period_start=start, period_end=end, status="pending", waiting_reason="queued", created_at=now, updated_at=now))


async def request_group_report(db, group, *, retry=False):
    """One frozen report per revision of this teacher's completed group results."""
    from fastapi import HTTPException
    from backend.core.report_demo import demo_enabled, prepare, submit

    snapshot = await collect_report_snapshot(db, group_id=group.group_id, teacher_id=group.teacher_id)
    if not snapshot["summary"]["sessions"]:
        raise HTTPException(409, "No completed DDS results for this group")
    snapshot["group_id"] = group.group_id
    key = f"group:{group.group_id}:{digest(snapshot['source_revisions'])}"
    if demo_enabled():
        job, launch = await prepare(db, key, "group", group.teacher_id, snapshot, retry=retry)
        await db.commit()
        if launch:
            submit(job)
        return job
    job = await db.scalar(select(ReportJob).where(ReportJob.scope_key == key))
    if job is None:
        job = await insert_once(db, ReportJob(scope_key=key, kind="group", owner_id=group.teacher_id,
            snapshot=snapshot, snapshot_at=utcnow(), status="pending", waiting_reason="queued"))
    if job.status == "failed":
        if not retry:
            raise HTTPException(409, "Previous report generation failed. Specify retry=true")
        job = await retry_report(db, job)
    await db.commit()
    return job


async def supersede_student_jobs(db, end, now, owner_id=None):
    query = update(ReportJob).where(ReportJob.kind == "student", ReportJob.status == "pending", ReportJob.period_end < end)
    if owner_id is not None:
        query = query.where(ReportJob.owner_id == owner_id)
    await db.execute(query.values(status="superseded", updated_at=now).execution_options(synchronize_session=False))


async def import_legacy(db):
    """Copy once by stable scope/ID; never mutate the source DDS report table."""
    for old in (await db.scalars(select(LegacyDDSReportJob))).all():
        key = "lesson:" + old.lesson_id
        if await db.scalar(select(ReportJob.job_id).where(ReportJob.scope_key == key)):
            continue
        lesson = await db.get(Assignment, old.lesson_id)
        db.add(ReportJob(job_id=old.job_id, scope_key=key, kind="lesson", lesson_id=old.lesson_id,
            owner_id=lesson.assigned_by if lesson else None, status="pending" if old.status == "running" else old.status,
            attempt=old.attempt, snapshot=deepcopy(old.snapshot), snapshot_at=old.created_at if old.snapshot else None,
            period_start=lesson.started_at if lesson else None, period_end=lesson.completed_at if lesson else None,
            report_text=old.report_text, model_used=old.model_used, error_code=old.error_code,
            error_message=old.error_message, created_at=old.created_at, updated_at=old.updated_at))
    await db.flush()


async def initialize_reports(db, now=None):
    now = now or utcnow()
    await import_legacy(db)
    state = await db.get(ReportSchedulerState, "dds_reports")
    if state is None:
        db.add(ReportSchedulerState(key="dds_reports", enabled_at=now))
    await db.execute(update(ReportJob).where(ReportJob.status == "running").values(
        status="pending", attempt=ReportJob.attempt + 1, waiting_reason="queued", updated_at=now))
    await db.execute(update(ReportJob).where(ReportJob.status == "generating").values(
        status="failed", error_code="generation_interrupted", error_message="Генерация прервана. Повторите запрос.", updated_at=now))
    await db.commit()


async def reconcile_reports(db, now=None):
    now = now or utcnow()
    state = await db.get(ReportSchedulerState, "dds_reports")
    if state:
        lessons = (await db.scalars(select(Assignment).where(Assignment.status == "COMPLETED",
            Assignment.target_role == "DISPATCHER_DDS", Assignment.completed_at >= state.enabled_at))).all()
        for lesson in lessons:
            await enqueue_lesson(db, lesson, now)
    start, end = student_period(now)
    # Includes students who have no activity left in the current seven-day window.
    await supersede_student_jobs(db, end, now)
    owners = (await db.scalars(select(ExamSession.cadet_id).join(Assignment).join(User, User.user_id == ExamSession.cadet_id).where(
        Assignment.target_role == "DISPATCHER_DDS", func.upper(ExamSession.status) == "COMPLETED",
        ExamSession.end_time >= start, ExamSession.end_time < end, User.is_active.is_(True), User.role == "CADET").distinct())).all()
    for owner in owners:
        await request_student_report(db, owner, now)
    await db.commit()


async def retry_report(db, job):
    if job.status != "failed":
        return job
    values = {}
    if job.kind == "lesson":
        from backend.core.dds_report_data import collect_lesson_report_data
        values = {"snapshot": await collect_lesson_report_data(db, job.lesson_id), "snapshot_at": utcnow()}
    result = await db.execute(update(ReportJob).where(ReportJob.job_id == job.job_id, ReportJob.status == "failed",
        ReportJob.attempt == job.attempt).values(status="pending", attempt=ReportJob.attempt + 1,
            retry_count=0, next_run_at=None, waiting_reason="queued", error_code=None, error_message=None, updated_at=utcnow(), **values))
    await db.commit()
    await db.refresh(job)
    job._newly_created = result.rowcount > 0
    return job


def compact_legacy(snapshot):
    """Retain frozen facts and explicitly projected semantic evidence, if present."""
    from collections import Counter
    checks, reasons, participants = Counter(), Counter(), {}
    examples, sessions = [], snapshot.get("sessions", [])
    total_cards = completed_cards = mistakes = graded = protocols_count = 0
    for session in sessions:
        cadet_id = session.get("cadet_id")
        participant = participants.setdefault(cadet_id, {"cadet_id": cadet_id, "sessions": 0,
            "total_cards": 0, "completed_cards": 0, "mistakes": 0})
        participant["sessions"] += 1
        total = session.get("total_cards") or len(session.get("ticket_results", [])) or 1
        completed = session.get("completed_cards") or 0
        total_cards += total
        completed_cards += completed
        participant["total_cards"] += total
        participant["completed_cards"] += completed
        protocols = session.get("exercise_protocols", [])
        protocols_count += len(protocols)
        seen = set()
        for protocol in protocols:
            for check in protocol.get("criteria", []):
                if check.get("key") in {"confirmation", "service", "stage", "accuracy", "completion"} and check.get("status") in {
                    "completed", "completed_after_correction", "not_completed", "not_evaluated"}:
                    checks[f'{check["key"]}:{check["status"]}'] += 1
            for event in protocol.get("events", []):
                key = (protocol.get("card_id"), event.get("id"))
                if event.get("kind") != "mistake" or key in seen:
                    continue
                seen.add(key)
                reason = event.get("reason")
                if reason not in {"wrong_service", "wrong_contact", "premature", "wrong_stage", "transition", "call_required",
                    "refusal", "record_accuracy", "unknown_number", "report_note", "completion"}:
                    reason = "other_recorded_mistake"
                reasons[reason] += 1
                mistakes += 1
                participant["mistakes"] += 1
                if len(examples) < 12:
                    examples.append({"session_id": session.get("session_id"), "card_id": protocol.get("card_id"),
                                     "event_id": event.get("id"), "reason": reason})
        if not protocols:
            count = sum(r.get("errors_count", 0) for r in session.get("ticket_results", []))
            mistakes += count
            participant["mistakes"] += count
        graded += int(any(r.get("score_total") is not None for r in session.get("ticket_results", [])) or any(
            any(isinstance(v, (int, float)) and not isinstance(v, bool) for k, v in ev.get("scores", {}).items()
                if k in {"final_score", "total", "expert_score", "automatic_score"}) for ev in session.get("evaluations", [])))
    warnings = []
    if graded < len(sessions):
        warnings.append(f"Сессий без числовой оценки: {len(sessions) - graded}. Это не означает успешное выполнение.")
    if protocols_count == 0:
        warnings.append("Протоколы критериев отсутствуют; оценка ограничена сохранёнными результатами.")
    result = {"summary": {"sessions": len(sessions), "participants": len(participants), "total_cards": total_cards,
            "completed_cards": completed_cards, "incomplete_cards": max(0, total_cards - completed_cards),
            "mistakes": mistakes, "protocols": protocols_count, "sessions_with_score": graded},
            "participants": sorted(participants.values(), key=lambda p: p["cadet_id"] or ""),
            "criteria": dict(sorted(checks.items())), "mistakes": dict(sorted(reasons.items())),
            "examples": examples, "warnings": warnings, "source_revisions": {}}
    if "semantic" in snapshot:
        result["semantic"] = deepcopy(snapshot["semantic"])
    return result
