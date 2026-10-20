"""Explicit, idempotent cutover. Only generated AI reports are removed."""
from sqlalchemy import delete, select, update

from backend.core.report_brief import FORMAT, freeze_brief
from backend.core.reports import utcnow
from backend.models.dds_report_job import LegacyDDSReportJob
from backend.models.domain_03 import AIGroupAdvice, AIStudentAdvice
from backend.models.report_job import ReportJob, ReportSchedulerState


async def cutover(db, *, apply=False, backup=None):
    """Caller stops the old worker first. Commit is owned by the caller."""
    if await db.get(ReportSchedulerState, "brief_v1_cutover"):
        return {"already_applied": True}
    tables = (ReportJob, LegacyDDSReportJob, AIStudentAdvice, AIGroupAdvice)
    exported = {}
    for model in tables:
        rows = (await db.execute(select(model.__table__))).mappings().all()
        if model in (ReportJob, LegacyDDSReportJob):
            rows = [r for r in rows if r["status"] == "completed" and
                    (r.get("snapshot") or {}).get("report_format") != FORMAT]
        exported[model.__tablename__] = [dict(r) for r in rows]
    counts = {name: len(rows) for name, rows in exported.items()}
    if not apply:
        return counts
    if backup:
        backup(exported)
    now = utcnow()
    for model in tables:
        rows = exported[model.__tablename__]
        if rows:
            pk = next(iter(model.__table__.primary_key.columns))
            await db.execute(delete(model).where(pk.in_([r[pk.name] for r in rows])))
    for job in (await db.scalars(select(ReportJob).where(ReportJob.status.in_(["pending", "running", "generating"])))).all():
        job.status, job.attempt = "pending", job.attempt + 1
        job.snapshot = freeze_brief(job.snapshot) if job.snapshot else None
        job.waiting_reason, job.next_run_at = "queued", None
        job.error_code = job.error_message = None
        job.retry_count = 0
        job.updated_at = now
    await db.execute(update(ReportSchedulerState).where(ReportSchedulerState.key == "dds_reports").values(enabled_at=now))
    db.add(ReportSchedulerState(key="brief_v1_cutover", enabled_at=now))
    return counts
