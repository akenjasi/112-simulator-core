"""DDS Lesson Report Data Collection Service.

Collects verified and trustworthy historical data for completed DISPATCHER_DDS lessons
to be consumed by neural reporting services.

Rules:
- Strictly scoped to the chosen completed lesson (Assignment.assignment_id).
- Only completed exam sessions (ExamSession.status == 'COMPLETED', case-insensitive).
- All EvaluationResult, TicketResult, IncidentCard queries restricted strictly to chosen session IDs.
- Historical student participants only (actual session cadets), not current group roster.
- No applicant personal data included in IncidentCard output.
- Deterministic sorting by IDs / start times.
- Read-only: no database mutations, no LLM invocations.
"""

from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class DDSReportEvaluationItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    evaluation_id: str
    card_id: str
    scores: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    grammar: Dict[str, Any] = Field(default_factory=dict)
    errors_list: List[Any] = Field(default_factory=list)


class DDSReportTicketResultItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    result_id: str
    ticket_id: Optional[str] = None
    is_passed: bool
    status: Optional[str] = None
    score_total: Optional[float] = None
    errors_count: int = 0
    error_details: Dict[str, Any] = Field(default_factory=dict)


class DDSReportCardItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    card_id: str
    status: str
    assigned_services: Dict[str, Any] = Field(default_factory=dict)


class DDSReportSessionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: str
    cadet_id: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    time_limit_seconds: Optional[int] = None
    exercise_status: Optional[str] = None
    total_cards: Optional[int] = None
    completed_cards: Optional[int] = None
    exercise_protocols: List[Dict[str, Any]] = Field(default_factory=list)
    evaluations: List[DDSReportEvaluationItem] = Field(default_factory=list)
    ticket_results: List[DDSReportTicketResultItem] = Field(default_factory=list)
    cards: List[DDSReportCardItem] = Field(default_factory=list)


class DDSReportStudentItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cadet_id: str
    full_name: Optional[str] = None
    session_ids: List[str] = Field(default_factory=list)


class DDSReportSummary(BaseModel):
    student_count: int = 0
    completed_session_count: int = 0
    evaluation_count: int = 0
    ticket_result_count: int = 0
    incident_card_count: int = 0


class DDSLessonReportDataResponse(BaseModel):
    lesson_id: str
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    status: str
    summary: DDSReportSummary
    students: List[DDSReportStudentItem] = Field(default_factory=list)
    sessions: List[DDSReportSessionItem] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


# ─── Helper Functions ────────────────────────────────────────────────────────

def _format_datetime(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


# ─── Service ──────────────────────────────────────────────────────────────────

async def collect_lesson_report_data(
    db: AsyncSession,
    lesson_id: str,
    lesson: Optional[Assignment] = None,
) -> Dict[str, Any]:
    """Collect verified, JSON-compatible report data for a completed DDS lesson.

    Returns dict matching DDSLessonReportDataResponse schema.
    """
    if lesson is None:
        stmt = select(Assignment).where(Assignment.assignment_id == lesson_id)
        res = await db.execute(stmt)
        lesson = res.scalar_one_or_none()
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Lesson '{lesson_id}' not found.",
            )

    # Validate lesson status and target_role (case-insensitive)
    status_str = (lesson.status or "").strip().upper()
    target_role_str = (lesson.target_role or "").strip().upper()
    if status_str != "COMPLETED" or target_role_str != "DISPATCHER_DDS":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lesson is not completed or target role is not DISPATCHER_DDS.",
        )

    # 1. Group info
    group_name: Optional[str] = None
    if lesson.group_id:
        stmt_grp = select(StudentGroup.group_name).where(StudentGroup.group_id == lesson.group_id)
        res_grp = await db.execute(stmt_grp)
        group_name = res_grp.scalar_one_or_none()

    # 2. Query completed ExamSessions for this lesson
    stmt_sessions = (
        select(ExamSession)
        .where(
            ExamSession.assignment_id == lesson_id,
            func.upper(func.trim(ExamSession.status)) == "COMPLETED",
        )
        .order_by(ExamSession.start_time.asc(), ExamSession.session_id.asc())
    )
    res_sessions = await db.execute(stmt_sessions)
    completed_sessions = list(res_sessions.scalars().all())

    # Deterministic sort
    completed_sessions.sort(
        key=lambda s: (_format_datetime(s.start_time) or "", s.session_id or "")
    )

    session_ids = [s.session_id for s in completed_sessions if s.session_id]

    # If no completed sessions exist
    if not session_ids:
        warnings = ["В занятии отсутствуют завершенные сессии."]
        if lesson.group_id and group_name is None:
            warnings.append(f"Группа '{lesson.group_id}' не найдена в базе данных.")

        return {
            "lesson_id": lesson.assignment_id,
            "group_id": lesson.group_id,
            "group_name": group_name,
            "status": lesson.status,
            "summary": {
                "student_count": 0,
                "completed_session_count": 0,
                "evaluation_count": 0,
                "ticket_result_count": 0,
                "incident_card_count": 0,
            },
            "students": [],
            "sessions": [],
            "warnings": warnings,
        }

    # 3. Query historical student participants
    cadet_session_ids: Dict[str, List[str]] = {}
    for s in completed_sessions:
        if s.cadet_id:
            if s.cadet_id not in cadet_session_ids:
                cadet_session_ids[s.cadet_id] = []
            if s.session_id not in cadet_session_ids[s.cadet_id]:
                cadet_session_ids[s.cadet_id].append(s.session_id)

    unique_cadet_ids = sorted(cadet_session_ids.keys())
    cadet_users: Dict[str, Optional[User]] = {}
    if unique_cadet_ids:
        stmt_cadets = select(User).where(User.user_id.in_(unique_cadet_ids))
        res_cadets = await db.execute(stmt_cadets)
        for u in res_cadets.scalars().all():
            cadet_users[u.user_id] = u

    students: List[Dict[str, Any]] = []
    for c_id in unique_cadet_ids:
        user_obj = cadet_users.get(c_id)
        students.append({
            "cadet_id": c_id,
            "full_name": user_obj.full_name if user_obj else None,
            "session_ids": sorted(cadet_session_ids[c_id]),
        })
    students.sort(key=lambda x: x["cadet_id"])

    # 4. Query IncidentCards (strictly by session_id, excluding personal caller data)
    stmt_cards = (
        select(IncidentCard)
        .where(IncidentCard.session_id.in_(session_ids))
        .order_by(IncidentCard.card_id.asc())
    )
    res_cards = await db.execute(stmt_cards)
    all_cards = list(res_cards.scalars().all())

    cards_by_session: Dict[str, List[Dict[str, Any]]] = {s_id: [] for s_id in session_ids}
    for card in all_cards:
        if card.session_id in cards_by_session:
            cards_by_session[card.session_id].append({
                "card_id": card.card_id,
                "status": card.status,
                "assigned_services": card.assigned_services or {},
            })
    for s_id in cards_by_session:
        cards_by_session[s_id].sort(key=lambda c: c["card_id"])

    # 5. Query EvaluationResults (strictly by session_id)
    stmt_evals = (
        select(EvaluationResult)
        .where(EvaluationResult.session_id.in_(session_ids))
        .order_by(EvaluationResult.evaluation_id.asc())
    )
    res_evals = await db.execute(stmt_evals)
    all_evals = list(res_evals.scalars().all())

    evals_by_session: Dict[str, List[Dict[str, Any]]] = {s_id: [] for s_id in session_ids}
    for ev in all_evals:
        if ev.session_id in evals_by_session:
            evals_by_session[ev.session_id].append({
                "evaluation_id": ev.evaluation_id,
                "card_id": ev.card_id,
                "scores": ev.scores or {},
                "metrics": ev.metrics or {},
                "grammar": ev.grammar or {},
                "errors_list": ev.errors_list or [],
            })
    for s_id in evals_by_session:
        evals_by_session[s_id].sort(key=lambda e: e["evaluation_id"])

    # 6. Query TicketResults (strictly by session_id)
    stmt_tickets = (
        select(TicketResult)
        .where(TicketResult.session_id.in_(session_ids))
        .order_by(TicketResult.result_id.asc())
    )
    res_tickets = await db.execute(stmt_tickets)
    all_tickets = list(res_tickets.scalars().all())

    tickets_by_session: Dict[str, List[Dict[str, Any]]] = {s_id: [] for s_id in session_ids}
    for tr in all_tickets:
        if tr.session_id in tickets_by_session:
            tickets_by_session[tr.session_id].append({
                "result_id": tr.result_id,
                "ticket_id": tr.ticket_id,
                "is_passed": tr.is_passed,
                "status": tr.status,
                "score_total": tr.score_total,
                "errors_count": tr.errors_count,
                "error_details": tr.error_details or {},
            })
    for s_id in tickets_by_session:
        tickets_by_session[s_id].sort(key=lambda t: t["result_id"])

    # 7. Construct sessions list
    sessions_list: List[Dict[str, Any]] = []
    for s in completed_sessions:
        sessions_list.append({
            "session_id": s.session_id,
            "cadet_id": s.cadet_id,
            "start_time": _format_datetime(s.start_time),
            "end_time": _format_datetime(s.end_time),
            "time_limit_seconds": s.time_limit_seconds,
            "exercise_status": ("completed" if s.dynamic_state["dds"].get("submitted_at") else "incomplete") if (s.dynamic_state or {}).get("dds", {}).get("version") == 2 else None,
            "total_cards": len(s.dynamic_state["dds"]["queue"]) if (s.dynamic_state or {}).get("dds", {}).get("version") == 2 else None,
            "completed_cards": len(s.dynamic_state["dds"]["completed_cards"]) if (s.dynamic_state or {}).get("dds", {}).get("version") == 2 else None,
            "exercise_protocols": _exercise_protocols((s.dynamic_state or {}).get("dds", {})),
            "evaluations": evals_by_session.get(s.session_id, []),
            "ticket_results": tickets_by_session.get(s.session_id, []),
            "cards": cards_by_session.get(s.session_id, []),
        })

    # 8. Summary counts
    summary = {
        "student_count": len(students),
        "completed_session_count": len(completed_sessions),
        "evaluation_count": len(all_evals),
        "ticket_result_count": len(all_tickets),
        "incident_card_count": len(all_cards),
    }

    # 9. Warnings list
    warnings: List[str] = []
    if len(all_evals) == 0:
        warnings.append("Числовые оценки отсутствуют; доступны протоколы критериев ДДС." if any(s["exercise_protocols"] for s in sessions_list) else "Отсутствуют результаты оценивания (evaluations) для выбранных сессий.")
    if len(all_tickets) == 0:
        warnings.append("Отсутствуют результаты билетов (ticket_results) для выбранных сессий.")
    if len(all_cards) == 0:
        warnings.append("Отсутствуют карточки происшествий (cards) для выбранных сессий.")

    for s in completed_sessions:
        s_id = s.session_id
        if not s.cadet_id:
            warnings.append(f"Сессия {s_id} не привязана к курсанту.")
        if len(all_evals) > 0 and len(evals_by_session.get(s_id, [])) == 0:
            warnings.append(f"Для сессии {s_id} отсутствуют результаты оценивания.")
        if len(all_tickets) > 0 and len(tickets_by_session.get(s_id, [])) == 0:
            warnings.append(f"Для сессии {s_id} отсутствуют результаты билетов.")
        if len(all_cards) > 0 and len(cards_by_session.get(s_id, [])) == 0:
            warnings.append(f"Для сессии {s_id} отсутствуют карточки происшествий.")

    for st in students:
        if st["full_name"] is None:
            warnings.append(f"Для курсанта {st['cadet_id']} отсутствуют данные профиля (full_name).")

    if lesson.group_id and group_name is None:
        warnings.append(f"Группа '{lesson.group_id}' не найдена в базе данных.")

    return {
        "lesson_id": lesson.assignment_id,
        "group_id": lesson.group_id,
        "group_name": group_name,
        "status": lesson.status,
        "summary": summary,
        "students": students,
        "sessions": sessions_list,
        "warnings": warnings,
    }


def _exercise_protocols(data):
    """Compact evidence avoids duplicating complete actions in criteria and events."""
    from backend.core.dds_exercise import criteria
    items = list(data.get("completed_cards", []))
    if not any(item.get("card_id") == data.get("card_id") for item in items):
        items.append(data)
    result = []
    for item in items:
        if not item.get("exercise"):
            continue
        checks = deepcopy(item.get("criteria") or criteria(item, closed=True))
        for check in checks:
            if check["key"] != "confirmation":
                check["evidence"] = [{"event_id": e["id"], "reason": e["reason"]} for e in check["evidence"]]
        events = []
        for e in item["exercise"]["events"]:
            if e["kind"] not in ("mistake", "answered", "report_processed"):
                continue
            entry = {key: e[key] for key in ("id", "kind", "at", "service_name", "report_id", "text", "reason", "message", "delay_seconds") if key in e}
            if "action" in e:
                entry["action"] = {key: e["action"][key] for key in ("kind", "status", "service_name", "comment", "order_number", "who_accepted", "summary", "operation", "number") if key in e["action"]}
            events.append(entry)
        actions = [{key: a[key] for key in ("request_id", "kind", "service_name", "at", "status", "comment", "order_number", "who_accepted", "summary") if key in a} for a in item.get("actions", [])]
        result.append({"card_id": item.get("card_id"), "criteria": checks, "events": events, "actions": actions})
    return result
