"""Legacy analytics dispatch backed by the same DDS report queue, never inference."""
from types import SimpleNamespace

from sqlalchemy import select

from backend.core.dds_report_llm import get_llm_settings
from backend.core.reports import enqueue_lesson, request_student_report
from backend.database import AsyncSessionLocal
from backend.models.domain_03 import Assignment
from backend.models.domain_01 import StudentGroup


def result_for(job):
    return SimpleNamespace(status=job.status if job and job.status == "completed" else "queued" if job else "unchanged",
                           advice_id=job.job_id if job else None, model_used=get_llm_settings().model)


async def queue_student_report(*, cadet_id, db, **_):
    job = await request_student_report(db, cadet_id)
    await db.commit()
    return result_for(job)


async def queue_group_reports(*, group_id, db, **_):
    group = await db.get(StudentGroup, group_id)
    lessons = (await db.scalars(select(Assignment).where(Assignment.group_id == group_id,
        Assignment.assigned_by == (group.teacher_id if group else None),
        Assignment.status == "COMPLETED", Assignment.target_role == "DISPATCHER_DDS"))).all()
    jobs = [job for lesson in lessons if (job := await enqueue_lesson(db, lesson))]
    await db.commit()
    return result_for(jobs[0] if jobs else None)


class DurableAdviceQueue:
    def start(self):
        """The application lifespan owns the single durable worker."""

    async def enqueue(self, *, job_type, target_id, **_):
        async with AsyncSessionLocal() as db:
            if job_type in {"cadet", "student"}:
                result = await queue_student_report(cadet_id=target_id, db=db)
            else:
                result = await queue_group_reports(group_id=target_id, db=db)
            return result.advice_id


durable_advice_queue = DurableAdviceQueue()
