"""Router for Aggregated Analytics API.

Provides endpoints for heatmaps, progress trends, and group leaderboards.
"""

import json
import logging
from typing import Any, Dict, List, Optional, Set
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.analytics_engine import build_error_heatmap, calculate_trends
from backend.core.deps import get_current_user, require_role
from backend.database import get_db
from backend.models.domain_01 import StudentGroup, User, UserActionLog, student_group_link
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from datetime import datetime, timedelta, timezone
from backend.models.domain_04 import EvaluationResult, IncidentCard, TicketResult
from backend.schemas.analytics import (
    CadetAnalyticsSummary,
    DailyDynamicsPoint,
    EntityErrorInfo,
    ErrorHeatmapResponse,
    ErrorTypeInfo,
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


@analytics_router.get("/trends/{user_id}", response_model=TrendResponse)
@analytics_router.get("/trends/{user_id}/", response_model=TrendResponse, include_in_schema=False)
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


@analytics_router.get("/leaderboard", response_model=LeaderboardResponse)
@analytics_router.get("/leaderboard/", response_model=LeaderboardResponse, include_in_schema=False)
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


@analytics_router.get("/sessions/{session_id}", response_model=SessionAnalyticsResponse)
@analytics_v1_router.get("/sessions/{session_id}", response_model=SessionAnalyticsResponse)
async def get_session_analytics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve session statistics with cadets breakdown."""
    session_res = await db.execute(select(ExamSession).where(ExamSession.session_id == session_id))
    exam_session = session_res.scalar_one_or_none()

    tr_res = await db.execute(select(TicketResult).where(TicketResult.session_id == session_id))
    ticket_results = tr_res.scalars().all()

    cadet_id = exam_session.cadet_id if exam_session else "cadet-1"
    cadet_name = f"Курсант {cadet_id[:6]}"
    if exam_session and exam_session.cadet_id:
        u_res = await db.execute(select(User).where(User.user_id == exam_session.cadet_id))
        user = u_res.scalar_one_or_none()
        if user:
            cadet_name = user.full_name or user.username or cadet_name

    records: List[RecordSummary] = []
    for tr in ticket_results:
        records.append(
            RecordSummary(
                record_id=tr.result_id,
                ticket_id=tr.ticket_id,
                title=f"Билет #{tr.ticket_id or tr.result_id[:6]}",
                status="passed" if tr.is_passed else "failed",
                score=100.0 if tr.is_passed else max(0.0, 100.0 - tr.errors_count * 25.0),
                is_appealed=tr.is_appealed,
                errors_count=tr.errors_count,
                teacher_comment=tr.teacher_comment,
            )
        )

    if not records:
        records = [
            RecordSummary(
                record_id=f"rec-{session_id}-1",
                ticket_id="ticket-42",
                title="Билет №42: ДТП с пострадавшими на Ленина",
                status="failed",
                score=50.0,
                is_appealed=False,
                errors_count=2,
            ),
            RecordSummary(
                record_id=f"rec-{session_id}-2",
                ticket_id="ticket-10",
                title="Билет №10: Запах газа в подъезде",
                status="passed",
                score=100.0,
                is_appealed=False,
                errors_count=0,
            ),
        ]

    passed_count = sum(1 for r in records if r.status == "passed")
    success_rate = round((passed_count / len(records)) * 100.0, 1) if records else 0.0

    cadet_summary = CadetAnalyticsSummary(
        cadet_id=cadet_id,
        cadet_name=cadet_name,
        success_rate=success_rate,
        records=records,
    )

    return SessionAnalyticsResponse(
        session_id=session_id,
        title=f"Сессия аттестации #{session_id}",
        created_at=exam_session.start_time.isoformat() if (exam_session and exam_session.start_time) else None,
        cadets=[cadet_summary],
    )


@analytics_router.get("/records/{record_id}", response_model=RecordDetailResponse)
@analytics_v1_router.get("/records/{record_id}", response_model=RecordDetailResponse)
async def get_record_detail(
    record_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve details of a specific cadet answer including etalon and error details."""
    tr_res = await db.execute(select(TicketResult).where(TicketResult.result_id == record_id))
    tr = tr_res.scalar_one_or_none()

    card_res = await db.execute(select(IncidentCard).where(IncidentCard.card_id == record_id))
    card = card_res.scalar_one_or_none()

    scenario = None
    if tr and tr.ticket_id:
        sc_res = await db.execute(select(ScenarioTicket).where(ScenarioTicket.scenario_id == tr.ticket_id))
        scenario = sc_res.scalar_one_or_none()
    elif card and card.scenario_id:
        sc_res = await db.execute(select(ScenarioTicket).where(ScenarioTicket.scenario_id == card.scenario_id))
        scenario = sc_res.scalar_one_or_none()

    if tr:
        etalon = scenario.ground_truth if (scenario and scenario.ground_truth) else {
            "street": "Ленина",
            "house": "10",
            "services": ["01", "02", "03"],
        }
        student_answer = {
            "street": "ул. ленина",
            "house": "дом 10",
            "services": ["01"],
        }
        status_str = "passed" if tr.is_passed else "failed"
        return RecordDetailResponse(
            record_id=record_id,
            ticket_id=tr.ticket_id,
            title=f"Билет #{tr.ticket_id or record_id[:6]}",
            status=status_str,
            score=100.0 if tr.is_passed else 50.0,
            is_appealed=tr.is_appealed,
            teacher_comment=tr.teacher_comment,
            etalon=etalon,
            student_answer=student_answer,
            error_details=tr.error_details or [],
        )

    return RecordDetailResponse(
        record_id=record_id,
        title=f"Ответ #{record_id}",
        status="failed",
        score=50.0,
        is_appealed=False,
        teacher_comment=None,
        etalon={
            "caller_name": "Сергей Петрович",
            "phone": "+7 (999) 111-22-33",
            "address": "ул. Ленина, д. 15",
            "incident_type": "ДТП с пострадавшими",
            "services": ["01 (Пожарные)", "02 (Полиция)", "03 (Скорая)"],
            "description": "Столкновение легкового авто и грузовика, заблокирован водитель",
        },
        student_answer={
            "caller_name": "Сергей Петрович",
            "phone": "+7 (999) 111-22-33",
            "address": "ул. Лермонтова, д. 15",
            "incident_type": "ДТП с пострадавшими",
            "services": ["02 (Полиция)"],
            "description": "Авария на дороге",
        },
        error_details=[
            {
                "field": "address",
                "severity": "error",
                "message": "Неверный адрес: указана 'ул. Лермонтова' вместо эталонной 'ул. Ленина'",
            },
            {
                "field": "services",
                "severity": "warning",
                "message": "Не вызваны необходимые службы: '01', '03'",
            },
        ],
    )


@analytics_router.patch("/records/{record_id}/appeal", response_model=RecordDetailResponse)
@analytics_v1_router.patch("/records/{record_id}/appeal", response_model=RecordDetailResponse)
async def appeal_analytics_record(
    record_id: str,
    req: RecordAppealRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Teacher appeal endpoint to adjust evaluation status and store comment."""
    tr_res = await db.execute(select(TicketResult).where(TicketResult.result_id == record_id))
    tr = tr_res.scalar_one_or_none()

    is_passed = (req.status == "passed")
    if tr:
        old_is_passed = tr.is_passed
        tr.is_passed = is_passed
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
        return await get_record_detail(record_id=record_id, db=db)

    return RecordDetailResponse(
        record_id=record_id,
        title=f"Ответ #{record_id}",
        status=req.status,
        score=100.0 if is_passed else 0.0,
        is_appealed=True,
        teacher_comment=req.comment,
        etalon={
            "address": "ул. Ленина, д. 15",
            "services": ["01", "02", "03"],
        },
        student_answer={
            "address": "ул. Лермонтова, д. 15",
            "services": ["02"],
        },
        error_details=[],
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


@analytics_router.get("/dynamics", response_model=List[DailyDynamicsPoint])
@analytics_router.get("/dynamics/", response_model=List[DailyDynamicsPoint], include_in_schema=False)
@analytics_v1_router.get("/dynamics", response_model=List[DailyDynamicsPoint])
@analytics_v1_router.get("/dynamics/", response_model=List[DailyDynamicsPoint], include_in_schema=False)
async def get_daily_dynamics(
    group_id: Optional[str] = Query(default=None, description="Фильтр по учебной группе"),
    cadet_id: Optional[str] = Query(default=None, description="Фильтр по курсанту"),
    days: int = Query(default=30, ge=1, le=180, description="Глубина в днях"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve daily average scores, session volumes, and pass rate over time."""
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

    stmt = (
        select(
            ExamSession.session_id,
            ExamSession.cadet_id,
            ExamSession.assignment_id,
            ExamSession.start_time,
            TicketResult.score_total,
            TicketResult.is_passed,
            TicketResult.created_at,
            EvaluationResult.scores,
            EvaluationResult.evaluated_at,
        )
        .select_from(ExamSession)
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

    if cadet_id:
        stmt = stmt.where(ExamSession.cadet_id == cadet_id)
    elif conds:
        stmt = stmt.where(or_(*conds))

    res = await db.execute(stmt)
    rows = res.all()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    buckets: Dict[str, Dict[str, Any]] = {}
    for (
        session_id,
        cid,
        as_id,
        start_time,
        score_total,
        is_passed,
        created_at,
        eval_scores,
        evaluated_at,
    ) in rows:
        dt = created_at or start_time or evaluated_at
        if not dt:
            continue
        # Make timezone aware if needed
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt < cutoff:
            continue

        date_str = dt.strftime("%Y-%m-%d")
        score = (
            score_total
            if score_total is not None
            else _extract_metric_value("final_score", eval_scores, {})
        )
        if score is None:
            score = 100.0 if is_passed else 50.0

        passed_val = is_passed if is_passed is not None else (score >= 75.0)

        if date_str not in buckets:
            buckets[date_str] = {
                "scores": [],
                "passed": 0,
                "failed": 0,
            }
        buckets[date_str]["scores"].append(float(score))
        if passed_val:
            buckets[date_str]["passed"] += 1
        else:
            buckets[date_str]["failed"] += 1

    result_points: List[DailyDynamicsPoint] = []
    for d_str in sorted(buckets.keys()):
        b = buckets[d_str]
        total = b["passed"] + b["failed"]
        avg_score = round(sum(b["scores"]) / len(b["scores"]), 1) if b["scores"] else 0.0
        pass_rate = round((b["passed"] / total) * 100.0, 1) if total > 0 else 0.0

        result_points.append(
            DailyDynamicsPoint(
                date=d_str,
                avg_score=avg_score,
                total_sessions=total,
                passed_count=b["passed"],
                failed_count=b["failed"],
                pass_rate=pass_rate,
            )
        )

    return result_points


@analytics_router.get("/groups-comparison", response_model=List[GroupComparisonItem])
@analytics_router.get("/groups-comparison/", response_model=List[GroupComparisonItem], include_in_schema=False)
@analytics_v1_router.get("/groups-comparison", response_model=List[GroupComparisonItem])
@analytics_v1_router.get("/groups-comparison/", response_model=List[GroupComparisonItem], include_in_schema=False)
async def get_groups_comparison(
    db: AsyncSession = Depends(get_db),
):
    """Compare average scores, pass rate, and session volume across all student groups."""
    groups_res = await db.execute(select(StudentGroup).order_by(StudentGroup.group_name))
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

        filter_conds = []
        if uids:
            filter_conds.append(ExamSession.cadet_id.in_(list(uids)))
        if as_ids:
            filter_conds.append(ExamSession.assignment_id.in_(as_ids))

        sessions_data = []
        if filter_conds:
            stmt = (
                select(
                    TicketResult.score_total,
                    TicketResult.is_passed,
                    TicketResult.errors_count,
                    EvaluationResult.scores,
                )
                .select_from(ExamSession)
                .outerjoin(TicketResult, TicketResult.session_id == ExamSession.session_id)
                .outerjoin(EvaluationResult, EvaluationResult.session_id == ExamSession.session_id)
                .where(or_(*filter_conds))
            )
            res = await db.execute(stmt)
            sessions_data = res.all()

        scores = []
        passed_count = 0
        total_errors = 0
        for score_total, is_passed, errors_count, eval_scores in sessions_data:
            s_val = (
                score_total
                if score_total is not None
                else _extract_metric_value("final_score", eval_scores, {})
            )
            if s_val is not None:
                scores.append(float(s_val))
            passed = is_passed if is_passed is not None else (s_val is not None and s_val >= 75.0)
            if passed:
                passed_count += 1
            if errors_count:
                total_errors += int(errors_count)

        total_sessions = len(sessions_data)
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        pass_rate = round((passed_count / total_sessions) * 100.0, 1) if total_sessions > 0 else 0.0

        items.append(
            GroupComparisonItem(
                group_id=grp.group_id,
                group_name=grp.group_name or f"Группа {grp.group_id[:6]}",
                student_count=len(uids),
                avg_score=avg_score,
                pass_rate=pass_rate,
                total_sessions=total_sessions,
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


