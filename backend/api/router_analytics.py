"""Router for Aggregated Analytics API.

Provides endpoints for heatmaps, progress trends, and group leaderboards.
"""

from copy import deepcopy
import json
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.gradebook_records import build_attempt_records, historical_record_snapshot, latest_evaluation, resolve_attempt_score_and_status
from backend.core.analytics_engine import build_error_heatmap, calculate_trends
from backend.core.deps import get_current_user, require_role
from backend.database import get_db
from backend.models.domain_01 import StudentGroup, User, UserActionLog, student_group_link
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from datetime import datetime, timedelta, timezone
from backend.models.domain_04 import EvaluationResult, IncidentCard, TicketResult
from backend.schemas.analytics import (
    AnalyticsOverviewResponse,
    CadetAnalyticsSummary,
    DailyDynamicsPoint,
    EntityErrorInfo,
    ErrorHeatmapResponse,
    ErrorTypeInfo,
    GradeOverrideRequest,
    GradeOverrideResponse,
    GroupComparisonItem,
    HeatmapResponse,
    LeaderboardItem,
    LeaderboardResponse,
    RecordAppealRequest,
    RecordDetailResponse,
    RecordSummary,
    SessionAnalyticsResponse,
    TrendPoint,
    TrendResponse,
)

logger = logging.getLogger(__name__)

analytics_router = APIRouter(
    prefix="/api/analytics",
    tags=["Analytics"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
router = analytics_router

analytics_v1_router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["Analytics v1"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)


async def _get_teacher_allowed_group_ids(db: AsyncSession, user: User) -> Set[str]:
    """Returns set of group_ids that the teacher has permission to access."""
    if user.role == "ADMIN":
        g_res = await db.execute(select(StudentGroup.group_id))
        return set(g_res.scalars().all())
    g_res = await db.execute(
        select(StudentGroup.group_id).where(StudentGroup.teacher_id == user.user_id)
    )
    return set(g_res.scalars().all())


async def _verify_session_access(db: AsyncSession, user: User, session: ExamSession) -> None:
    """Ensure teacher only accesses their own group/assignment sessions."""
    if user.role == "ADMIN":
        return
    if session.assignment_id:
        as_res = await db.execute(select(Assignment).where(Assignment.assignment_id == session.assignment_id))
        assignment = as_res.scalar_one_or_none()
        if assignment:
            if assignment.assigned_by == user.user_id:
                return
            if assignment.group_id:
                allowed = await _get_teacher_allowed_group_ids(db, user)
                if assignment.group_id in allowed:
                    return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Доступ запрещен: у вас нет прав на просмотр этой сессии",
    )


async def _verify_record_access(db: AsyncSession, user: User, session_id: Optional[str]) -> None:
    """Ensure teachers can only modify records tied to an accessible session."""
    if user.role == "ADMIN":
        return
    if not session_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещен: запись не привязана к сессии")
    s_res = await db.execute(select(ExamSession).where(ExamSession.session_id == session_id))
    session = s_res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещен: сессия записи не найдена")
    await _verify_session_access(db, user, session)



def _extract_metric_value(
    metric_name: str,
    scores: Optional[Dict[str, Any]],
    metrics: Optional[Dict[str, Any]],
    card: Optional[IncidentCard] = None,
    session: Optional[ExamSession] = None,
) -> Optional[float]:
    """Helper to extract a numeric metric value from evaluation results and session data."""
    scores = scores or {}
    metrics = metrics or {}

    # 1. Final score variants
    if metric_name in ("final_score", "total_score", "score"):
        if "final_score" in scores and scores["final_score"] is not None:
            return float(scores["final_score"])
        if "total_score" in scores and scores["total_score"] is not None:
            return float(scores["total_score"])
        if "score" in scores and scores["score"] is not None:
            return float(scores["score"])

    # 2. SLA time to first dispatch
    if metric_name == "time_to_first_dispatch_sec":
        if "time_to_first_dispatch_sec" in metrics and metrics["time_to_first_dispatch_sec"] is not None:
            return float(metrics["time_to_first_dispatch_sec"])
        sla_m = metrics.get("sla_metrics")
        if isinstance(sla_m, dict) and "time_to_first_dispatch_sec" in sla_m:
            return float(sla_m["time_to_first_dispatch_sec"])
        if "time_taken_sec" in metrics and metrics["time_taken_sec"] is not None:
            return float(metrics["time_taken_sec"])
        if card and card.created_at and session and session.start_time:
            delta = max(0, int((card.created_at - session.start_time).total_seconds()))
            return float(delta)

    # 3. Direct key check in scores
    if metric_name in scores and scores[metric_name] is not None:
        try:
            return float(scores[metric_name])
        except (ValueError, TypeError):
            pass

    # 4. Direct key check in metrics
    if metric_name in metrics and metrics[metric_name] is not None:
        try:
            return float(metrics[metric_name])
        except (ValueError, TypeError):
            pass

    # 5. Nested metric blocks (sla_metrics, card_metrics, comm_metrics)
    for block_key in ("sla_metrics", "card_metrics", "comm_metrics"):
        block = metrics.get(block_key)
        if isinstance(block, dict) and metric_name in block and block[metric_name] is not None:
            try:
                return float(block[metric_name])
            except (ValueError, TypeError):
                pass

    return None


@analytics_router.get("/heatmap", response_model=HeatmapResponse)
@analytics_router.get("/heatmap/", response_model=HeatmapResponse, include_in_schema=False)
async def get_heatmap(
    group_id: Optional[str] = Query(default=None, description="Фильтр по учебной группе"),
    db: AsyncSession = Depends(get_db),
):
    """Generate 2D error heatmap by scenario category and error types."""
    stmt = (
        select(
            EvaluationResult.errors_list,
            IncidentCard.filled_data,
            IncidentCard.scenario_id,
            ExamSession.session_type,
            ScenarioTicket.settings,
            ScenarioTicket.ground_truth,
        )
        .select_from(ExamSession)
        .join(IncidentCard, IncidentCard.session_id == ExamSession.session_id)
        .join(
            EvaluationResult,
            (EvaluationResult.card_id == IncidentCard.card_id)
            | (EvaluationResult.session_id == ExamSession.session_id),
        )
        .outerjoin(ScenarioTicket, ScenarioTicket.scenario_id == IncidentCard.scenario_id)
    )

    if group_id:
        group_res = await db.execute(select(StudentGroup).where(StudentGroup.group_id == group_id))
        group = group_res.scalar_one_or_none()
        group_cadets: List[str] = group.cadet_ids if group and group.cadet_ids else []

        as_res = await db.execute(
            select(Assignment.assignment_id).where(Assignment.group_id == group_id)
        )
        group_assignments = [r[0] for r in as_res.all()]

        group_filters = []
        if group_assignments:
            group_filters.append(ExamSession.assignment_id.in_(group_assignments))
        if group_cadets:
            group_filters.append(ExamSession.cadet_id.in_(group_cadets))

        if group_filters:
            stmt = stmt.where(or_(*group_filters))
        else:
            stmt = stmt.where(ExamSession.assignment_id == group_id)

    res = await db.execute(stmt)
    rows = res.all()

    flat_records: List[Dict[str, Any]] = []
    for errors_list, filled_data, scenario_id, session_type, settings, ground_truth in rows:
        filled_data = filled_data or {}
        settings = settings or {}
        ground_truth = ground_truth or {}

        # Resolve category
        category = (
            filled_data.get("category")
            or filled_data.get("event_category")
            or settings.get("category")
            or settings.get("event_category")
            or ground_truth.get("category")
            or ground_truth.get("event_category")
            or session_type
            or "Общее"
        )

        if isinstance(errors_list, list):
            for err in errors_list:
                if isinstance(err, dict):
                    penalty_type = (
                        err.get("penalty_type")
                        or err.get("error_type")
                        or err.get("error")
                        or str(err)
                    )
                else:
                    penalty_type = str(err)
                if penalty_type:
                    flat_records.append({
                        "category": category,
                        "penalty_type": penalty_type,
                    })

    heatmap = build_error_heatmap(flat_records)
    return HeatmapResponse(root=heatmap)


@analytics_router.get("/trends/{user_id}", response_model=TrendResponse, dependencies=[Depends(require_role("TEACHER"))])
@analytics_router.get("/trends/{user_id}/", response_model=TrendResponse, include_in_schema=False, dependencies=[Depends(require_role("TEACHER"))])
async def get_trends(
    user_id: str,
    group_id: Optional[str] = Query(default=None, description="Фильтр по учебной группе"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve progress trends for target cadet compared with group average over time."""
    # Resolve target user's group if not supplied
    resolved_group_id = group_id
    if not resolved_group_id:
        u_res = await db.execute(select(User).where(User.user_id == user_id))
        user = u_res.scalar_one_or_none()
        if user and user.group_ids:
            resolved_group_id = user.group_ids[0]
        else:
            # Check if user is in any group's cadet_ids
            g_all_res = await db.execute(select(StudentGroup))
            for g in g_all_res.scalars().all():
                if user_id in (g.cadet_ids or []):
                    resolved_group_id = g.group_id
                    break

    group_cadets: List[str] = []
    group_assignments: List[str] = []
    if resolved_group_id:
        group_res = await db.execute(
            select(StudentGroup).where(StudentGroup.group_id == resolved_group_id)
        )
        group = group_res.scalar_one_or_none()
        if group and group.cadet_ids:
            group_cadets = group.cadet_ids

        as_res = await db.execute(
            select(Assignment.assignment_id).where(Assignment.group_id == resolved_group_id)
        )
        group_assignments = [r[0] for r in as_res.all()]

    stmt = (
        select(
            ExamSession.cadet_id,
            ExamSession.start_time,
            IncidentCard.operator_id,
            EvaluationResult.scores,
            EvaluationResult.metrics,
            EvaluationResult.evaluated_at,
        )
        .select_from(ExamSession)
        .outerjoin(IncidentCard, IncidentCard.session_id == ExamSession.session_id)
        .join(
            EvaluationResult,
            (EvaluationResult.session_id == ExamSession.session_id)
            | (EvaluationResult.card_id == IncidentCard.card_id),
        )
    )

    # Filter: always include target user sessions, plus group peers if group resolved
    filter_conds = [ExamSession.cadet_id == user_id]
    if group_assignments:
        filter_conds.append(ExamSession.assignment_id.in_(group_assignments))
    if group_cadets:
        filter_conds.append(ExamSession.cadet_id.in_(group_cadets))

    stmt = stmt.where(or_(*filter_conds))
    res = await db.execute(stmt)
    rows = res.all()

    records: List[Dict[str, Any]] = []
    target_dates: Set[str] = set()

    for cadet_id, start_time, op_id, scores, metrics, evaluated_at in rows:
        cid = cadet_id or op_id
        is_target = bool(cid and cid == user_id)
        dt = start_time or evaluated_at
        if not dt:
            continue
        date_str = dt.strftime("%Y-%m-%d")

        score = _extract_metric_value("final_score", scores, metrics)
        if score is None:
            continue

        if is_target:
            target_dates.add(date_str)

        records.append({
            "session_date": date_str,
            "score": score,
            "is_target_user": is_target,
        })

    # Keep records on days when target cadet had sessions ("в те же дни")
    if target_dates:
        records = [r for r in records if r["session_date"] in target_dates]

    trends = calculate_trends(records)
    root_dict = {
        d: TrendPoint(user_score=pt.get("user_score"), group_avg=pt.get("group_avg"))
        for d, pt in trends.items()
    }
    return TrendResponse(root=root_dict)


@analytics_router.get("/leaderboard", response_model=LeaderboardResponse, dependencies=[Depends(require_role("TEACHER"))])
@analytics_router.get("/leaderboard/", response_model=LeaderboardResponse, include_in_schema=False, dependencies=[Depends(require_role("TEACHER"))])
async def get_leaderboard(
    group_id: Optional[str] = Query(default=None, description="Фильтр по группе"),
    metric_name: str = Query(
        default="final_score",
        description="Название метрики (например, final_score или time_to_first_dispatch_sec)",
    ),
    order: Optional[str] = Query(
        default=None,
        description="Порядок сортировки (asc / desc). Если не указан, выбирается автоматически.",
    ),
    limit: int = Query(default=10, ge=1, le=100, description="Количество курсантов в топе"),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate average metric per cadet in group and return TOP-10 leaderboard."""
    stmt = (
        select(
            User.user_id,
            User.full_name,
            User.username,
            EvaluationResult.scores,
            EvaluationResult.metrics,
            IncidentCard,
            ExamSession,
        )
        .select_from(ExamSession)
        .join(User, User.user_id == ExamSession.cadet_id)
        .outerjoin(IncidentCard, IncidentCard.session_id == ExamSession.session_id)
        .join(
            EvaluationResult,
            (EvaluationResult.session_id == ExamSession.session_id)
            | (EvaluationResult.card_id == IncidentCard.card_id),
        )
        .where(User.is_active == True)  # noqa: E712
    )

    if group_id:
        group_res = await db.execute(select(StudentGroup).where(StudentGroup.group_id == group_id))
        group = group_res.scalar_one_or_none()
        group_cadets: List[str] = group.cadet_ids if group and group.cadet_ids else []

        as_res = await db.execute(
            select(Assignment.assignment_id).where(Assignment.group_id == group_id)
        )
        group_assignments = [r[0] for r in as_res.all()]

        group_filters = []
        if group_assignments:
            group_filters.append(ExamSession.assignment_id.in_(group_assignments))
        if group_cadets:
            group_filters.append(ExamSession.cadet_id.in_(group_cadets))

        if group_filters:
            stmt = stmt.where(or_(*group_filters))
        else:
            stmt = stmt.where(ExamSession.assignment_id == group_id)

    res = await db.execute(stmt)
    rows = res.all()

    cadet_values: Dict[str, List[float]] = {}
    cadet_names: Dict[str, str] = {}

    for uid, full_name, username, scores, metrics, card, session in rows:
        val = _extract_metric_value(metric_name, scores, metrics, card=card, session=session)
        if val is not None:
            cadet_values.setdefault(uid, []).append(val)
            if uid not in cadet_names:
                cadet_names[uid] = full_name or username or f"Курсант {uid[:6]}"

    # Compute cadet average values
    cadet_averages = {
        uid: round(sum(vals) / len(vals), 2)
        for uid, vals in cadet_values.items()
        if vals
    }

    # Determine sorting order: lower is better for durations/penalties/errors
    if order:
        reverse = (order.strip().lower() == "desc")
    else:
        metric_lower = metric_name.lower()
        if any(term in metric_lower for term in ("time", "sec", "second", "penalty", "error", "breach", "delay", "violation")):
            reverse = False
        else:
            reverse = True

    sorted_cadets = sorted(
        cadet_averages.items(),
        key=lambda item: item[1],
        reverse=reverse,
    )

    top_results: List[LeaderboardItem] = [
        LeaderboardItem(
            cadet_name=cadet_names[uid],
            metric_value=avg_val,
            user_id=uid,
        )
        for uid, avg_val in sorted_cadets[:limit]
    ]

    return LeaderboardResponse(root=top_results)


@analytics_router.get("/sessions/{session_id}", response_model=SessionAnalyticsResponse, dependencies=[Depends(require_role("TEACHER"))])
@analytics_v1_router.get("/sessions/{session_id}", response_model=SessionAnalyticsResponse, dependencies=[Depends(require_role("TEACHER"))])
async def get_session_analytics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve session statistics with real cadets and tickets breakdown."""
    session_res = await db.execute(select(ExamSession).where(ExamSession.session_id == session_id))
    exam_session = session_res.scalar_one_or_none()
    if not exam_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Сессия аттестации {session_id} не найдена",
        )

    await _verify_session_access(db, current_user, exam_session)

    cadet_id = exam_session.cadet_id
    cadet_name = "Неизвестный курсант"
    if cadet_id:
        u_res = await db.execute(select(User).where(User.user_id == cadet_id))
        user = u_res.scalar_one_or_none()
        if user:
            cadet_name = user.full_name or user.username or f"Курсант {cadet_id[:6]}"

    tr_res = await db.execute(select(TicketResult).where(TicketResult.session_id == session_id))
    ticket_results = list(tr_res.scalars().all())

    card_res = await db.execute(select(IncidentCard).where(IncidentCard.session_id == session_id))
    cards = list(card_res.scalars().all())

    ev_res = await db.execute(select(EvaluationResult).where(EvaluationResult.session_id == session_id))
    evaluations = list(ev_res.scalars().all())

    records: List[RecordSummary] = []
    for tr, card, matched_ev in build_attempt_records(ticket_results, cards, evaluations):
        if tr is None and card is None:
            continue
        ticket_id = (tr.ticket_id if tr else None) or (card.scenario_id if card else None) or exam_session.ticket_id
        snapshot = historical_record_snapshot(exam_session, ticket_id)
        score, is_passed, status_str, err_cnt, source = resolve_attempt_score_and_status(exam_session, tr, matched_ev)
        records.append(RecordSummary(
            record_id=tr.result_id if tr else card.card_id,
            ticket_id=ticket_id,
            title=(snapshot.get("title") if snapshot else None) or f"Билет #{ticket_id or (tr.result_id if tr else card.card_id)[:6]}",
            status=status_str,
            score=round(score, 1) if score is not None else None,
            is_appealed=bool((tr and tr.is_appealed) or (matched_ev and matched_ev.is_appealed)),
            errors_count=err_cnt,
            teacher_comment=(tr.teacher_comment if tr else None) or (matched_ev.teacher_comment if matched_ev else None),
            evaluation_source=source,
        ))

    graded_records = [r for r in records if r.score is not None]
    passed_count = sum(1 for r in graded_records if r.status == "passed")
    known_outcomes = [r for r in graded_records if r.status in ("passed", "failed")]
    success_rate = round((passed_count / len(graded_records)) * 100.0, 1) if graded_records and len(known_outcomes) == len(graded_records) else None

    cadet_summary = CadetAnalyticsSummary(
        cadet_id=cadet_id or "unknown",
        cadet_name=cadet_name,
        success_rate=success_rate,
        records=records,
    )

    return SessionAnalyticsResponse(
        session_id=session_id,
        title=f"Сессия аттестации #{session_id[:8]}",
        status=exam_session.status.lower() if exam_session.status else "unknown",
        created_at=exam_session.start_time.isoformat() if exam_session.start_time else None,
        cadets=[cadet_summary],
    )


@analytics_router.get("/records/{record_id}", response_model=RecordDetailResponse, dependencies=[Depends(require_role("TEACHER"))])
@analytics_v1_router.get("/records/{record_id}", response_model=RecordDetailResponse, dependencies=[Depends(require_role("TEACHER"))])
async def get_record_detail(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details of a specific cadet answer including real etalon and error details."""
    tr_res = await db.execute(select(TicketResult).where(TicketResult.result_id == record_id))
    tr = tr_res.scalar_one_or_none()

    card_res = await db.execute(select(IncidentCard).where(IncidentCard.card_id == record_id))
    card = card_res.scalar_one_or_none()

    ev_res = await db.execute(
        select(EvaluationResult).where(or_(EvaluationResult.evaluation_id == record_id, EvaluationResult.card_id == record_id))
    )
    ev = latest_evaluation(list(ev_res.scalars().all()))
    if not tr and not card and not ev:
        raise HTTPException(status_code=404, detail=f"Запись результата {record_id} не найдена")
    session_id = tr.session_id if tr else (card.session_id if card else ev.session_id)
    await _verify_record_access(db, current_user, session_id)
    exam_session = await db.get(ExamSession, session_id) if session_id else None
    if exam_session:
        results = list((await db.scalars(select(TicketResult).where(TicketResult.session_id == session_id))).all())
        cards = list((await db.scalars(select(IncidentCard).where(IncidentCard.session_id == session_id))).all())
        evaluations = list((await db.scalars(select(EvaluationResult).where(EvaluationResult.session_id == session_id))).all())
        for attempt_tr, attempt_card, attempt_ev in build_attempt_records(results, cards, evaluations):
            if ((attempt_tr and attempt_tr.result_id == record_id) or
                (attempt_card and attempt_card.card_id == record_id) or
                (ev and attempt_card and attempt_card.card_id == ev.card_id)):
                tr, card, ev = attempt_tr, attempt_card, attempt_ev
                break

    cadet_id = (exam_session.cadet_id if exam_session else None) or (card.operator_id if card else None)
    cadet_name = "Курсант"
    if cadet_id:
        u_res = await db.execute(select(User).where(User.user_id == cadet_id))
        u = u_res.scalar_one_or_none()
        if u:
            cadet_name = u.full_name or u.username or f"Курсант {cadet_id[:6]}"

    scenario_id = (tr.ticket_id if tr else None) or (card.scenario_id if card else None) or (exam_session.ticket_id if exam_session else None)
    snapshot = historical_record_snapshot(exam_session, scenario_id)

    score, is_passed, status_str, err_cnt, source = resolve_attempt_score_and_status(exam_session, tr, ev)

    student_answer: Dict[str, Any] = {}
    if card and card.filled_data:
        student_answer = dict(card.filled_data)
        if card.assigned_services:
            student_answer["assigned_services"] = card.assigned_services
    elif exam_session and isinstance(exam_session.dynamic_state, dict) and "dds" in exam_session.dynamic_state:
        student_answer = exam_session.dynamic_state["dds"]
    elif tr and isinstance(tr.error_details, dict) and tr.error_details:
        student_answer = {"details": tr.error_details}

    # Current scenario data and the student's answer are never historical etalons.
    snapshot_missing = not snapshot or not isinstance(snapshot.get("etalon"), dict)
    etalon = deepcopy(snapshot["etalon"]) if not snapshot_missing else {}

    error_details: Any = []
    if tr and tr.error_details:
        error_details = tr.error_details
    elif ev and ev.errors_list:
        error_details = ev.errors_list

    title = (snapshot.get("title") if snapshot else None) or f"Билет #{scenario_id or record_id[:6]}"
    teacher_comment = (tr.teacher_comment if tr else None) or (ev.teacher_comment if ev else None)
    is_appealed = bool((tr and tr.is_appealed) or (ev and ev.is_appealed))
    expert_modified_at = ev.expert_modified_at.isoformat() if (ev and ev.expert_modified_at) else None
    expert_modified_by = ev.expert_modified_by if ev else None

    return RecordDetailResponse(
        record_id=record_id,
        session_id=session_id,
        cadet_id=cadet_id,
        cadet_name=cadet_name,
        ticket_id=scenario_id,
        title=title,
        status=status_str,
        score=round(score, 1) if score is not None else None,
        is_appealed=is_appealed,
        teacher_comment=teacher_comment,
        evaluation_source=source,
        expert_modified_at=expert_modified_at,
        expert_modified_by=expert_modified_by,
        etalon=etalon,
        student_answer=student_answer,
        error_details=error_details,
        snapshot_missing=snapshot_missing,
    )


@analytics_router.patch(
    "/records/{record_id}/appeal",
    response_model=RecordDetailResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
@analytics_v1_router.patch(
    "/records/{record_id}/appeal",
    response_model=RecordDetailResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def appeal_analytics_record(
    record_id: str,
    req: RecordAppealRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Teacher appeal endpoint to adjust evaluation status and store comment."""
    tr_res = await db.execute(select(TicketResult).where(TicketResult.result_id == record_id))
    tr = tr_res.scalar_one_or_none()

    card_res = await db.execute(select(IncidentCard).where(IncidentCard.card_id == record_id))
    card = card_res.scalar_one_or_none()

    ev_res = await db.execute(
        select(EvaluationResult).where(
            or_(EvaluationResult.evaluation_id == record_id, EvaluationResult.card_id == record_id)
        ).order_by(EvaluationResult.evaluated_at.desc(), EvaluationResult.evaluation_id.asc())
    )
    ev = ev_res.scalars().first()

    if not tr and not card and not ev:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Запись результата {record_id} не найдена для подачи апелляции",
        )

    session_id = tr.session_id if tr else (card.session_id if card else (ev.session_id if ev else None))
    if current_user:
        await _verify_record_access(db, current_user, session_id)

    is_passed = (req.status == "passed")
    if tr:
        if tr.session_id:
            sess = await db.get(ExamSession, tr.session_id)
            if sess and (sess.dynamic_state or {}).get("dds"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Appeals for assigned DDS sessions are not allowed in A-06",
                )

        old_is_passed = tr.is_passed
        tr.is_passed = is_passed
        tr.score_total = 100.0 if is_passed else 0.0
        tr.teacher_comment = req.comment
        tr.is_appealed = True
        tr.updated_at = datetime.now(timezone.utc)

        endpoint_path = f"/api/analytics/records/{record_id}/appeal"
        audit_details = json.dumps(
            {
                "old_is_passed": old_is_passed,
                "new_is_passed": is_passed,
                "comment": req.comment,
                "endpoint": endpoint_path,
            },
            ensure_ascii=False,
        )

        log_entry = UserActionLog(
            user_id=str(current_user.user_id) if current_user else None,
            role=current_user.role if current_user else None,
            action="GRADE_MODIFIED",
            target_entity="ticket_results",
            target_id=record_id,
            endpoint=endpoint_path,
            details=audit_details,
        )
        db.add(log_entry)

        await db.commit()
        await db.refresh(tr)
        return await get_record_detail(record_id=record_id, db=db, current_user=current_user or User(role="TEACHER"))

    if ev:
        now_dt = datetime.now(timezone.utc)
        ev.is_appealed = True
        ev.teacher_comment = req.comment
        ev.expert_modified_at = now_dt
        ev.expert_modified_by = current_user.user_id if current_user else None
        new_scores = dict(ev.scores or {})
        new_scores["final_score"] = 100.0 if is_passed else 0.0
        new_scores["total"] = 100.0 if is_passed else 0.0
        ev.scores = new_scores
        flag_modified(ev, "scores")

        endpoint_path = f"/api/analytics/records/{record_id}/appeal"
        log_entry = UserActionLog(
            user_id=str(current_user.user_id) if current_user else None,
            role=current_user.role if current_user else None,
            action="GRADE_MODIFIED",
            target_entity="evaluation_results",
            target_id=record_id,
            endpoint=endpoint_path,
            details=json.dumps({"is_passed": is_passed, "comment": req.comment}),
        )
        db.add(log_entry)
        await db.commit()
        return await get_record_detail(record_id=record_id, db=db, current_user=current_user or User(role="TEACHER"))



# ─── Grade Override Endpoints with Audit Log (UserActionLog) ──────────────────

@analytics_router.post(
    "/sessions/{session_id}/grade-override",
    response_model=GradeOverrideResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
@analytics_v1_router.post(
    "/sessions/{session_id}/grade-override",
    response_model=GradeOverrideResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def override_session_grade(
    session_id: str,
    req: GradeOverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Override session grade with strict audit logging in UserActionLog."""
    stmt_s = select(ExamSession).where(ExamSession.session_id == session_id)
    session = (await db.execute(stmt_s)).scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Сессия {session_id} не найдена",
        )

    await _verify_record_access(db, current_user, session.session_id)

    now_dt = datetime.now(timezone.utc)
    old_score = None

    # Find existing EvaluationResult
    stmt_ev = (
        select(EvaluationResult)
        .where(EvaluationResult.session_id == session.session_id)
        .order_by(EvaluationResult.evaluated_at.desc(), EvaluationResult.evaluation_id.asc())
    )
    evaluation = (await db.execute(stmt_ev)).scalars().first()

    if evaluation:
        old_score = (evaluation.scores or {}).get("final_score")
        if old_score is None:
            old_score = (evaluation.scores or {}).get("total")
        new_scores = dict(evaluation.scores or {})
        new_scores["final_score"] = req.score
        new_scores["total"] = req.score
        evaluation.scores = new_scores
        evaluation.teacher_comment = req.comment or req.reason
        evaluation.is_appealed = True
        evaluation.expert_modified_at = now_dt
        evaluation.expert_modified_by = current_user.user_id
        flag_modified(evaluation, "scores")
    else:
        # Check incident card
        stmt_c = select(IncidentCard).where(IncidentCard.session_id == session.session_id)
        card = (await db.execute(stmt_c)).scalar_one_or_none()
        if card is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Нельзя создать переоценку: у сессии нет карточки для обязательного внешнего ключа",
            )
        card_id = card.card_id

        evaluation = EvaluationResult(
            card_id=card_id,
            session_id=session.session_id,
            scores={"final_score": req.score, "total": req.score},
            metrics={"expert_override": True},
            errors_list=[],
            teacher_comment=req.comment or req.reason,
            is_appealed=True,
            expert_modified_at=now_dt,
            expert_modified_by=current_user.user_id,
            evaluated_at=now_dt,
        )
        db.add(evaluation)

    # Sync into dynamic_state if present
    if isinstance(session.dynamic_state, dict) and "dds" in session.dynamic_state:
        st = deepcopy(session.dynamic_state)
        if old_score is None:
            old_score = st["dds"].get("score")
        st["dds"]["score"] = req.score
        st["dds"]["teacher_comment"] = req.comment or req.reason
        session.dynamic_state = st
        flag_modified(session, "dynamic_state")

    # Record UserActionLog audit entry
    endpoint_path = f"/api/v1/analytics/sessions/{session_id}/grade-override"
    audit_log = UserActionLog(
        user_id=current_user.user_id,
        role=current_user.role,
        action="GRADE_OVERRIDE",
        target_entity="exam_sessions",
        target_id=session.session_id,
        endpoint=endpoint_path,
        details=json.dumps(
            {
                "session_id": session.session_id,
                "cadet_id": session.cadet_id,
                "assignment_id": session.assignment_id,
                "old_score": old_score,
                "new_score": req.score,
                "reason": req.reason,
                "comment": req.comment,
            },
            ensure_ascii=False,
        ),
    )
    db.add(audit_log)
    await db.commit()

    return GradeOverrideResponse(
        status="ok",
        session_id=session.session_id,
        record_id=None,
        old_score=float(old_score) if old_score is not None else None,
        new_score=float(req.score),
        reason=req.reason,
        teacher_id=current_user.user_id,
        updated_at=now_dt.isoformat(),
    )


@analytics_router.post(
    "/records/{record_id}/grade-override",
    response_model=GradeOverrideResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
@analytics_v1_router.post(
    "/records/{record_id}/grade-override",
    response_model=GradeOverrideResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def override_record_grade(
    record_id: str,
    req: GradeOverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Override ticket record grade with audit logging in UserActionLog."""
    now_dt = datetime.now(timezone.utc)
    old_score = None
    session_id = None

    tr_res = await db.execute(select(TicketResult).where(TicketResult.result_id == record_id))
    tr = tr_res.scalar_one_or_none()

    if tr:
        old_score = tr.score_total
        session_id = tr.session_id
        tr.score_total = req.score
        tr.is_passed = req.score >= 60.0
        tr.teacher_comment = req.comment or req.reason
        tr.is_appealed = True
        tr.updated_at = now_dt

    stmt_ev = (
        select(EvaluationResult)
        .where(EvaluationResult.evaluation_id == record_id)
        .order_by(EvaluationResult.evaluated_at.desc(), EvaluationResult.evaluation_id.asc())
    )
    ev = (await db.execute(stmt_ev)).scalar_one_or_none()
    if ev:
        session_id = ev.session_id or session_id
        if old_score is None:
            old_score = (ev.scores or {}).get("final_score")
            if old_score is None:
                old_score = (ev.scores or {}).get("total")
        new_scores = dict(ev.scores or {})
        new_scores["final_score"] = req.score
        new_scores["total"] = req.score
        ev.scores = new_scores
        ev.teacher_comment = req.comment or req.reason
        ev.is_appealed = True
        ev.expert_modified_at = now_dt
        ev.expert_modified_by = current_user.user_id
        flag_modified(ev, "scores")

    if not tr and not ev:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Запись результата {record_id} не найдена",
        )

    await _verify_record_access(db, current_user, session_id)

    endpoint_path = f"/api/v1/analytics/records/{record_id}/grade-override"
    audit_log = UserActionLog(
        user_id=current_user.user_id,
        role=current_user.role,
        action="GRADE_OVERRIDE",
        target_entity="ticket_results",
        target_id=record_id,
        endpoint=endpoint_path,
        details=json.dumps(
            {
                "record_id": record_id,
                "session_id": session_id,
                "old_score": old_score,
                "new_score": req.score,
                "reason": req.reason,
                "comment": req.comment,
            },
            ensure_ascii=False,
        ),
    )
    db.add(audit_log)
    await db.commit()

    return GradeOverrideResponse(
        status="ok",
        session_id=session_id,
        record_id=record_id,
        old_score=float(old_score) if old_score is not None else None,
        new_score=float(req.score),
        reason=req.reason,
        teacher_id=current_user.user_id,
        updated_at=now_dt.isoformat(),
    )


# ─── New Analytics Endpoints for Dashboards & Dummy Data (Task 75) ─────────────

TAXONOMY_ERRORS: Dict[str, Dict[str, str]] = {
    "comm_rude_tone": {"label": "Грубый тон", "category": "communication", "severity": "high"},
    "comm_interruption": {"label": "Перебивание заявителя", "category": "communication", "severity": "medium"},
    "comm_clarification_missed": {"label": "Пропуск уточнения", "category": "communication", "severity": "medium"},
    "comm_unprofessional": {"label": "Нерегламентированная лексика", "category": "communication", "severity": "low"},
    "card_wrong_address": {"label": "Ошибка в адресе", "category": "card", "severity": "critical"},
    "card_wrong_services": {"label": "Неверные службы", "category": "card", "severity": "critical"},
    "card_missing_caller": {"label": "Данные заявителя пропущены", "category": "card", "severity": "medium"},
    "card_incorrect_priority": {"label": "Неверный приоритет", "category": "card", "severity": "medium"},
    "card_incomplete_description": {"label": "Неполное описание", "category": "card", "severity": "low"},
    "sla_dispatch_delay": {"label": "Задержка ДДС (>60 сек)", "category": "sla", "severity": "high"},
    "sla_call_duration_exceeded": {"label": "Время звонка (>120 сек)", "category": "sla", "severity": "medium"},
    "sla_response_time_breach": {"label": "Задержка ответа на вызов", "category": "sla", "severity": "medium"},
}


async def _calculate_analytics_summary(
    db: AsyncSession,
    current_user: User,
    group_id: Optional[str] = None,
    cadet_id: Optional[str] = None,
    days: int = 30,
) -> AnalyticsOverviewResponse:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    allowed_group_ids: Optional[Set[str]] = None
    if current_user.role == "TEACHER":
        g_res = await db.execute(
            select(StudentGroup.group_id).where(StudentGroup.teacher_id == current_user.user_id)
        )
        allowed_group_ids = set(g_res.scalars().all())

        if group_id and group_id != "ALL":
            if group_id not in allowed_group_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Доступ запрещен: вы не являетесь преподавателем группы {group_id}",
                )

    stmt = (
        select(ExamSession, Assignment)
        .select_from(ExamSession)
        .outerjoin(Assignment, Assignment.assignment_id == ExamSession.assignment_id)
    )

    if group_id and group_id != "ALL":
        stmt = stmt.where(Assignment.group_id == group_id)
    elif current_user.role == "TEACHER":
        teacher_conds = []
        if allowed_group_ids:
            teacher_conds.append(Assignment.group_id.in_(list(allowed_group_ids)))
        teacher_conds.append(Assignment.assigned_by == current_user.user_id)
        stmt = stmt.where(or_(*teacher_conds))

    if cadet_id:
        stmt = stmt.where(ExamSession.cadet_id == cadet_id)

    res = await db.execute(stmt)
    session_rows = res.all()

    if not session_rows:
        return AnalyticsOverviewResponse(
            total_sessions=0,
            total_attempts=0,
            graded_attempts=0,
            pending_attempts=0,
            avg_score=None,
            passed_count=0,
            failed_count=0,
            pass_rate=None,
            total_errors=0,
            active_cadets_count=0,
            trend_direction=None,
            daily_dynamics=[],
        )

    sessions = [row[0] for row in session_rows]
    session_ids = [s.session_id for s in sessions]

    tr_res = await db.execute(
        select(TicketResult).where(TicketResult.session_id.in_(session_ids))
    )
    trs_by_session: Dict[str, List[TicketResult]] = {}
    for tr in tr_res.scalars().all():
        trs_by_session.setdefault(tr.session_id, []).append(tr)

    card_res = await db.execute(
        select(IncidentCard).where(IncidentCard.session_id.in_(session_ids))
    )
    cards_by_session: Dict[str, List[IncidentCard]] = {}
    for c in card_res.scalars().all():
        cards_by_session.setdefault(c.session_id, []).append(c)

    ev_res = await db.execute(
        select(EvaluationResult).where(EvaluationResult.session_id.in_(session_ids))
    )
    evals_by_session: Dict[str, List[EvaluationResult]] = {}
    for ev in ev_res.scalars().all():
        evals_by_session.setdefault(ev.session_id, []).append(ev)

    buckets: Dict[str, Dict[str, Any]] = {}
    all_graded_scores: List[float] = []
    total_passed = 0
    total_failed = 0
    total_pending = 0
    total_attempts = 0
    total_errors = 0
    unique_cadets: Set[str] = set()
    unique_sessions_in_period: Set[str] = set()

    for s in sessions:
        trs = trs_by_session.get(s.session_id, [])
        cards = cards_by_session.get(s.session_id, [])
        evals = evals_by_session.get(s.session_id, [])

        if s.cadet_id:
            unique_cadets.add(s.cadet_id)

        session_attempts: List[Tuple[Optional[float], Optional[bool], str, int, Optional[str], datetime]] = []

        for tr, card, matched_ev in build_attempt_records(trs, cards, evals):
            score, is_passed, status_str, err_cnt, source = resolve_attempt_score_and_status(s, tr, matched_ev)
            dt = ((tr.updated_at or tr.created_at) if tr else None) or (matched_ev.evaluated_at if matched_ev else None) or (card.created_at if card else None) or s.end_time or s.start_time
            if dt and dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            session_attempts.append((score, is_passed, status_str, err_cnt, source, dt))

        for score, is_passed, status_str, err_cnt, source, dt in session_attempts:
            if dt and dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt and dt < cutoff:
                continue

            unique_sessions_in_period.add(s.session_id)
            total_attempts += 1
            total_errors += err_cnt

            date_str = dt.strftime("%Y-%m-%d") if dt else now.strftime("%Y-%m-%d")
            if date_str not in buckets:
                buckets[date_str] = {
                    "scores": [],
                    "passed": 0,
                    "failed": 0,
                    "pending": 0,
                }

            if score is not None:
                all_graded_scores.append(score)
                buckets[date_str]["scores"].append(score)
                if is_passed:
                    total_passed += 1
                    buckets[date_str]["passed"] += 1
                elif is_passed is False:
                    total_failed += 1
                    buckets[date_str]["failed"] += 1
            else:
                total_pending += 1
                buckets[date_str]["pending"] += 1

    daily_points: List[DailyDynamicsPoint] = []
    for d_str in sorted(buckets.keys()):
        b = buckets[d_str]
        graded = len(b["scores"])
        pending = b["pending"]
        day_total = graded + pending
        day_avg = round(sum(b["scores"]) / graded, 1) if graded > 0 else None
        day_pass_rate = round((b["passed"] / graded) * 100.0, 1) if graded > 0 and b["passed"] + b["failed"] == graded else None

        daily_points.append(
            DailyDynamicsPoint(
                date=d_str,
                avg_score=day_avg,
                total_sessions=day_total,
                graded_count=graded,
                pending_count=pending,
                passed_count=b["passed"],
                failed_count=b["failed"],
                pass_rate=day_pass_rate,
            )
        )

    total_graded = len(all_graded_scores)
    overall_avg = round(sum(all_graded_scores) / total_graded, 1) if total_graded > 0 else None
    overall_pass_rate = round((total_passed / total_graded) * 100.0, 1) if total_graded > 0 and total_passed + total_failed == total_graded else None

    trend_direction = None
    graded_days = [p for p in daily_points if p.avg_score is not None]
    if len(graded_days) >= 2:
        mid = len(graded_days) // 2
        first_half = [p.avg_score for p in graded_days[:mid] if p.avg_score is not None]
        second_half = [p.avg_score for p in graded_days[mid:] if p.avg_score is not None]
        if first_half and second_half:
            avg_1 = sum(first_half) / len(first_half)
            avg_2 = sum(second_half) / len(second_half)
            if avg_2 > avg_1 + 1.0:
                trend_direction = "positive"
            elif avg_2 < avg_1 - 1.0:
                trend_direction = "negative"
            else:
                trend_direction = "stable"

    return AnalyticsOverviewResponse(
        total_sessions=len(unique_sessions_in_period),
        total_attempts=total_attempts,
        graded_attempts=total_graded,
        pending_attempts=total_pending,
        avg_score=overall_avg,
        passed_count=total_passed,
        failed_count=total_failed,
        pass_rate=overall_pass_rate,
        total_errors=total_errors,
        active_cadets_count=len(unique_cadets),
        trend_direction=trend_direction,
        daily_dynamics=daily_points,
    )


@analytics_router.get("/overview", response_model=AnalyticsOverviewResponse)
@analytics_router.get("/overview/", response_model=AnalyticsOverviewResponse, include_in_schema=False)
@analytics_v1_router.get("/overview", response_model=AnalyticsOverviewResponse)
@analytics_v1_router.get("/overview/", response_model=AnalyticsOverviewResponse, include_in_schema=False)
async def get_analytics_overview(
    group_id: Optional[str] = Query(default=None, description="Фильтр по учебной группе"),
    cadet_id: Optional[str] = Query(default=None, description="Фильтр по курсанту"),
    days: int = Query(default=30, ge=1, le=180, description="Глубина в днях"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve verified summary header metrics and daily dynamics."""
    return await _calculate_analytics_summary(
        db=db,
        current_user=current_user,
        group_id=group_id,
        cadet_id=cadet_id,
        days=days,
    )


@analytics_router.get("/dynamics", response_model=List[DailyDynamicsPoint])
@analytics_router.get("/dynamics/", response_model=List[DailyDynamicsPoint], include_in_schema=False)
@analytics_v1_router.get("/dynamics", response_model=List[DailyDynamicsPoint])
@analytics_v1_router.get("/dynamics/", response_model=List[DailyDynamicsPoint], include_in_schema=False)
async def get_daily_dynamics(
    group_id: Optional[str] = Query(default=None, description="Фильтр по учебной группе"),
    cadet_id: Optional[str] = Query(default=None, description="Фильтр по курсанту"),
    days: int = Query(default=30, ge=1, le=180, description="Глубина в днях"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve daily average scores, session volumes, and pass rate over time."""
    overview = await _calculate_analytics_summary(
        db=db,
        current_user=current_user,
        group_id=group_id,
        cadet_id=cadet_id,
        days=days,
    )
    return overview.daily_dynamics


@analytics_router.get("/groups-comparison", response_model=List[GroupComparisonItem])
@analytics_router.get("/groups-comparison/", response_model=List[GroupComparisonItem], include_in_schema=False)
@analytics_v1_router.get("/groups-comparison", response_model=List[GroupComparisonItem])
@analytics_v1_router.get("/groups-comparison/", response_model=List[GroupComparisonItem], include_in_schema=False)
async def get_groups_comparison(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compare average scores, pass rate, and session volume across all accessible student groups."""
    stmt_g = select(StudentGroup).order_by(StudentGroup.group_name)
    if current_user.role == "TEACHER":
        stmt_g = stmt_g.where(StudentGroup.teacher_id == current_user.user_id)
    groups_res = await db.execute(stmt_g)
    groups = groups_res.scalars().all()

    items: List[GroupComparisonItem] = []
    for grp in groups:
        uids = set(grp.cadet_ids or [])
        link_res = await db.execute(
            select(student_group_link.c.user_id).where(student_group_link.c.group_id == grp.group_id)
        )
        uids.update([r[0] for r in link_res.all()])

        as_res = await db.execute(
            select(Assignment.assignment_id).where(Assignment.group_id == grp.group_id)
        )
        as_ids = [r[0] for r in as_res.all()]

        if not as_ids:
            items.append(
                GroupComparisonItem(
                    group_id=grp.group_id,
                    group_name=grp.group_name or f"Группа {grp.group_id[:6]}",
                    student_count=len(uids),
                    avg_score=0.0,
                    pass_rate=0.0,
                    total_sessions=0,
                    total_errors=0,
                )
            )
            continue

        s_res = await db.execute(
            select(ExamSession).where(ExamSession.assignment_id.in_(as_ids))
        )
        sessions = list(s_res.scalars().all())
        session_ids = [s.session_id for s in sessions]

        if not session_ids:
            items.append(
                GroupComparisonItem(
                    group_id=grp.group_id,
                    group_name=grp.group_name or f"Группа {grp.group_id[:6]}",
                    student_count=len(uids),
                    avg_score=0.0,
                    pass_rate=0.0,
                    total_sessions=0,
                    total_errors=0,
                )
            )
            continue

        tr_res = await db.execute(
            select(TicketResult).where(TicketResult.session_id.in_(session_ids))
        )
        trs_by_sess: Dict[str, List[TicketResult]] = {}
        for tr in tr_res.scalars().all():
            trs_by_sess.setdefault(tr.session_id, []).append(tr)

        ev_res = await db.execute(
            select(EvaluationResult).where(EvaluationResult.session_id.in_(session_ids))
        )
        evals_by_sess: Dict[str, List[EvaluationResult]] = {}
        for ev in ev_res.scalars().all():
            evals_by_sess.setdefault(ev.session_id, []).append(ev)

        group_scores: List[float] = []
        passed_count = 0
        total_errors = 0

        for s in sessions:
            trs = trs_by_sess.get(s.session_id, [])
            evals = evals_by_sess.get(s.session_id, [])
            if trs:
                for tr in trs:
                    matched_ev = next((e for e in evals if e.session_id == s.session_id), None)
                    sc, passed, _, err_cnt, _ = resolve_attempt_score_and_status(s, tr, matched_ev)
                    total_errors += err_cnt
                    if sc is not None:
                        group_scores.append(sc)
                        if passed:
                            passed_count += 1
            elif evals:
                for ev in evals:
                    sc, passed, _, err_cnt, _ = resolve_attempt_score_and_status(s, None, ev)
                    total_errors += err_cnt
                    if sc is not None:
                        group_scores.append(sc)
                        if passed:
                            passed_count += 1

        graded_len = len(group_scores)
        avg_score = round(sum(group_scores) / graded_len, 1) if graded_len > 0 else 0.0
        pass_rate = round((passed_count / graded_len) * 100.0, 1) if graded_len > 0 else 0.0

        items.append(
            GroupComparisonItem(
                group_id=grp.group_id,
                group_name=grp.group_name or f"Группа {grp.group_id[:6]}",
                student_count=len(uids),
                avg_score=avg_score,
                pass_rate=pass_rate,
                total_sessions=len(sessions),
                total_errors=total_errors,
            )
        )

    return items



@analytics_router.get("/errors-heatmap", response_model=ErrorHeatmapResponse)
@analytics_router.get("/errors-heatmap/", response_model=ErrorHeatmapResponse, include_in_schema=False)
@analytics_v1_router.get("/errors-heatmap", response_model=ErrorHeatmapResponse)
@analytics_v1_router.get("/errors-heatmap/", response_model=ErrorHeatmapResponse, include_in_schema=False)
async def get_errors_heatmap(
    group_id: Optional[str] = Query(default=None, description="Фильтр по группе"),
    entity_type: str = Query(default="students", description="'students' или 'groups'"),
    category: Optional[str] = Query(default=None, description="Категория ошибки: communication, card, sla"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve 2D frequency matrix of error types per student or group."""
    group_cadets: List[str] = []
    group_assignments: List[str] = []
    if group_id and group_id != "ALL":
        g_res = await db.execute(select(StudentGroup).where(StudentGroup.group_id == group_id))
        group = g_res.scalar_one_or_none()
        if group and group.cadet_ids:
            group_cadets = list(group.cadet_ids)
        link_res = await db.execute(
            select(student_group_link.c.user_id).where(student_group_link.c.group_id == group_id)
        )
        group_cadets.extend([r[0] for r in link_res.all()])

        as_res = await db.execute(
            select(Assignment.assignment_id).where(Assignment.group_id == group_id)
        )
        group_assignments = [r[0] for r in as_res.all()]

    # Fetch groups mapping
    groups_res = await db.execute(select(StudentGroup))
    all_groups = groups_res.scalars().all()
    cadet_group_map: Dict[str, str] = {}
    group_name_map: Dict[str, str] = {g.group_id: g.group_name for g in all_groups}
    for g in all_groups:
        for cid in (g.cadet_ids or []):
            cadet_group_map[cid] = g.group_name

    link_rows = await db.execute(
        select(student_group_link.c.user_id, student_group_link.c.group_id)
    )
    for uid, gid in link_rows.all():
        if gid in group_name_map:
            cadet_group_map[uid] = group_name_map[gid]

    u_rows = await db.execute(select(User.user_id, User.group_ids))
    for uid, gids in u_rows.all():
        if gids and isinstance(gids, list) and len(gids) > 0:
            gid = gids[0]
            if gid in group_name_map:
                cadet_group_map[uid] = group_name_map[gid]

    assign_rows = await db.execute(select(Assignment.assignment_id, Assignment.group_id))
    assign_group_map = {aid: gid for aid, gid in assign_rows.all() if gid}

    stmt = (
        select(
            ExamSession.cadet_id,
            ExamSession.assignment_id,
            User.full_name,
            User.username,
            TicketResult.error_details,
            EvaluationResult.errors_list,
        )
        .select_from(ExamSession)
        .outerjoin(User, User.user_id == ExamSession.cadet_id)
        .outerjoin(TicketResult, TicketResult.session_id == ExamSession.session_id)
        .outerjoin(EvaluationResult, EvaluationResult.session_id == ExamSession.session_id)
    )

    conds = []
    if group_cadets:
        conds.append(ExamSession.cadet_id.in_(group_cadets))
    if group_assignments:
        conds.append(ExamSession.assignment_id.in_(group_assignments))
    if group_id and group_id != "ALL" and not conds:
        conds.append(ExamSession.assignment_id == group_id)

    if conds:
        stmt = stmt.where(or_(*conds))

    res = await db.execute(stmt)
    rows = res.all()

    # Data structures for accumulation
    entity_counts: Dict[str, Dict[str, int]] = {}
    entity_names: Dict[str, str] = {}
    entity_group_names: Dict[str, str] = {}
    totals_by_error: Dict[str, int] = {}
    active_error_keys: Set[str] = set()

    if entity_type == "groups":
        for g in all_groups:
            if group_id and group_id != "ALL" and g.group_id != group_id:
                continue
            gname = g.group_name or f"Группа {g.group_id[:6]}"
            entity_counts[gname] = {}
            entity_names[gname] = gname

    for cadet_id, as_id, full_name, username, error_details, errors_list in rows:
        cadet_id_str = cadet_id or "unknown"
        student_name = full_name or username or f"Курсант {cadet_id_str[:6]}"
        grp_name = (
            cadet_group_map.get(cadet_id_str)
            or (group_name_map.get(assign_group_map.get(as_id, "")) if as_id else None)
            or "Общая группа"
        )

        if entity_type == "groups":
            ent_id = grp_name
            ent_name = grp_name
            ent_grp = None
        else:
            ent_id = cadet_id_str
            ent_name = student_name
            ent_grp = grp_name

        if ent_id not in entity_counts:
            entity_counts[ent_id] = {}
            entity_names[ent_id] = ent_name
            if ent_grp:
                entity_group_names[ent_id] = ent_grp

        # Extract all errors
        raw_errors: List[Any] = []
        if isinstance(error_details, list):
            raw_errors.extend(error_details)
        elif isinstance(error_details, dict):
            raw_errors.extend(error_details.values())

        if isinstance(errors_list, list):
            raw_errors.extend(errors_list)

        for err in raw_errors:
            if isinstance(err, dict):
                err_key = err.get("penalty_type") or err.get("error_type") or err.get("key") or str(err)
                err_cat = err.get("category")
            else:
                err_key = str(err)
                err_cat = None

            if not err_key:
                continue

            tax_info = TAXONOMY_ERRORS.get(err_key)
            if not err_cat:
                if tax_info:
                    err_cat = tax_info["category"]
                elif err_key.startswith("comm_"):
                    err_cat = "communication"
                elif err_key.startswith("card_"):
                    err_cat = "card"
                elif err_key.startswith("sla_"):
                    err_cat = "sla"
                else:
                    err_cat = "other"

            # Apply category filter if provided
            if category and category.lower() != err_cat.lower():
                continue

            active_error_keys.add(err_key)
            entity_counts[ent_id][err_key] = entity_counts[ent_id].get(err_key, 0) + 1
            totals_by_error[err_key] = totals_by_error.get(err_key, 0) + 1

    # Ensure all taxonomy errors in target category are listed for complete grid view
    displayed_keys: List[str] = []
    for k, info in TAXONOMY_ERRORS.items():
        if category and category.lower() != info["category"].lower():
            continue
        displayed_keys.append(k)

    for k in active_error_keys:
        if k not in displayed_keys:
            displayed_keys.append(k)

    error_types: List[ErrorTypeInfo] = []
    for k in displayed_keys:
        info = TAXONOMY_ERRORS.get(k, {"label": k, "category": "other", "severity": "medium"})
        error_types.append(
            ErrorTypeInfo(
                key=k,
                label=info["label"],
                category=info["category"],
                severity=info.get("severity", "medium"),
            )
        )

    entities: List[EntityErrorInfo] = []
    for ent_id, counts in entity_counts.items():
        total_errs = sum(counts.values())
        entities.append(
            EntityErrorInfo(
                id=ent_id,
                name=entity_names.get(ent_id, ent_id),
                group_name=entity_group_names.get(ent_id),
                error_counts=counts,
                total_errors=total_errs,
            )
        )

    # Sort entities by total errors descending
    entities.sort(key=lambda e: e.total_errors, reverse=True)

    return ErrorHeatmapResponse(
        error_types=error_types,
        entities=entities,
        totals_by_error=totals_by_error,
    )


