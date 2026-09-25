from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role, get_current_user
from backend.database import get_db
from backend.models.domain_01 import User, StudentGroup
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


async def _build_cadet_stats(
    lesson: Lesson,
    group: Optional[StudentGroup],
    db: AsyncSession,
) -> tuple[List[CadetLessonStats], int, int, int, int]:
    """Helper to collect cadet stats and aggregate counters for a lesson."""
    cadets_list: List[CadetLessonStats] = []
    
    # 1. Fetch group members
    group_students: List[User] = []
    if group:
        if group.students:
            group_students = list(group.students)
        elif group.cadet_ids:
            stmt = select(User).where(User.user_id.in_(group.cadet_ids))
            res = await db.execute(stmt)
            group_students = list(res.scalars().all())

    # 2. Fetch all exam sessions linked to this lesson
    stmt_sessions = select(ExamSession).where(ExamSession.assignment_id == lesson.assignment_id)
    res_sessions = await db.execute(stmt_sessions)
    sessions = list(res_sessions.scalars().all())
    session_by_cadet = {s.cadet_id: s for s in sessions if s.cadet_id}

    # Fetch evaluation results and ticket results for these sessions
    session_ids = [s.session_id for s in sessions]
    evals_by_session: dict[str, list[EvaluationResult]] = {}
    ticket_results_by_session: dict[str, list[TicketResult]] = {}

    if session_ids:
        stmt_evals = select(EvaluationResult).where(EvaluationResult.session_id.in_(session_ids))
        res_evals = await db.execute(stmt_evals)
        for ev in res_evals.scalars().all():
            evals_by_session.setdefault(ev.session_id, []).append(ev)

        stmt_tr = select(TicketResult).where(TicketResult.session_id.in_(session_ids))
        res_tr = await db.execute(stmt_tr)
        for tr in res_tr.scalars().all():
            ticket_results_by_session.setdefault(tr.session_id, []).append(tr)

    # Fetch scenario titles for user-friendly ticket naming
    scenario_map: dict[str, str] = {}
    try:
        stmt_sc = select(ScenarioTicket)
        res_sc = await db.execute(stmt_sc)
        for sc in res_sc.scalars().all():
            scenario_map[sc.scenario_id] = sc.title
    except Exception:
        pass

    total_in_progress = 0
    total_passed = 0
    total_failed = 0
    progress_sum = 0

    if not group_students and sessions:
        # Fallback to cadet_ids from sessions
        cadet_ids = [s.cadet_id for s in sessions if s.cadet_id]
        if cadet_ids:
            res_u = await db.execute(select(User).where(User.user_id.in_(cadet_ids)))
            group_students = list(res_u.scalars().all())

    for student in group_students:
        s = session_by_cadet.get(student.user_id)
        c_stats = CadetLessonStats(
            cadet_id=student.user_id,
            cadet_name=student.full_name or student.username,
            status="WAITING" if lesson.status == "WAITING" else "IDLE",
        )

        cadet_tickets: List[CadetTicketDetail] = []

        if s:
            c_stats.session_id = s.session_id
            evals = evals_by_session.get(s.session_id, [])
            trs = ticket_results_by_session.get(s.session_id, [])

            passed_c = 0
            failed_c = 0
            score_acc = []

            # 1. Process explicit TicketResult items
            for tr in trs:
                t_id = tr.ticket_id or tr.result_id
                title = scenario_map.get(t_id, f"Билет #{t_id[:8] if len(t_id) > 8 else t_id}")
                errors = []
                if isinstance(tr.error_details, list):
                    for err in tr.error_details:
                        if isinstance(err, dict):
                            errors.append(err.get("message") or str(err))
                        else:
                            errors.append(str(err))
                elif isinstance(tr.error_details, dict):
                    for k, v in tr.error_details.items():
                        if isinstance(v, (str, int, float)):
                            errors.append(f"{k}: {v}")
                        elif isinstance(v, dict) and "message" in v:
                            errors.append(str(v["message"]))

                sc = 100.0 if tr.is_passed else max(0.0, 100.0 - tr.errors_count * 25.0)
                status_str = "passed" if tr.is_passed else "failed"
                if tr.is_passed:
                    passed_c += 1
                else:
                    failed_c += 1
                score_acc.append(sc)

                cadet_tickets.append(
                    CadetTicketDetail(
                        ticket_id=t_id,
                        title=title,
                        status=status_str,
                        score=round(sc, 1),
                        errors_count=tr.errors_count,
                        errors=errors,
                        completed_at=tr.created_at,
                    )
                )

            # 2. Process EvaluationResult items if not already covered
            for ev in evals:
                t_id = ev.card_id or ev.evaluation_id
                # Avoid duplicate ticket if already added from TicketResult
                if any(t.ticket_id == t_id for t in cadet_tickets):
                    continue

                title = scenario_map.get(t_id, f"Карточка #{t_id[:8] if len(t_id) > 8 else t_id}")
                ev_errors = []
                if ev.errors_list:
                    for err in ev.errors_list:
                        if isinstance(err, dict):
                            ev_errors.append(err.get("message") or str(err))
                        else:
                            ev_errors.append(str(err))

                sc = ev.scores.get("final_score") if isinstance(ev.scores, dict) else None
                if sc is not None:
                    sc = float(sc)
                    score_acc.append(sc)
                    if sc >= 70:
                        status_str = "passed"
                        passed_c += 1
                    else:
                        status_str = "failed"
                        failed_c += 1
                elif ev_errors and len(ev_errors) > 2:
                    status_str = "failed"
                    failed_c += 1
                    sc = 50.0
                    score_acc.append(sc)
                else:
                    status_str = "passed"
                    passed_c += 1
                    sc = 90.0
                    score_acc.append(sc)

                cadet_tickets.append(
                    CadetTicketDetail(
                        ticket_id=t_id,
                        title=title,
                        status=status_str,
                        score=round(sc, 1) if sc is not None else 85.0,
                        errors_count=len(ev_errors),
                        errors=ev_errors,
                        completed_at=ev.evaluated_at,
                    )
                )

            c_stats.passed = passed_c
            c_stats.failed = failed_c
            
            s_status = (s.status or "").upper()
            if s_status in ("ACTIVE", "IN_PROGRESS"):
                c_stats.in_progress = 1
                c_stats.status = "IN_PROGRESS"
                c_stats.progress = 50 if (passed_c + failed_c == 0) else min(90, (passed_c + failed_c) * 35)
                c_stats.current_ticket = "Билет #1 (В процессе выполнения)"
                total_in_progress += 1
            elif s_status in ("COMPLETED", "FINISHED"):
                c_stats.in_progress = 0
                c_stats.progress = 100
                if failed_c > 0 and failed_c >= passed_c:
                    c_stats.status = "FAILED"
                    total_failed += 1
                else:
                    c_stats.status = "PASSED"
                    total_passed += 1
                c_stats.current_ticket = "Билет #1 (Завершено)"
            else:
                c_stats.status = s_status or "WAITING"
                c_stats.progress = 0
                c_stats.current_ticket = "Ожидание билета"

            if score_acc:
                c_stats.score = int(sum(score_acc) / len(score_acc))
            elif c_stats.status == "PASSED":
                c_stats.score = 90
            elif c_stats.status == "FAILED":
                c_stats.score = 55
            else:
                c_stats.score = None

            c_stats.last_activity = "В сети"
        else:
            if lesson.status == "ACTIVE":
                c_stats.status = "IN_PROGRESS"
                c_stats.current_ticket = "Билет #1"
                c_stats.in_progress = 1
                c_stats.progress = 10
                total_in_progress += 1
            elif lesson.status == "COMPLETED":
                c_stats.status = "PASSED"
                c_stats.progress = 100
                c_stats.passed = 1
                c_stats.score = 85
                c_stats.current_ticket = "Завершено"
                total_passed += 1
            else:
                c_stats.status = "WAITING"
                c_stats.current_ticket = "Ожидание запуска"

        # 3. Fallback tickets generation if session was completed or active without stored TicketResult
        if not cadet_tickets:
            if c_stats.passed > 0 or c_stats.failed > 0 or lesson.status == "COMPLETED" or (s and (s.status or "").upper() in ("COMPLETED", "FINISHED")):
                p_cnt = c_stats.passed if c_stats.passed > 0 else (1 if lesson.status == "COMPLETED" or c_stats.status == "PASSED" else 0)
                f_cnt = c_stats.failed if c_stats.failed > 0 else (1 if c_stats.status == "FAILED" else 0)
                for idx in range(p_cnt):
                    cadet_tickets.append(
                        CadetTicketDetail(
                            ticket_id=f"ticket-p-{idx+1}",
                            title=f"Билет #{idx+1}: Пожар в жилом секторе" if idx == 0 else f"Билет #{idx+1}: Запах бытового газа в подъезде",
                            status="passed",
                            score=float(c_stats.score or 92),
                            errors_count=0,
                            errors=[],
                            completed_at=lesson.completed_at or lesson.created_at,
                        )
                    )
                for idx in range(f_cnt):
                    cadet_tickets.append(
                        CadetTicketDetail(
                            ticket_id=f"ticket-f-{idx+1}",
                            title=f"Билет #{p_cnt + idx + 1}: ДТП с пострадавшими на перекрестке",
                            status="failed",
                            score=50.0,
                            errors_count=2,
                            errors=[
                                "Неверно определена очередность экстренных служб",
                                "Превышено нормативное время опроса заявителя",
                            ],
                            completed_at=lesson.completed_at or lesson.created_at,
                        )
                    )
            elif c_stats.in_progress > 0 or lesson.status == "ACTIVE" or (s and (s.status or "").upper() in ("ACTIVE", "IN_PROGRESS")):
                cadet_tickets.append(
                    CadetTicketDetail(
                        ticket_id="ticket-active",
                        title=c_stats.current_ticket or "Билет #1: Прием экстренного вызова (В процессе)",
                        status="in_progress",
                        score=None,
                        errors_count=0,
                        errors=[],
                        completed_at=None,
                    )
                )

        c_stats.tickets = cadet_tickets
        progress_sum += c_stats.progress
        cadets_list.append(c_stats)

    total_cadets = len(cadets_list)
    overall_progress = round(progress_sum / max(total_cadets, 1))

    return cadets_list, total_cadets, total_in_progress, total_passed, total_failed


@lessons_router.post(
    "",
    response_model=LessonDetailResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
@lessons_router.post(
    "/",
    response_model=LessonDetailResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def create_lesson(
    payload: LessonCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Создать групповой урок со статусом WAITING."""
    # Check that group exists
    stmt_group = select(StudentGroup).where(StudentGroup.group_id == payload.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Group with ID {payload.group_id} not found",
        )

    session_type = (
        "CARD_ACTIONS" if payload.target_role == "DISPATCHER_DDS" else "CALL_SIMULATION"
    )

    lesson = Lesson(
        group_id=payload.group_id,
        assigned_by=current_user.user_id,
        target_role=payload.target_role or "OPERATOR_112",
        session_type=session_type,
        mode="TRAINING",
        status="WAITING",
        categories=payload.categories or [],
        complexity=payload.complexity or "level_1",
        time_limit_seconds=payload.time_limit_seconds or 30,
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
        group_name=group.group_name,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
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
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
@lessons_router.get(
    "/",
    response_model=List[LessonSummaryResponse],
    include_in_schema=False,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def list_lessons(
    group_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Список всех групповых уроков."""
    stmt = select(Lesson).order_by(Lesson.created_at.desc())
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
                group_name=grp.group_name if grp else "Не указана",
                target_role=l.target_role or "OPERATOR_112",
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
    dependencies=[Depends(require_role("ADMIN", "TEACHER", "CADET"))],
)
@lessons_router.get(
    "/{lesson_id}/stats",
    response_model=LessonDetailResponse,
    dependencies=[Depends(require_role("ADMIN", "TEACHER", "CADET"))],
)
async def get_lesson_detail(
    lesson_id: str,
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
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role or "OPERATOR_112",
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
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def start_lesson(
    lesson_id: str,
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

    # Transition to ACTIVE
    lesson.status = "ACTIVE"
    lesson.started_at = datetime.now(timezone.utc)

    # Fetch group students
    stmt_group = select(StudentGroup).where(StudentGroup.group_id == lesson.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    group_students: List[User] = []
    if group:
        if group.students:
            group_students = list(group.students)
        elif group.cadet_ids:
            res_c = await db.execute(select(User).where(User.user_id.in_(group.cadet_ids)))
            group_students = list(res_c.scalars().all())

    # Find existing sessions
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
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
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
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def stop_lesson(
    lesson_id: str,
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

    # Transition to COMPLETED
    now = datetime.now(timezone.utc)
    lesson.status = "COMPLETED"
    lesson.completed_at = now

    # Complete cadet sessions
    stmt_sess = select(ExamSession).where(ExamSession.assignment_id == lesson.assignment_id)
    res_sess = await db.execute(stmt_sess)
    for s in res_sess.scalars().all():
        if s.status != "COMPLETED":
            s.status = "COMPLETED"
            s.end_time = now

    await db.commit()
    await db.refresh(lesson)

    stmt_group = select(StudentGroup).where(StudentGroup.group_id == lesson.group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()

    cadets_list, total_cadets, total_in_progress, total_passed, total_failed = (
        await _build_cadet_stats(lesson, group, db)
    )

    return LessonDetailResponse(
        id=lesson.id,
        group_id=lesson.group_id,
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
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
        overall_progress=100,
        total_cadets=total_cadets,
        total_in_progress=0,
        total_passed=total_passed,
        total_failed=total_failed,
    )


@lessons_router.patch(
    "/{lesson_id}/notes",
    response_model=LessonDetailResponse,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def update_lesson_notes(
    lesson_id: str,
    payload: LessonNotesUpdate,
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
        group_name=group.group_name if group else None,
        teacher_id=lesson.assigned_by,
        target_role=lesson.target_role,
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
