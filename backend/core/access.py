"""Shared object boundaries for the retained API generations."""
from fastapi import HTTPException
from sqlalchemy import or_, select

from backend.models.domain_01 import StudentGroup, User, student_group_link
from backend.models.domain_03 import Assignment, ExamSession


async def teacher_cadet_ids(db, teacher_id):
    from backend.core.ai_analytics_access import get_teacher_cadet_ids
    ids = await get_teacher_cadet_ids(db, teacher_id)
    ids.update((await db.scalars(select(User.user_id).where(User.created_by_id == teacher_id))).all())
    return ids


async def require_managed_cadet(db, user, cadet):
    if user.role == "ADMIN":
        return
    if user.role != "TEACHER" or cadet.role not in ("CADET", "STUDENT"):
        raise HTTPException(403, "Access denied")
    if cadet.user_id not in await teacher_cadet_ids(db, user.user_id):
        raise HTTPException(403, "Cadet is outside your groups")


async def require_cadet_link(db, user, cadet):
    if cadet.role not in ("CADET", "STUDENT"):
        raise HTTPException(403, "Only cadets can be enrolled in a student group")
    if user.role == "ADMIN" or cadet.user_id in await teacher_cadet_ids(db, user.user_id):
        return
    memberships = (await db.scalars(select(StudentGroup))).all()
    linked = await db.scalar(select(student_group_link.c.user_id).where(student_group_link.c.user_id == cadet.user_id).limit(1))
    creator = await db.get(User, cadet.created_by_id) if cadet.created_by_id else None
    if (creator and creator.role == "TEACHER") or linked or cadet.group_ids or any(cadet.user_id in (g.cadet_ids or []) for g in memberships):
        raise HTTPException(403, "Cadet is already managed by another teacher")


async def require_assignment(db, user, assignment):
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    if user.role == "ADMIN":
        return assignment
    if user.role == "TEACHER" and assignment.assigned_by == user.user_id:
        return assignment
    if user.role == "CADET":
        if assignment.cadet_id == user.user_id:
            return assignment
        if assignment.group_id:
            group = await db.get(StudentGroup, assignment.group_id)
            linked = await db.scalar(select(student_group_link.c.user_id).where(
                student_group_link.c.group_id == assignment.group_id,
                student_group_link.c.user_id == user.user_id))
            if group and (linked or user.user_id in (group.cadet_ids or []) or group.group_id in (user.group_ids or [])):
                return assignment
    raise HTTPException(403, "Assignment access denied")


async def require_session(db, user, session_id):
    session = await db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if user.role == "ADMIN" or session.cadet_id == user.user_id:
        return session
    if user.role == "TEACHER" and session.assignment_id:
        assignment = await db.get(Assignment, session.assignment_id)
        if assignment and assignment.assigned_by == user.user_id:
            return session
        if assignment and assignment.card_pool_source == "self_training" and session.cadet_id in await teacher_cadet_ids(db, user.user_id):
            return session
    raise HTTPException(403, "Session access denied")


async def require_card(db, user, card):
    if not card:
        raise HTTPException(404, "Card not found")
    if card.session_id:
        await require_session(db, user, card.session_id)
    elif user.role != "ADMIN" and card.operator_id != user.user_id:
        raise HTTPException(403, "Card access denied")
    return card


async def visible_session_ids(db, user):
    if user.role == "ADMIN":
        return select(ExamSession.session_id)
    if user.role != "TEACHER":
        return select(ExamSession.session_id).where(ExamSession.cadet_id == user.user_id)
    cadets = await teacher_cadet_ids(db, user.user_id)
    assignments = select(Assignment.assignment_id).where(or_(
        Assignment.assigned_by == user.user_id,
        (Assignment.card_pool_source == "self_training") & Assignment.cadet_id.in_(cadets),
    ))
    return select(ExamSession.session_id).where(or_(ExamSession.assignment_id.in_(assignments), ExamSession.cadet_id == user.user_id))
