"""Router for Aggregated Analytics API.

Provides endpoints for heatmaps, progress trends, and group leaderboards.
"""

import logging
from typing import Any, Dict, List, Optional, Set
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.analytics_engine import build_error_heatmap, calculate_trends
from backend.database import get_db
from backend.models.domain_01 import StudentGroup, User
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, IncidentCard
from backend.schemas.analytics import (
    HeatmapResponse,
    LeaderboardItem,
    LeaderboardResponse,
    TrendPoint,
    TrendResponse,
)

logger = logging.getLogger(__name__)

analytics_router = APIRouter(prefix="/api/analytics", tags=["Analytics"])
router = analytics_router


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
