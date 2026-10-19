"""Apply the same read boundary to every retained analytics alias and join."""
from fastapi import Depends, HTTPException, Request
from sqlalchemy import event, select
from sqlalchemy.orm import with_loader_criteria

from backend.core.access import teacher_cadet_ids, visible_session_ids, require_session, require_assignment
from backend.core.deps import get_current_user
from backend.database import get_db
from backend.models.domain_01 import StudentGroup, User
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, IncidentCard, TicketResult


async def get_scoped_analytics_db(request: Request, db=Depends(get_db), user=Depends(get_current_user)):
    if user.role == "ADMIN":
        yield db
        return
    if user.role != "TEACHER":
        raise HTTPException(403, "Analytics requires a teacher")
    group_id = request.query_params.get("group_id")
    if group_id and group_id != "ALL":
        group = await db.get(StudentGroup, group_id)
        if not group:
            raise HTTPException(404, "Group not found")
        if group.teacher_id != user.user_id:
            raise HTTPException(403, "Group access denied")
    # Check explicit object routes before collection criteria hide foreign rows.
    # This preserves the public 403 contract while applying the same ownership boundary.
    if request.path_params.get("session_id"):
        await require_session(db, user, request.path_params["session_id"])
    if request.path_params.get("lesson_id"):
        await require_assignment(db, user, await db.get(Assignment, request.path_params["lesson_id"]))
    record_id = request.path_params.get("record_id")
    if record_id:
        record = (await db.get(TicketResult, record_id) or await db.get(IncidentCard, record_id)
                  or await db.get(EvaluationResult, record_id))
        if record:
            if not record.session_id:
                raise HTTPException(403, "Record is not attached to an accessible session")
            await require_session(db, user, record.session_id)
    cadets = await teacher_cadet_ids(db, user.user_id)
    target = request.path_params.get("user_id") or request.query_params.get("cadet_id")
    if target and target not in cadets:
        raise HTTPException(403, "Cadet access denied")
    session_ids = tuple((await db.scalars(await visible_session_ids(db, user))).all())
    user_ids = tuple(cadets | {user.user_id})
    # Criteria also constrain column projections, aliased joins and record lookup.
    criteria = [
        with_loader_criteria(ExamSession, ExamSession.session_id.in_(session_ids), include_aliases=True),
        with_loader_criteria(IncidentCard, IncidentCard.session_id.in_(session_ids), include_aliases=True),
        with_loader_criteria(EvaluationResult, EvaluationResult.session_id.in_(session_ids), include_aliases=True),
        with_loader_criteria(TicketResult, TicketResult.session_id.in_(session_ids), include_aliases=True),
        with_loader_criteria(StudentGroup, StudentGroup.teacher_id == user.user_id, include_aliases=True),
        with_loader_criteria(User, User.user_id.in_(user_ids), include_aliases=True),
        with_loader_criteria(Assignment, Assignment.assigned_by == user.user_id, include_aliases=True),
    ]

    def scope_query(state):
        if state.is_select:
            state.statement = state.statement.options(*criteria)

    event.listen(db.sync_session, "do_orm_execute", scope_query)
    try:
        yield db
    finally:
        event.remove(db.sync_session, "do_orm_execute", scope_query)
