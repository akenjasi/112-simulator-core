"""Current teacher lesson; self-training remains independent of other activities."""
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from backend.models.domain_01 import StudentGroup, User
from backend.models.domain_03 import Assignment, ExamSession


async def lock_cadets(db: AsyncSession, cadet_ids: list[str]) -> None:
    # Use the same sorted row locks for group starts and self-training, including first insert.
    for uid in sorted(set(cadet_ids)):
        await db.execute(text("UPDATE users SET is_active = is_active WHERE user_id = :uid"), {"uid": uid})


async def current_rows(db: AsyncSession, cadet_ids: list[str]):
    rows = (await db.execute(select(ExamSession, Assignment).join(
        Assignment, Assignment.assignment_id == ExamSession.assignment_id
    ).where(ExamSession.cadet_id.in_(cadet_ids), Assignment.target_role == "DISPATCHER_DDS",
            Assignment.status == "ACTIVE").order_by(Assignment.started_at.desc(), ExamSession.session_id))).all()
    # Teacher-led membership lasts until the lesson ends, even if this cadet has finished.
    return [(session, lesson) for session, lesson in rows if is_teacher_lesson(lesson) or session.status == "ACTIVE"]


def is_teacher_lesson(lesson: Assignment) -> bool:
    return lesson.assigned_by is not None and lesson.card_pool_source != "self_training"


async def require_available(db: AsyncSession, cadet_ids: list[str]) -> None:
    if any(is_teacher_lesson(lesson) for _, lesson in await current_rows(db, cadet_ids)):
        raise HTTPException(409, detail={"code": "DDS_LEARNING_IN_PROGRESS",
            "message": "У участника уже идёт занятие с преподавателем. Завершите его перед запуском другого группового занятия."})


async def workspace(db: AsyncSession, user: User) -> dict:
    rows = await current_rows(db, [user.user_id])
    items = []
    for session, lesson in rows:
        data = (session.dynamic_state or {}).get("dds", {})
        teacher = await db.get(User, lesson.assigned_by) if is_teacher_lesson(lesson) else None
        group = await db.get(StudentGroup, lesson.group_id) if lesson.group_id else None
        queue = data.get("queue") or []
        completed = len(data.get("completed_cards") or []) if data.get("version") == 2 else int(bool(data.get("submitted_at")))
        items.append({
            "session_id": session.session_id, "lesson_id": lesson.assignment_id,
            "ticket_id": session.ticket_id, "kind": "teacher" if is_teacher_lesson(lesson) else "self_training",
            "teacher_name": (teacher.full_name or teacher.username) if teacher else None,
            "group_name": group.group_name if group else None,
            "started_at": lesson.started_at or session.start_time,
            "session_status": session.status, "completed_cards": completed,
            "total_cards": len(queue) or len(lesson.card_pool_ids or []) or 1,
            "has_activity": bool(data.get("actions") or completed),
        })
    return {"activities": items, "can_start_training": True}
