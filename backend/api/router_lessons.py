from copy import deepcopy
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.dds_cycle import (
    build_dds_cadet_stats,
    is_suitable_dds_ticket,
    lock_assignment,
    sanitize_incoming_card,
)
from backend.core.ticket_lifecycle import is_approved_dds_ticket
from backend.core.deps import require_role, get_current_user
from backend.database import get_db
from backend.models.domain_01 import SecurityPolicy, User, StudentGroup
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Lesson, ExamSession
from backend.models.domain_04 import EvaluationResult, TicketResult, IncidentCard
from backend.schemas.lessons import (
    LessonCreate,
    LessonDetailResponse,
    LessonNotesUpdate,
    LessonSummaryResponse,
    CadetLessonStats,
    CadetTicketDetail,
)

lessons_router = APIRouter(
    prefix="/api/v1/lessons",
    tags=["Lessons"],
)

OPERATOR_112_LESSONS_POLICY = "ENABLE_OPERATOR_112_FOR_LESSONS"


async def _operator_112_lessons_enabled(db: AsyncSession) -> bool:
    """Read the administrator-controlled lesson-role feature flag safely."""
    result = await db.execute(
        select(SecurityPolicy.value).where(SecurityPolicy.key == OPERATOR_112_LESSONS_POLICY)
    )
    value = result.scalar_one_or_none()
    return str(value).strip().lower() == "true" if value is not None else False


@lessons_router.get(
    "/available-roles",
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def get_available_lesson_roles(db: AsyncSession = Depends(get_db)):
    """Return the roles a teacher may currently use for a new lesson."""
    roles = ["DISPATCHER_DDS"]
    if await _operator_112_lessons_enabled(db):
        roles.insert(0, "OPERATOR_112")
    return {"roles": roles}


async def _build_cadet_stats(
    lesson: Lesson,
    group: Optional[StudentGroup],
    db: AsyncSession,
) -> tuple[List[CadetLessonStats], int, int, int, int]:
    """Build history from saved sessions and results for every lesson role.

    Legacy lessons use the same honest collector; completion alone cannot
    manufacture tickets, participant progress or grades.
    """
    return await build_dds_cadet_stats(lesson, group, db)


@lessons_router.post(
    "",
    response_model=LessonDetailResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("TEACHER"))],
)
@lessons_router.post(
    "/",
    response_model=LessonDetailResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def create_lesson(
    payload: LessonCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Создать групповой урок со статусом WAITING."""
    if payload.target_role == "OPERATOR_112" and not await _operator_112_lessons_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Создание уроков для оператора 112 отключено администратором",
        )

    # Check that group exists
    stmt_group = select(StudentGroup).where(StudentGroup.group_id == payload.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Group with ID {payload.group_id} not found",
        )

    if current_user.role != "ADMIN" and group.teacher_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Занятие можно назначить только своей группе")

    if payload.cadet_id:
        target_cadet = await db.get(User, payload.cadet_id)
        if not target_cadet:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cadet with ID {payload.cadet_id} not found",
            )
        if target_cadet.role not in ("CADET", "STUDENT") or not target_cadet.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Specified cadet is not an active cadet/student",
            )
        group_cadet_ids = set(group.cadet_ids or [])
        if group.students:
            group_cadet_ids.update(u.user_id for u in group.students if getattr(u, "user_id", None))
        user_group_ids = set(target_cadet.group_ids or [])
        if hasattr(target_cadet, "groups") and target_cadet.groups:
            user_group_ids.update(g.group_id for g in target_cadet.groups)

        if target_cadet.user_id not in group_cadet_ids and payload.group_id not in user_group_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cadet {payload.cadet_id} does not belong to group {payload.group_id}",
            )

    if payload.target_role == "DISPATCHER_DDS":
        if not payload.ticket_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Выберите утверждённый билет ДДС")
        if current_user.role != "ADMIN" and group.teacher_id != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Создание занятий ДДС разрешено только преподавателю этой группы",
            )
        if payload.ticket_id:
            ticket = await db.get(ScenarioTicket, payload.ticket_id)
            if not is_suitable_dds_ticket(ticket) or not is_approved_dds_ticket(ticket):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Выбранный билет не утверждён, некорректен или не существует",
                )

    session_type = (
        "CARD_ACTIONS" if payload.target_role == "DISPATCHER_DDS" else "CALL_SIMULATION"
    )

    time_limit = payload.time_limit_seconds if (payload.time_limit_seconds and payload.time_limit_seconds > 0) else 30

    lesson = Lesson(
        group_id=payload.group_id,
        cadet_id=payload.cadet_id,
        assigned_by=current_user.user_id,
        target_role=payload.target_role or "OPERATOR_112",
        session_type=session_type,
        scenario_id=payload.ticket_id if payload.target_role == "DISPATCHER_DDS" else None,
        mode=payload.mode,
        status="WAITING",
        categories=payload.categories or [],
        complexity=payload.complexity or "level_1",
        time_limit_seconds=time_limit,
        error_limit=payload.error_limit,
        teacher_notes="",
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)

    cadets_list, total_cadets, total_in_progress, total_passed, total_failed = (
        await _build_cadet_stats(lesson, group, db)
    )

    return LessonDetailResponse(
        id=lesson.id,
        group_id=lesson.group_id,
        cadet_id=lesson.cadet_id,
        group_name=group.group_name,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
        mode=lesson.mode,
        status=lesson.status,
        categories=lesson.categories or [],
        complexity=lesson.complexity,
        time_limit_seconds=lesson.time_limit_seconds,
        error_limit=lesson.error_limit,
        teacher_notes=lesson.teacher_notes or "",
        created_at=lesson.created_at,
        started_at=lesson.started_at,
        completed_at=lesson.completed_at,
        students=cadets_list,
        cadets=cadets_list,
        overall_progress=0,
        total_cadets=total_cadets,
        total_in_progress=0,
        total_passed=0,
        total_failed=0,
    )


@lessons_router.get(
    "",
    response_model=List[LessonSummaryResponse],
    dependencies=[Depends(require_role("TEACHER"))],
)
@lessons_router.get(
    "/",
    response_model=List[LessonSummaryResponse],
    include_in_schema=False,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def list_lessons(
    group_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Список всех групповых уроков."""
    stmt = select(Lesson).order_by(Lesson.created_at.desc())
    if current_user.role == "TEACHER":
        stmt = stmt.where(Lesson.assigned_by == current_user.user_id)
    if group_id:
        stmt = stmt.where(Lesson.group_id == group_id)
    if status_filter:
        stmt = stmt.where(Lesson.status == status_filter)

    res = await db.execute(stmt)
    lessons = list(res.scalars().all())

    # Collect groups
    group_ids = list({l.group_id for l in lessons if l.group_id})
    groups_map = {}
    if group_ids:
        res_g = await db.execute(select(StudentGroup).where(StudentGroup.group_id.in_(group_ids)))
        groups_map = {g.group_id: g for g in res_g.scalars().all()}

    summaries = []
    for l in lessons:
        grp = groups_map.get(l.group_id)
        cadets_list, total_cadets, _, passed_cnt, failed_cnt = await _build_cadet_stats(l, grp, db)
        scores = [c.score for c in cadets_list if c.score is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else None

        summaries.append(
            LessonSummaryResponse(
                id=l.id,
                group_id=l.group_id,
                cadet_id=l.cadet_id,
                group_name=grp.group_name if grp else "Не указана",
                target_role=l.target_role or "OPERATOR_112",
                mode=l.mode,
                status=l.status,
                complexity=l.complexity,
                categories=l.categories or [],
                total_cadets=total_cadets,
                passed_count=passed_cnt,
                failed_count=failed_cnt,
                avg_score=avg_score,
                teacher_notes=l.teacher_notes or "",
                created_at=l.created_at,
                started_at=l.started_at,
                completed_at=l.completed_at,
                students=cadets_list,
            )
        )
    return summaries


@lessons_router.get(
    "/{lesson_id}",
    response_model=LessonDetailResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
@lessons_router.get(
    "/{lesson_id}/stats",
    response_model=LessonDetailResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def get_lesson_detail(
    lesson_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Детали группового урока."""
    stmt = select(Lesson).where(Lesson.assignment_id == lesson_id)
    res = await db.execute(stmt)
    lesson = res.scalar_one_or_none()

    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lesson with ID {lesson_id} not found",
        )

    if current_user.role == "CADET":
        if lesson.target_role == "DISPATCHER_DDS":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if lesson.cadet_id and current_user.user_id != lesson.cadet_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        user_group_ids = set(current_user.group_ids or [])
        if hasattr(current_user, "groups") and current_user.groups:
            user_group_ids.update(g.group_id for g in current_user.groups)
        if lesson.group_id not in user_group_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif current_user.role == "TEACHER":
        if lesson.assigned_by != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    stmt_group = select(StudentGroup).where(StudentGroup.group_id == lesson.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    cadets_list, total_cadets, total_in_progress, total_passed, total_failed = (
        await _build_cadet_stats(lesson, group, db)
    )

    progress_sum = sum(c.progress for c in cadets_list)
    overall_progress = round(progress_sum / max(total_cadets, 1))

    return LessonDetailResponse(
        id=lesson.id,
        group_id=lesson.group_id,
        cadet_id=lesson.cadet_id,
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role or "OPERATOR_112",
        mode=lesson.mode,
        status=lesson.status,
        categories=lesson.categories or [],
        complexity=lesson.complexity,
        time_limit_seconds=lesson.time_limit_seconds,
        error_limit=lesson.error_limit,
        teacher_notes=lesson.teacher_notes or "",
        created_at=lesson.created_at,
        started_at=lesson.started_at,
        completed_at=lesson.completed_at,
        students=cadets_list,
        cadets=cadets_list,
        overall_progress=overall_progress,
        total_cadets=total_cadets,
        total_in_progress=total_in_progress,
        total_passed=total_passed,
        total_failed=total_failed,
    )


@lessons_router.post(
    "/{lesson_id}/start",
    response_model=LessonDetailResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def start_lesson(
    lesson_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Перевести урок в статус ACTIVE и выдать ExamSession курсантам группы."""
    stmt = select(Lesson).where(Lesson.assignment_id == lesson_id)
    res = await db.execute(stmt)
    lesson = res.scalar_one_or_none()

    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lesson with ID {lesson_id} not found",
        )

    if current_user.role != "ADMIN" and lesson.assigned_by != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await lock_assignment(db, lesson_id)
    lesson = (await db.execute(select(Lesson).where(Lesson.assignment_id == lesson_id).execution_options(populate_existing=True))).scalar_one_or_none()

    if (lesson.status or "").upper() == "COMPLETED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed lesson cannot be started")

    stmt_group = select(StudentGroup).where(StudentGroup.group_id == lesson.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    if lesson.target_role == "DISPATCHER_DDS":
        if (lesson.status or "").upper() == "ACTIVE":
            # Idempotent replay: return existing snapshot before checking modified ticket or altered group roster
            cadets_list, total_cadets, total_in_progress, total_passed, total_failed = await _build_cadet_stats(lesson, group, db)
            overall_progress = round(sum(c.progress for c in cadets_list) / max(total_cadets, 1))
            return LessonDetailResponse(
                id=lesson.id,
                group_id=lesson.group_id,
                cadet_id=lesson.cadet_id,
                group_name=group.group_name if group else None,
                teacher_id=lesson.assigned_by,
                target_role=lesson.target_role,
        mode=lesson.mode,
                status=lesson.status,
                categories=lesson.categories or [],
                complexity=lesson.complexity,
                time_limit_seconds=lesson.time_limit_seconds,
                error_limit=lesson.error_limit,
                teacher_notes=lesson.teacher_notes or "",
                created_at=lesson.created_at,
                started_at=lesson.started_at,
                completed_at=lesson.completed_at,
                students=cadets_list,
                cadets=cadets_list,
                overall_progress=overall_progress,
                total_cadets=total_cadets,
                total_in_progress=total_in_progress,
                total_passed=total_passed,
                total_failed=total_failed,
            )

        if not lesson.scenario_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No scenario ticket chosen for DDS lesson")
        ticket = await db.get(ScenarioTicket, lesson.scenario_id)
        if not is_suitable_dds_ticket(ticket) or not is_approved_dds_ticket(ticket):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Scenario ticket must be approved, valid and not deleted")
        sanitized_incoming = sanitize_incoming_card(ticket.content)

        if lesson.cadet_id:
            target_cadet = await db.get(User, lesson.cadet_id)
            if not target_cadet or not target_cadet.is_active or target_cadet.role not in ("CADET", "STUDENT"):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assigned cadet is not active")
            active_cadets = [target_cadet]
        else:
            cadet_user_ids = set(group.cadet_ids or []) if group else set()
            if group and group.students:
                cadet_user_ids.update(u.user_id for u in group.students if getattr(u, "user_id", None))
            if not cadet_user_ids:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Group has no cadets assigned")

            res_cadets = await db.execute(
                select(User).where(User.user_id.in_(list(cadet_user_ids)), User.role.in_(["CADET", "STUDENT"]), User.is_active == True)  # noqa: E712
            )
            active_cadets = list(res_cadets.scalars().all())
            if not active_cadets:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Group has no active cadets")

        now_dt = datetime.now(timezone.utc)
        lesson.status = "ACTIVE"
        lesson.started_at = now_dt
        lesson.card_pool_ids = [deepcopy(sanitized_incoming)]
        flag_modified(lesson, "card_pool_ids")

        for student in active_cadets:
            cadet_session = ExamSession(
                session_type="CARD_ACTIONS",
                assignment_id=lesson.assignment_id,
                cadet_id=student.user_id,
                ticket_id=lesson.scenario_id,
                status="ACTIVE",
                start_time=now_dt,
                categories=lesson.categories or [],
                complexity=lesson.complexity,
                error_limit=lesson.error_limit,
                time_limit_seconds=lesson.time_limit_seconds or 30,
            )
            db.add(cadet_session)
            await db.flush()

            assigned_services = {}
            for svc in sanitized_incoming.get("services", []):
                svc_name = svc.get("name")
                if svc_name:
                    clean_history = []
                    for h in svc.get("history", []):
                        if isinstance(h, dict) and h.get("status"):
                            clean_history.append({"status": h.get("status"), "time": h.get("time") or h.get("at")})
                    assigned_services[svc_name] = {
                        "status": svc.get("status", "Получена службой"),
                        "time": svc.get("time", ""),
                        "id": svc.get("id", ""),
                        "history": clean_history,
                    }

            card = IncidentCard(
                session_id=cadet_session.session_id,
                scenario_id=lesson.scenario_id,
                operator_id=student.user_id,
                card_origin="DDS",
                filled_data=deepcopy(sanitized_incoming),
                assigned_services=assigned_services,
                status="open",
                created_at=now_dt,
            )
            db.add(card)
            await db.flush()

            cadet_session.dynamic_state = {
                # Kept outside the cadet-facing DDS state; only the teacher's
                # gradebook reads this immutable answer key.
                "_gradebook_snapshot": {
                    "ticket_id": ticket.scenario_id,
                    "title": ticket.title or (ticket.settings or {}).get("title") or f"Билет #{ticket.scenario_id[:8]}",
                    "etalon": deepcopy(ticket.ground_truth or {}),
                },
                "dds": {
                    "incoming_card": deepcopy(sanitized_incoming),
                    "scenario_snapshot": deepcopy(sanitized_incoming),
                    "card_id": card.card_id,
                    "actions": [],
                    "submitted_at": None,
                    "error_limit": lesson.error_limit,
                    "time_limit_seconds": lesson.time_limit_seconds or 30,
                }
            }
            flag_modified(cadet_session, "dynamic_state")

        await db.commit()
        await db.refresh(lesson)
        cadets_list, total_cadets, total_in_progress, total_passed, total_failed = await _build_cadet_stats(lesson, group, db)
        overall_progress = round(sum(c.progress for c in cadets_list) / max(total_cadets, 1))
        return LessonDetailResponse(
            id=lesson.id,
            group_id=lesson.group_id,
            cadet_id=lesson.cadet_id,
            group_name=group.group_name if group else None,
            teacher_id=lesson.assigned_by,
            target_role=lesson.target_role,
        mode=lesson.mode,
            status=lesson.status,
            categories=lesson.categories or [],
            complexity=lesson.complexity,
            time_limit_seconds=lesson.time_limit_seconds,
            error_limit=lesson.error_limit,
            teacher_notes=lesson.teacher_notes or "",
            created_at=lesson.created_at,
            started_at=lesson.started_at,
            completed_at=lesson.completed_at,
            students=cadets_list,
            cadets=cadets_list,
            overall_progress=overall_progress,
            total_cadets=total_cadets,
            total_in_progress=total_in_progress,
            total_passed=total_passed,
            total_failed=total_failed,
        )

    # Legacy start logic for OPERATOR_112
    lesson.status = "ACTIVE"
    lesson.started_at = datetime.now(timezone.utc)

    group_students = []
    if lesson.cadet_id:
        res_c = await db.execute(select(User).where(User.user_id == lesson.cadet_id))
        c_user = res_c.scalar_one_or_none()
        if c_user:
            group_students = [c_user]
    elif group:
        if group.students:
            group_students = list(group.students)
        elif group.cadet_ids:
            res_c = await db.execute(select(User).where(User.user_id.in_(group.cadet_ids)))
            group_students = list(res_c.scalars().all())

    stmt_sess = select(ExamSession).where(ExamSession.assignment_id == lesson.assignment_id)
    res_sess = await db.execute(stmt_sess)
    existing_sessions = {s.cadet_id: s for s in res_sess.scalars().all() if s.cadet_id}

    for student in group_students:
        if student.user_id not in existing_sessions:
            cadet_session = ExamSession(
                session_type=lesson.session_type,
                assignment_id=lesson.assignment_id,
                cadet_id=student.user_id,
                status="ACTIVE",
                categories=lesson.categories,
                complexity=lesson.complexity,
                error_limit=lesson.error_limit,
                time_limit_seconds=lesson.time_limit_seconds,
                start_time=datetime.now(timezone.utc),
            )
            db.add(cadet_session)
        else:
            existing_s = existing_sessions[student.user_id]
            existing_s.status = "ACTIVE"

    await db.commit()
    await db.refresh(lesson)

    cadets_list, total_cadets, total_in_progress, total_passed, total_failed = (
        await _build_cadet_stats(lesson, group, db)
    )

    return LessonDetailResponse(
        id=lesson.id,
        group_id=lesson.group_id,
        cadet_id=lesson.cadet_id,
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
        mode=lesson.mode,
        status=lesson.status,
        categories=lesson.categories or [],
        complexity=lesson.complexity,
        time_limit_seconds=lesson.time_limit_seconds,
        error_limit=lesson.error_limit,
        teacher_notes=lesson.teacher_notes or "",
        created_at=lesson.created_at,
        started_at=lesson.started_at,
        completed_at=lesson.completed_at,
        students=cadets_list,
        cadets=cadets_list,
        overall_progress=10,
        total_cadets=total_cadets,
        total_in_progress=total_in_progress,
        total_passed=total_passed,
        total_failed=total_failed,
    )


@lessons_router.post(
    "/{lesson_id}/stop",
    response_model=LessonDetailResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def stop_lesson(
    lesson_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Перевести урок в статус COMPLETED и завершить активные сессии."""
    stmt = select(Lesson).where(Lesson.assignment_id == lesson_id)
    res = await db.execute(stmt)
    lesson = res.scalar_one_or_none()

    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lesson with ID {lesson_id} not found",
        )

    if current_user.role != "ADMIN" and lesson.assigned_by != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await lock_assignment(db, lesson_id)
    lesson = (await db.execute(select(Lesson).where(Lesson.assignment_id == lesson_id).execution_options(populate_existing=True))).scalar_one_or_none()

    stmt_group = select(StudentGroup).where(StudentGroup.group_id == lesson.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    if (lesson.status or "").upper() == "COMPLETED":
        # Idempotent repeat preserves completed_at
        cadets_list, total_cadets, total_in_progress, total_passed, total_failed = await _build_cadet_stats(lesson, group, db)
        overall_progress = round(sum(c.progress for c in cadets_list) / max(total_cadets, 1))
        return LessonDetailResponse(
            id=lesson.id,
            group_id=lesson.group_id,
            cadet_id=lesson.cadet_id,
            group_name=group.group_name if group else None,
            teacher_id=lesson.assigned_by,
            target_role=lesson.target_role,
        mode=lesson.mode,
            status=lesson.status,
            categories=lesson.categories or [],
            complexity=lesson.complexity,
            time_limit_seconds=lesson.time_limit_seconds,
            error_limit=lesson.error_limit,
            teacher_notes=lesson.teacher_notes or "",
            created_at=lesson.created_at,
            started_at=lesson.started_at,
            completed_at=lesson.completed_at,
            students=cadets_list,
            cadets=cadets_list,
            overall_progress=overall_progress,
            total_cadets=total_cadets,
            total_in_progress=total_in_progress,
            total_passed=total_passed,
            total_failed=total_failed,
        )

    now = datetime.now(timezone.utc)
    lesson.status = "COMPLETED"
    lesson.completed_at = now

    stmt_sess = select(ExamSession).where(ExamSession.assignment_id == lesson.assignment_id)
    res_sess = await db.execute(stmt_sess)
    for s in res_sess.scalars().all():
        if (s.status or "").upper() != "COMPLETED":
            s.status = "COMPLETED"
            s.end_time = now
            if isinstance(s.dynamic_state, dict) and "dds" in s.dynamic_state:
                dds_data = deepcopy(s.dynamic_state.get("dds", {}))
                dds_data["stopped_at"] = now.isoformat()
                state_copy = deepcopy(s.dynamic_state)
                state_copy["dds"] = dds_data
                s.dynamic_state = state_copy
                flag_modified(s, "dynamic_state")

    await db.commit()
    await db.refresh(lesson)

    cadets_list, total_cadets, total_in_progress, total_passed, total_failed = await _build_cadet_stats(lesson, group, db)
    overall_progress = round(sum(c.progress for c in cadets_list) / max(total_cadets, 1))

    return LessonDetailResponse(
        id=lesson.id,
        group_id=lesson.group_id,
        cadet_id=lesson.cadet_id,
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
        mode=lesson.mode,
        status=lesson.status,
        categories=lesson.categories or [],
        complexity=lesson.complexity,
        time_limit_seconds=lesson.time_limit_seconds,
        error_limit=lesson.error_limit,
        teacher_notes=lesson.teacher_notes or "",
        created_at=lesson.created_at,
        started_at=lesson.started_at,
        completed_at=lesson.completed_at,
        students=cadets_list,
        cadets=cadets_list,
        overall_progress=overall_progress,
        total_cadets=total_cadets,
        total_in_progress=0,
        total_passed=total_passed,
        total_failed=total_failed,
    )


@lessons_router.patch(
    "/{lesson_id}/notes",
    response_model=LessonDetailResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def update_lesson_notes(
    lesson_id: str,
    payload: LessonNotesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Обновить заметки преподавателя к уроку."""
    stmt = select(Lesson).where(Lesson.assignment_id == lesson_id)
    res = await db.execute(stmt)
    lesson = res.scalar_one_or_none()

    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lesson with ID {lesson_id} not found",
        )

    if current_user.role != "ADMIN" and lesson.assigned_by != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    lesson.teacher_notes = payload.teacher_notes
    await db.commit()
    await db.refresh(lesson)

    stmt_group = select(StudentGroup).where(StudentGroup.group_id == lesson.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    cadets_list, total_cadets, total_in_progress, total_passed, total_failed = (
        await _build_cadet_stats(lesson, group, db)
    )

    progress_sum = sum(c.progress for c in cadets_list)
    overall_progress = round(progress_sum / max(total_cadets, 1))

    return LessonDetailResponse(
        id=lesson.id,
        group_id=lesson.group_id,
        cadet_id=lesson.cadet_id,
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
        mode=lesson.mode,
        status=lesson.status,
        categories=lesson.categories or [],
        complexity=lesson.complexity,
        time_limit_seconds=lesson.time_limit_seconds,
        error_limit=lesson.error_limit,
        teacher_notes=lesson.teacher_notes or "",
        created_at=lesson.created_at,
        started_at=lesson.started_at,
        completed_at=lesson.completed_at,
        students=cadets_list,
        cadets=cadets_list,
        overall_progress=overall_progress,
        total_cadets=total_cadets,
        total_in_progress=total_in_progress,
        total_passed=total_passed,
        total_failed=total_failed,
    )
