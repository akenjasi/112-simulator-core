"""Core domain logic for DDS Lesson Cycle (A-06).

Handles:
- Incoming card sanitization (immutable snapshot, stripped of etalons/ground truth)
- Database locking & concurrency serialization via Assignment status update
- Atomic idempotency for actions and finish
- Score retrieval strictly from saved evaluations without synthetic rubrics
- Strict protection against operator session mutations and cross-boundary leaks
"""

import math
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult
from backend.schemas.dds_cycle import DispatcherData, DDSActionPayload
from backend.schemas.lessons import CadetLessonStats, CadetTicketDetail
from backend.core.dds_service_policy import action_error, allowed_statuses, current_service_statuses, context as policy_context
from backend.core.dds_queue import archived_cards, card_progress, completion_blockers, has_dispatch, queue_ticket_details


# Source operator from the teaching manual, not the cadet processing the DDS card.
TEACHING_SOURCE_OPERATOR = "Опер. 14, АРМ 7, Рожкова О. И."


def sanitize_incoming_card(content: Any) -> Dict[str, Any]:
    """Extract and strictly validate content.incoming_card against DispatcherData.

    Strips any extra keys, ground_truth, hidden secrets, or client-provided facts.
    """
    if not isinstance(content, dict):
        raise ValueError("Ticket content must be a dictionary")

    raw_card = content.get("incoming_card") if "incoming_card" in content else content
    if not raw_card or not isinstance(raw_card, dict):
        raise ValueError("Ticket content must contain 'incoming_card' dictionary")

    validated = DispatcherData.model_validate(raw_card)
    return validated.model_dump(by_alias=True)


def build_incoming_card(
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    plot: Optional[str] = None,
    ground_truth: Optional[Dict[str, Any]] = None,
    etalon_services: Optional[List[Any]] = None,
    seq: Optional[Any] = None,
    now: Optional[datetime] = None,
    caller_role: str = "очевидец",
) -> Dict[str, Any]:
    """Construct a full incoming_card passing strict DispatcherData validation.

    Requirements:
    - connection = "Установлено"
    - phones = {"aon": phone, "provided": phone, "onSite": ""}
    - incident contains the training number, source save time, and teaching source operator.
    - caller = {"name": fio, "role": caller_role, "address": address}
    - description = plot (non-empty!)
    - statuses = {"injured": "нет", "ambulanceRefusal": "нет", "blocked": "нет"}
    - emergency = {"cs": False, "cp": False}
    - classification = {"section": category, "title": subcategory, "class": subcategory, "visClass": ""}
    - services = non-empty list of services from etalon_services / ground_truth / default.
    """
    gt = ground_truth if isinstance(ground_truth, dict) else {}
    now_dt = now or datetime.now(timezone.utc)
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)
    source_time = now_dt.astimezone(ZoneInfo("Europe/Moscow"))
    now_str = source_time.isoformat(timespec="seconds")
    now_time = source_time.strftime("%H:%M")

    seq_str = str(seq).strip() if seq is not None and str(seq).strip() else "001"
    incident_number = f"A{seq_str}-112"

    # Missing source data stays unknown; a shared fallback phone would make
    # unrelated incidents appear to come from the same caller.
    phone = str(gt.get("phone") or "").strip()
    fio = str(gt.get("fio") or "").strip()

    if gt.get("address"):
        address = str(gt["address"]).strip()
    else:
        addr_parts = []
        street = gt.get("street")
        if street and str(street).strip().lower() not in ("none", "null", ""):
            st = str(street).strip()
            if not any(st.lower().startswith(p) for p in ["ул", "пер", "пр", "ш", "б-р"]):
                addr_parts.append(f"ул. {st}")
            else:
                addr_parts.append(st)
        house = gt.get("house")
        if house and str(house).strip().lower() not in ("none", "null", ""):
            hs = str(house).strip()
            if not hs.lower().startswith("д"):
                addr_parts.append(f"д. {hs}")
            else:
                addr_parts.append(hs)
        apartment = gt.get("apartment")
        if apartment and str(apartment).strip().lower() not in ("none", "null", ""):
            ap = str(apartment).strip()
            if not ap.lower().startswith("кв"):
                addr_parts.append(f"кв. {ap}")
            else:
                addr_parts.append(ap)
        address = ", ".join(addr_parts)

    desc = (plot or "").strip()
    if not desc:
        raise ValueError("description/plot cannot be empty for DispatcherData")

    injured = str(gt.get("injured") or "нет").strip()
    ambulance_refusal = str(gt.get("ambulanceRefusal") or "нет").strip()
    blocked = str(gt.get("blocked") or "нет").strip()

    cat_name = (category or "").strip() or "Общее"
    subcat_name = (subcategory or "").strip() or cat_name

    raw_services = etalon_services or gt.get("services") or gt.get("etalon_services") or []
    names = []
    for s in raw_services:
        if isinstance(s, dict):
            s_name = str(s.get("name") or "").strip()
        else:
            s_name = str(s).strip()
        if s_name and s_name not in names:
            names.append(s_name)

    if not names:
        lower_cat = cat_name.lower()
        if "пожар" in lower_cat:
            names.append("01 Пожарные")
        elif "газ" in lower_cat:
            names.append("04 Газ")
        elif "медиц" in lower_cat or "скор" in lower_cat:
            names.append("03 Скорая")
        elif "дтп" in lower_cat:
            names.extend(["01 Пожарные", "02 Полиция", "03 Скорая"])
        elif "прав" in lower_cat:
            names.append("02 Полиция")
        else:
            names.append("01 Пожарные")

    unique_names = []
    for n in names:
        if n not in unique_names:
            unique_names.append(n)

    services_list = [
        {
            "id": f"srv-{idx + 1}",
            "name": n,
            "time": now_time,
            "status": "Получена службой",
            "isRejected": False,
            "history": [],
        }
        for idx, n in enumerate(unique_names)
    ]

    card_dict = {
        "connection": "Установлено",
        "phones": {"aon": phone, "provided": phone, "onSite": ""},
        "incident": {"number": incident_number, "savedAt": now_str, "operator": TEACHING_SOURCE_OPERATOR},
        "caller": {"name": fio, "role": caller_role or "очевидец", "address": address},
        "description": desc,
        "statuses": {"injured": injured, "ambulanceRefusal": ambulance_refusal, "blocked": blocked},
        "emergency": {"cs": False, "cp": False},
        "classification": {
            "section": cat_name,
            "title": subcat_name,
            "class": subcat_name,
            "visClass": "",
        },
        "services": services_list,
    }

    validated = DispatcherData.model_validate(card_dict)
    return validated.model_dump(by_alias=True)


def incoming_card_from_ticket(ticket: ScenarioTicket) -> Dict[str, Any]:
    """Read prepared DDS cards or explicitly map the stored legacy ticket format.

    A malformed structured card must fail validation, never fall back to an etalon.
    Only incoming facts and the designated service list are copied for the DDS role.
    """
    if ticket.content not in ({}, None):
        return sanitize_incoming_card(ticket.content)
    settings = ticket.settings or {}
    facts = ticket.ground_truth or {}
    names = settings.get("etalon_services")
    if not isinstance(names, list) or not names or not all(isinstance(name, str) and name.strip() for name in names):
        raise ValueError("Stored ticket has no valid service list")
    return sanitize_incoming_card({
        "description": settings.get("plot", ""),
        "phones": {"aon": facts.get("phone") or ""},
        "incident": {"number": ticket.scenario_id, "operator": "112"},
        "caller": {"name": facts.get("fio") or "", "role": facts.get("caller_status") or "",
                   "address": ", ".join(str(facts[key]) for key in ("street", "house") if facts.get(key))},
        "statuses": {key: facts.get(key) or "неизвестно" for key in ("injured", "ambulanceRefusal", "blocked")},
        "classification": {"section": ticket.category or settings.get("category") or "",
                           "title": settings.get("subcategory") or "", "class": settings.get("class") or "",
                           "visClass": settings.get("visClass") or ""},
        "services": [{"id": str(index), "name": name.strip(), "status": "Получена службой"}
                     for index, name in enumerate(names)],
    })


def is_suitable_dds_ticket(ticket: Optional[ScenarioTicket]) -> bool:
    """Check if ticket is suitable for DDS lesson assignment."""
    if not ticket or getattr(ticket, "is_deleted", False):
        return False
    try:
        incoming_card_from_ticket(ticket)
        return True
    except Exception:
        return False


def extract_dds_ticket_metadata(ticket: ScenarioTicket) -> tuple[str, str, int, str]:
    """Extract (category, subcategory, complexity, display_title) from a DDS suitable ScenarioTicket."""
    settings = getattr(ticket, "settings", None) or {}
    content = getattr(ticket, "content", None) or {}
    card = content.get("incoming_card") if isinstance(content, dict) and "incoming_card" in content else content
    if not isinstance(card, dict):
        card = {}
    clf = card.get("classification") or {}
    if not isinstance(clf, dict):
        clf = {}

    cat = (
        getattr(ticket, "category", None)
        or settings.get("category")
        or clf.get("section")
        or (content.get("category") if isinstance(content, dict) else None)
        or "Общее"
    )

    subcat = (
        settings.get("subcategory")
        or clf.get("title")
        or clf.get("class")
        or (content.get("subcategory") if isinstance(content, dict) else None)
        or ""
    )

    comp = (
        settings.get("complexity")
        or getattr(ticket, "complexity", None)
        or (content.get("complexity") if isinstance(content, dict) else None)
        or 1
    )
    try:
        comp_int = int(comp)
    except (ValueError, TypeError):
        comp_int = 1

    title = getattr(ticket, "title", None) or settings.get("title")
    if not title or not str(title).strip():
        if subcat and cat != "Общее":
            title = f"{cat} — {subcat}"
        elif cat and cat != "Общее":
            title = str(cat)
        elif card.get("description"):
            desc = str(card.get("description")).strip()
            title = desc[:60] + "..." if len(desc) > 60 else desc
        else:
            title = f"Билет #{ticket.scenario_id[:8]}"

    return str(cat).strip(), str(subcat).strip(), comp_int, str(title).strip()


def matches_dds_ticket_filters(
    ticket: ScenarioTicket,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    complexity: Optional[int] = None,
) -> bool:
    """Check if a suitable DDS ticket matches category, subcategory and complexity filters."""
    cat, subcat, comp, _ = extract_dds_ticket_metadata(ticket)

    # Complexity filter: None means adaptive / any level
    if complexity is not None:
        if comp != complexity:
            return False

    # Compare canonical metadata, never substrings: an absent value cannot
    # match an arbitrary requested classification.
    if category and category.strip().casefold() != cat.casefold():
        return False
    if subcategory and subcategory.strip().casefold() != subcat.casefold():
        return False

    return True


def _resolve_session_grade(evals, trs):
    """Extract actual finite score (0..100) from saved EvaluationResult or TicketResult.

    Deterministic selection by evaluation/result timestamps/IDs.
    Preserves 0.0 as a valid score; returns None only if un-evaluated.
    Does not infer or synthesize a rubric. Does not treat bool or NaN as valid.
    """
    from backend.core.gradebook_records import latest_evaluation, resolve_attempt_score_and_status

    def result_order(result):
        stamp = result.updated_at or result.created_at or datetime.min.replace(tzinfo=timezone.utc)
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return bool(result.is_appealed), stamp, result.result_id or ""

    result = max(trs, key=result_order, default=None)
    return resolve_attempt_score_and_status(None, result, latest_evaluation(evals))


def get_session_score(evals: List[EvaluationResult], trs: List[TicketResult]) -> Optional[float]:
    return _resolve_session_grade(evals, trs)[0]


def _card_started_at(session: ExamSession, data: Dict[str, Any]) -> Optional[datetime]:
    if data.get("version") == 2 and isinstance(data.get("received_at"), str):
        try:
            return datetime.fromisoformat(data["received_at"])
        except ValueError:
            pass
    return session.start_time


async def lock_assignment(db: AsyncSession, assignment_id: str) -> None:
    """Acquire DB row-level lock on the assignment across PostgreSQL and SQLite."""
    await db.execute(
        text("UPDATE assignments SET status = status WHERE assignment_id = :aid"),
        {"aid": assignment_id},
    )


def build_session_state_dict(
    session: ExamSession,
    lesson: Assignment,
    card: Optional[IncidentCard],
    evals: List[EvaluationResult],
    trs: List[TicketResult],
) -> Dict[str, Any]:
    """Construct the standardized state dictionary for DDS assignments/sessions."""
    dds_data = (session.dynamic_state or {}).get("dds", {}) if isinstance(session.dynamic_state, dict) else {}

    incoming_card = dds_data.get("scenario_snapshot") or dds_data.get("incoming_card")
    if not incoming_card and card:
        incoming_card = card.filled_data or {}
    if not incoming_card:
        incoming_card = {}

    card_id = (card.card_id if card else None) or dds_data.get("card_id")
    actions = dds_data.get("actions", [])
    submitted_at = dds_data.get("submitted_at")
    score = get_session_score(evals, trs)
    service_statuses = current_service_statuses(incoming_card, (card.assigned_services or {}) if card else {}, actions)
    blockers = completion_blockers(dds_data, (card.assigned_services or {}) if card else {})
    progress = card_progress(dds_data)

    # Time calculations
    start_dt = _card_started_at(session, dds_data)
    if start_dt is not None and start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)

    end_dt = None
    if submitted_at:
        if isinstance(submitted_at, str):
            try:
                end_dt = datetime.fromisoformat(submitted_at)
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=timezone.utc)
            except Exception:
                end_dt = None
        elif isinstance(submitted_at, datetime):
            end_dt = submitted_at if submitted_at.tzinfo else submitted_at.replace(tzinfo=timezone.utc)

    if end_dt is None:
        if session.end_time:
            end_dt = session.end_time if session.end_time.tzinfo else session.end_time.replace(tzinfo=timezone.utc)
        else:
            end_dt = datetime.now(timezone.utc)

    if start_dt is not None:
        elapsed_seconds = max(0, int((end_dt - start_dt).total_seconds()))
    else:
        elapsed_seconds = 0

    limit = (
        session.time_limit_seconds
        if (session.time_limit_seconds and session.time_limit_seconds > 0)
        else (
            lesson.time_limit_seconds
            if (lesson and lesson.time_limit_seconds and lesson.time_limit_seconds > 0)
            else 30
        )
    )
    time_limit_seconds = limit
    time_remaining_seconds = max(0, time_limit_seconds - elapsed_seconds)
    is_expired = bool(dds_data.get("timed_out") or elapsed_seconds > time_limit_seconds)
    start_time_iso = start_dt.isoformat() if start_dt is not None else None
    error_limit = session.error_limit if session.error_limit is not None else (lesson.error_limit if lesson else None)

    is_exam = bool(lesson and (lesson.mode or "").upper() == "EXAM")
    is_exam_timeout = is_exam and (is_expired or dds_data.get("stop_reason") == "exam_timeout")
    editable = (
        session.status == "ACTIVE"
        and lesson.status == "ACTIVE"
        and submitted_at is None
        and not is_exam_timeout
    )
    effective_session_status = "COMPLETED" if (session.status == "COMPLETED" or is_exam_timeout) else session.status
    effective_stop_reason = dds_data.get("stop_reason") or ("exam_timeout" if is_exam_timeout else None)

    history = [{"card_id": item["card_id"], "ticket_id": item["ticket_id"],
                "submitted_at": item.get("card_submitted_at"), "status": "completed"}
               for item in archived_cards(dds_data)]
    if not any(item["card_id"] == card_id for item in history):
        history.append({"card_id": card_id, "ticket_id": session.ticket_id or lesson.scenario_id,
                        "submitted_at": dds_data.get("card_submitted_at"),
                        "status": "completed" if submitted_at else "active" if editable else "incomplete"})
    if dds_data.get("version") == 2:
        score = get_session_score([ev for ev in evals if ev.card_id == card_id],
                                  [tr for tr in trs if tr.ticket_id == session.ticket_id])

    from backend.core.dds_exercise import projection
    training = projection(dds_data, editable)
    from backend.core.report_demo import demo_enabled
    return {
        **training,
        "report_mode": "demo" if demo_enabled() else "queued",
        "session_id": session.session_id,
        "lesson_id": lesson.assignment_id,
        "ticket_id": session.ticket_id or lesson.scenario_id,
        "card_id": card_id,
        "session_status": effective_session_status,
        "lesson_status": lesson.status,
        "started_at": (
            (session.start_time.replace(tzinfo=timezone.utc) if session.start_time.tzinfo is None else session.start_time).isoformat()
            if session.start_time else None
        ),
        "incoming_card": incoming_card,
        "actions": actions,
        "allowed_service_statuses": {
            name: allowed_statuses(current, **policy_context(dds_data, name)) if editable else [] for name, current in service_statuses.items()
        },
        "submitted_at": submitted_at,
        "score": score,
        "time_limit_seconds": time_limit_seconds,
        "time_remaining_seconds": time_remaining_seconds,
        "is_expired": is_expired,
        "start_time": start_time_iso,
        "error_limit": error_limit,
        **progress,
        "received_at": dds_data.get("received_at") or (
            (session.start_time.replace(tzinfo=timezone.utc) if session.start_time.tzinfo is None else session.start_time).isoformat()
            if session.start_time else None),
        "card_submitted_at": dds_data.get("card_submitted_at") or submitted_at,
        "can_complete": editable and not blockers,
        "completion_blockers": blockers if editable else [],
        "cards": history,
        "readonly": not editable,
        "stopped_at": dds_data.get("stopped_at"),
        "stop_reason": effective_stop_reason,
        "card_pool_source": lesson.card_pool_source if lesson else None,
        "is_self_training": bool(lesson and lesson.card_pool_source == "self_training"),
    }


def _validate_session_is_assigned_dds(
    session: ExamSession,
    lesson: Assignment,
) -> None:
    """Enforce strict isolation: DDS cycle API operates only on assigned DDS sessions."""
    if (
        lesson.target_role != "DISPATCHER_DDS"
        or session.session_type != "CARD_ACTIONS"
        or not (session.dynamic_state or {}).get("dds")
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is not an assigned DISPATCHER_DDS session with a valid DDS snapshot",
        )


async def apply_dds_action(
    session_id: str,
    payload: DDSActionPayload,
    current_user: User,
    db: AsyncSession,
) -> Dict[str, Any]:
    """Execute an action on a cadet's assigned DDS session with concurrency lock."""
    # 1. Fetch ExamSession
    stmt_s = select(ExamSession).where(ExamSession.session_id == session_id)
    session = (await db.execute(stmt_s)).scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ExamSession '{session_id}' not found",
        )

    # 2. Authorization check before DB mutation
    if current_user.role != "ADMIN":
        if current_user.role != "CADET" or session.cadet_id != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CADET can only mutate their own assigned session; teachers cannot post actions for students",
            )

    if not session.assignment_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is not linked to an assignment",
        )

    # 3. Transaction serialization: acquire row lock on Assignment
    await lock_assignment(db, session.assignment_id)

    # Re-fetch lesson and session fresh under lock
    stmt_l = (
        select(Assignment)
        .where(Assignment.assignment_id == session.assignment_id)
        .execution_options(populate_existing=True)
    )
    lesson = (await db.execute(stmt_l)).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    _validate_session_is_assigned_dds(session, lesson)

    stmt_s_fresh = (
        select(ExamSession)
        .where(ExamSession.session_id == session_id)
        .execution_options(populate_existing=True)
    )
    session = (await db.execute(stmt_s_fresh)).scalar_one_or_none()

    dds_data = deepcopy((session.dynamic_state or {}).get("dds", {}))
    existing_actions = dds_data.get("actions", [])
    if dds_data.get("version") == 2 and len(dds_data["queue"]) > 1 and not payload.card_id:
        raise HTTPException(409, detail={"code": "DDS_CARD_ID_REQUIRED"})
    target_card = payload.card_id or dds_data.get("card_id")

    if dds_data.get("exercise") or any(item.get("exercise") for item in archived_cards(dds_data)):
        from backend.core.dds_phone import saved_request, attempt_result
        wire = payload.model_dump(exclude_none=True)
        saved = saved_request(dds_data, wire)
        if saved:
            result = await get_dds_session_state(session_id, current_user, db)
            result["last_attempt"] = attempt_result(saved)
            return result

    # 4. Check for idempotent retry or request_id conflict
    all_actions = [(dds_data.get("card_id"), a) for a in existing_actions]
    all_actions.extend((item["card_id"], action) for item in archived_cards(dds_data)
                       for action in item["actions"])
    existing_pair = next(((cid, a) for cid, a in all_actions if a.get("request_id") == payload.request_id), None)
    existing = existing_pair[1] if existing_pair else None
    if existing:
        m_kind = (existing.get("kind") == payload.kind)
        m_svc = (existing.get("service_name") == payload.service_name)
        m_st = (existing.get("status") == payload.status)
        m_cm = (existing.get("comment") == payload.comment)
        # New status actions persist a trimmed number; retries must compare the
        # same normalized value while retaining legacy null-number replays.
        m_ord = ((existing.get("order_number") or "").strip() == (payload.order_number or "").strip())
        m_who = (existing.get("who_accepted") == payload.who_accepted)
        m_sum = (existing.get("summary") == payload.summary)
        if existing_pair[0] == target_card and m_kind and m_svc and m_st and m_cm and m_ord and m_who and m_sum:
            card = await db.get(IncidentCard, dds_data.get("card_id"))
            evals = (await db.scalars(select(EvaluationResult).where(EvaluationResult.session_id == session.session_id))).all()
            trs = (await db.scalars(select(TicketResult).where(TicketResult.session_id == session.session_id))).all()
            return build_session_state_dict(session, lesson, card, list(evals), list(trs))
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Action request_id '{payload.request_id}' already exists with different payload",
            )

    if target_card != dds_data.get("card_id"):
        raise HTTPException(409, detail={"code": "DDS_CARD_NOT_CURRENT"})

    # 5. Check session and lesson ACTIVE state (strictly ACTIVE required)
    if (session.status or "").upper() != "ACTIVE" or dds_data.get("submitted_at") is not None:
        if dds_data.get("stop_reason") == "exam_timeout":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "DDS_EXAM_TIME_EXPIRED", "message": "Время выполнения экзамена истекло"},
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is not in ACTIVE state; action rejected",
        )
    if (lesson.status or "").upper() != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lesson is not in ACTIVE state; action rejected",
        )

    # Server timer check
    limit = (
        session.time_limit_seconds
        if (session.time_limit_seconds and session.time_limit_seconds > 0)
        else (
            lesson.time_limit_seconds
            if (lesson and lesson.time_limit_seconds and lesson.time_limit_seconds > 0)
            else 30
        )
    )
    now_dt = datetime.now(timezone.utc)
    start_dt = _card_started_at(session, dds_data)
    if start_dt is not None:
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
    else:
        start_dt = now_dt

    is_time_exceeded = now_dt > (start_dt + timedelta(seconds=limit))
    if is_time_exceeded:
        time_exceeded_seconds = max(1, int((now_dt - (start_dt + timedelta(seconds=limit))).total_seconds()))
        dds_data["timed_out"] = True
        dds_data["time_exceeded_seconds"] = time_exceeded_seconds

        state_copy = deepcopy(session.dynamic_state or {})
        state_copy["dds"] = dds_data
        session.dynamic_state = state_copy
        flag_modified(session, "dynamic_state")

        if (lesson.mode or "").upper() == "EXAM":
            session.status = "COMPLETED"
            session.end_time = now_dt
            dds_data["stopped_at"] = now_dt.isoformat()
            dds_data["stop_reason"] = "exam_timeout"
            dds_data["submitted_at"] = None
            state_copy = deepcopy(session.dynamic_state or {})
            state_copy["dds"] = dds_data
            session.dynamic_state = state_copy
            flag_modified(session, "dynamic_state")
            card_id = dds_data.get("card_id")
            card = await db.get(IncidentCard, card_id) if card_id else None
            if card and card.status != "Отработана":
                card.status = "Не завершено"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "DDS_EXAM_TIME_EXPIRED", "message": "Время выполнения экзамена истекло"},
            )

    # 6. Fetch IncidentCard
    card_id = dds_data.get("card_id")
    card = await db.get(IncidentCard, card_id) if card_id else None
    if not card or card.session_id != session.session_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="IncidentCard not found for assigned DDS session",
        )

    # Validate that service_name exists in card.assigned_services or incoming_card
    assigned_svcs = card.assigned_services if isinstance(card.assigned_services, dict) else {}
    inc_svcs = [
        s.get("name")
        for s in dds_data.get("incoming_card", {}).get("services", [])
        if isinstance(s, dict)
    ]
    valid_names = set(assigned_svcs.keys()) | set(inc_svcs)
    if payload.service_name not in valid_names:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Service '{payload.service_name}' is not in assigned services for this incident card",
        )

    service_statuses = current_service_statuses(dds_data.get("incoming_card", {}), assigned_svcs, existing_actions)
    if dds_data.get("exercise"):
        from backend.core.dds_exercise import action_issue, now_utc
        from backend.core.dds_phone import record
        reason = action_issue(dds_data, payload, service_statuses.get(payload.service_name, ""))
        if reason:
            from backend.core.dds_queue import store_state
            record(dds_data, payload.model_dump(exclude_none=True), now_utc().isoformat(), reason)
            store_state(session, dds_data)
            await db.commit()
            return await get_dds_session_state(session_id, current_user, db)
    error = action_error(service_statuses.get(payload.service_name, ""), payload, **policy_context(dds_data, payload.service_name))
    if error:
        raise HTTPException(status_code=error[0], detail={"code": error[1]})
    if (payload.kind == "status" and payload.status == "Работы завершены"
            and not has_dispatch(existing_actions, payload.service_name)):
        raise HTTPException(409, detail={"code": "DDS_DISPATCH_REQUIRED"})

    # 7. Record action with server-generated actor_id and timestamp into dynamic_state.dds.actions
    from backend.core.dds_exercise import now_utc
    server_now = now_utc().isoformat()
    action_record = {
        "request_id": payload.request_id,
        "kind": payload.kind,
        "service_name": payload.service_name,
        "actor_id": current_user.user_id,
        "actor_name": current_user.full_name or current_user.username,
        "card_id": card_id,
        "at": server_now,
    }
    if payload.status is not None:
        action_record["status"] = payload.status
    if payload.comment is not None:
        action_record["comment"] = payload.comment
    if payload.order_number is not None:
        action_record["order_number"] = payload.order_number.strip() if isinstance(payload.order_number, str) else payload.order_number
    if payload.who_accepted is not None:
        action_record["who_accepted"] = payload.who_accepted
    if payload.summary is not None:
        action_record["summary"] = payload.summary

    existing_actions.append(action_record)
    if dds_data.get("exercise"):
        from backend.core.dds_exercise import accepted_action
        from backend.core.dds_phone import record
        record(dds_data, payload.model_dump(exclude_none=True), server_now)
        accepted_action(dds_data, payload, server_now)
    dds_data["actions"] = existing_actions

    state_copy = deepcopy(session.dynamic_state or {})
    state_copy["dds"] = dds_data
    session.dynamic_state = state_copy
    flag_modified(session, "dynamic_state")

    # Update card.assigned_services with SAFE metadata only (no free text comments, summaries, order numbers or user IDs)
    services_copy = deepcopy(card.assigned_services or {})
    svc_entry = services_copy.setdefault(
        payload.service_name,
        {
            "status": payload.status or "Получена службой",
            "history": [],
        },
    )
    if payload.status:
        svc_entry["status"] = payload.status
    history = svc_entry.setdefault("history", [])
    safe_hist_item = {
        "status": payload.status or svc_entry.get("status"),
        "kind": payload.kind,
        "at": server_now,
    }
    history.append(safe_hist_item)
    card.assigned_services = services_copy
    flag_modified(card, "assigned_services")

    await db.commit()
    await db.refresh(session)
    await db.refresh(card)

    evals = (await db.scalars(select(EvaluationResult).where(EvaluationResult.session_id == session.session_id))).all()
    trs = (await db.scalars(select(TicketResult).where(TicketResult.session_id == session.session_id))).all()
    return build_session_state_dict(session, lesson, card, list(evals), list(trs))


async def finish_dds_session(
    session_id: str,
    current_user: User,
    db: AsyncSession,
) -> Dict[str, Any]:
    """End the exercise early; card completion uses the separate complete API."""
    from backend.core.dds_queue import stop_session
    return await stop_session(db, session_id, current_user)


async def get_dds_session_state(
    session_id: str,
    current_user: User,
    db: AsyncSession,
    card_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieve session state with strict access validation (CADET owner, TEACHER owner, ADMIN)."""
    stmt_s = select(ExamSession).where(ExamSession.session_id == session_id)
    session = (await db.execute(stmt_s)).scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ExamSession '{session_id}' not found",
        )

    stmt_l = select(Assignment).where(Assignment.assignment_id == session.assignment_id)
    lesson = (await db.execute(stmt_l)).scalar_one_or_none()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found for session",
        )

    _validate_session_is_assigned_dds(session, lesson)

    # Permission check:
    if current_user.role == "ADMIN":
        pass
    elif current_user.role == "CADET":
        if session.cadet_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif current_user.role == "TEACHER":
        if lesson.assigned_by != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # EXAM reads may persist a timeout. Serialize them with actions, card
    # completion and teacher stop, then reload instead of writing a stale JSON.
    if (lesson.mode or "").upper() == "EXAM" and session.status == "ACTIVE":
        await lock_assignment(db, lesson.assignment_id)
        await db.refresh(lesson)
        await db.refresh(session)

    data = (session.dynamic_state or {}).get("dds", {})
    current_id = data.get("card_id")
    selected_id = card_id or current_id
    archived = next((item for item in archived_cards(data) if item["card_id"] == selected_id), None)
    if selected_id != current_id and not archived:
        raise HTTPException(404, "Card not available in this session")
    card = await db.get(IncidentCard, selected_id) if selected_id else None
    if card and card.session_id != session_id:
        raise HTTPException(409, "Card does not belong to session")
    if not card:
        raise HTTPException(409, "Saved incident card is missing")
    evals = list((await db.scalars(select(EvaluationResult).where(EvaluationResult.session_id == session_id))).all())
    trs = list((await db.scalars(select(TicketResult).where(TicketResult.session_id == session_id))).all())
    active_card = await db.get(IncidentCard, current_id) if selected_id != current_id else card
    if (lesson.mode or "").upper() == "EXAM" and session.status == "ACTIVE":
        limit = (
            session.time_limit_seconds
            if (session.time_limit_seconds and session.time_limit_seconds > 0)
            else (
                lesson.time_limit_seconds
                if (lesson and lesson.time_limit_seconds and lesson.time_limit_seconds > 0)
                else 30
            )
        )
        now_dt = datetime.now(timezone.utc)
        start_dt = _card_started_at(session, data)
        if start_dt is not None:
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
        else:
            start_dt = now_dt
        if now_dt > (start_dt + timedelta(seconds=limit)):
            now_str = now_dt.isoformat()
            session.status = "COMPLETED"
            session.end_time = now_dt
            data = deepcopy(data)
            data["timed_out"] = True
            data["time_exceeded_seconds"] = max(1, int((now_dt - (start_dt + timedelta(seconds=limit))).total_seconds()))
            data["stopped_at"] = now_str
            data["stop_reason"] = "exam_timeout"
            data["submitted_at"] = None
            state_copy = deepcopy(session.dynamic_state or {})
            state_copy["dds"] = data
            session.dynamic_state = state_copy
            flag_modified(session, "dynamic_state")
            if active_card and active_card.status != "Отработана":
                active_card.status = "Не завершено"
            await db.commit()
            await db.refresh(session)
            if active_card:
                await db.refresh(active_card)
    result = build_session_state_dict(session, lesson, active_card, evals, trs)
    if archived:
        from backend.core.dds_exercise import projection
        result.update(projection(archived, False))
        # Build a read projection, never replace or modify the active ORM session state.
        result.update(card_id=archived["card_id"], ticket_id=archived["ticket_id"],
                      incoming_card=deepcopy(archived["incoming_card"]), actions=deepcopy(archived["actions"]),
                      received_at=archived.get("received_at"), card_submitted_at=archived.get("card_submitted_at"),
                      readonly=True, can_complete=False, completion_blockers=[])
        result["allowed_service_statuses"] = {service["name"]: [] for service in archived["incoming_card"]["services"]}
        result["score"] = get_session_score([ev for ev in evals if ev.card_id == selected_id],
                                           [tr for tr in trs if tr.ticket_id == archived["ticket_id"]])
    return result



async def list_cadet_dds_assignments(
    current_user: User,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """List assigned DDS sessions for the current cadet."""
    if current_user.role not in ("CADET", "ADMIN"):
        return []

    stmt = (
        select(ExamSession)
        .join(Assignment, ExamSession.assignment_id == Assignment.assignment_id)
        .where(
            ExamSession.cadet_id == current_user.user_id,
            ExamSession.session_type == "CARD_ACTIONS",
            Assignment.target_role == "DISPATCHER_DDS",
        )
    )
    sessions = (await db.scalars(stmt)).all()
    if not sessions:
        return []

    # Filter to only truly assigned sessions with our DDS snapshot
    valid_sessions = [
        s for s in sessions
        if (s.dynamic_state or {}).get("dds", {}).get("incoming_card")
    ]
    if not valid_sessions:
        return []

    lesson_ids = list({s.assignment_id for s in valid_sessions if s.assignment_id})
    res_l = await db.execute(select(Assignment).where(Assignment.assignment_id.in_(lesson_ids)))
    lesson_map = {l.assignment_id: l for l in res_l.scalars().all()}

    session_ids = [s.session_id for s in valid_sessions]
    res_c = await db.execute(select(IncidentCard).where(IncidentCard.session_id.in_(session_ids)))
    card_map = {c.card_id: c for c in res_c.scalars().all()}

    res_ev = await db.execute(select(EvaluationResult).where(EvaluationResult.session_id.in_(session_ids)))
    evals_map: Dict[str, List[EvaluationResult]] = {}
    for ev in res_ev.scalars().all():
        evals_map.setdefault(ev.session_id, []).append(ev)

    res_tr = await db.execute(select(TicketResult).where(TicketResult.session_id.in_(session_ids)))
    trs_map: Dict[str, List[TicketResult]] = {}
    for tr in res_tr.scalars().all():
        trs_map.setdefault(tr.session_id, []).append(tr)

    results = []
    for s in valid_sessions:
        lesson = lesson_map.get(s.assignment_id)
        if not lesson:
            continue
        card = card_map.get((s.dynamic_state or {}).get("dds", {}).get("card_id"))
        evals = evals_map.get(s.session_id, [])
        trs = trs_map.get(s.session_id, [])
        results.append(build_session_state_dict(s, lesson, card, evals, trs))

    return results


def extract_last_activity(session: Optional[ExamSession]) -> Optional[str]:
    """Return the ISO timestamp of the cadet's most recent action in the session."""
    if not session or not session.dynamic_state or not isinstance(session.dynamic_state, dict):
        return None
    dds_data = session.dynamic_state.get("dds")
    if not isinstance(dds_data, dict):
        return None

    actions: list[dict] = []
    for card_info in archived_cards(dds_data):
        if isinstance(card_info, dict):
            card_actions = card_info.get("actions")
            if isinstance(card_actions, list):
                actions.extend(card_actions)

    curr_actions = dds_data.get("actions")
    if isinstance(curr_actions, list):
        actions.extend(curr_actions)

    if not actions:
        return None

    latest_dt = None
    latest_at = None
    for action in actions:
        if not isinstance(action, dict):
            continue
        at = action.get("at")
        if not at or not isinstance(at, str):
            continue
        try:
            dt = datetime.fromisoformat(at.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if latest_dt is None or dt >= latest_dt:
                latest_dt = dt
                latest_at = at
        except Exception:
            continue
    return latest_at


async def build_dds_cadet_stats(
    lesson: Assignment,
    group: Optional[StudentGroup],
    db: AsyncSession,
) -> tuple[List[CadetLessonStats], int, int, int, int]:
    """Collect honest cadet stats and aggregate counters for a DDS lesson without faking scores/tickets."""
    # 1. Fetch sessions linked to this lesson
    stmt_sess = select(ExamSession).where(ExamSession.assignment_id == lesson.assignment_id)
    if lesson.cadet_id:
        stmt_sess = stmt_sess.where(ExamSession.cadet_id == lesson.cadet_id)
    stmt_sess = stmt_sess.order_by(ExamSession.start_time.asc(), ExamSession.session_id.asc())
    sessions = list((await db.scalars(stmt_sess)).all())
    session_by_cadet = {s.cadet_id: s for s in sessions if s.cadet_id}

    # 2. Determine participants roster:
    # If ACTIVE or COMPLETED -> participants are the saved session cadets (historical accuracy);
    # sessions=[] means students=[] (do NOT fallback to current group)
    # If WAITING -> union group.students and group.cadet_ids, filter active CADET, dedup
    group_students: List[User] = []
    if (lesson.status or "").upper() in ("ACTIVE", "COMPLETED"):
        if sessions:
            cadet_ids = [s.cadet_id for s in sessions if s.cadet_id]
            if cadet_ids:
                res_u = await db.execute(select(User).where(User.user_id.in_(cadet_ids)))
                users_by_id = {u.user_id: u for u in res_u.scalars().all()}
                # Preserve session order
                group_students = [users_by_id[cid] for cid in cadet_ids if cid in users_by_id]
        else:
            group_students = []
    else:
        cadet_ids_set = set()
        if lesson.cadet_id:
            cadet_ids_set.add(lesson.cadet_id)
        elif group:
            if group.cadet_ids:
                cadet_ids_set.update(group.cadet_ids)
            if group.students:
                cadet_ids_set.update(u.user_id for u in group.students if getattr(u, "user_id", None))
        if cadet_ids_set:
            res_u = await db.execute(
                select(User).where(
                    User.user_id.in_(list(cadet_ids_set)),
                    User.role == "CADET",
                    User.is_active == True,
                )
            )
            group_students = list(res_u.scalars().all())
        else:
            group_students = []

    # Deduplicate group students while preserving order
    seen_ids = set()
    dedup_students = []
    for st in group_students:
        if st.user_id not in seen_ids:
            seen_ids.add(st.user_id)
            dedup_students.append(st)
    group_students = dedup_students

    if lesson.cadet_id:
        group_students = [st for st in group_students if st.user_id == lesson.cadet_id]
        if not group_students:
            res_one = await db.execute(select(User).where(User.user_id == lesson.cadet_id))
            target_cadet = res_one.scalar_one_or_none()
            if target_cadet:
                group_students = [target_cadet]

    # 3. Fetch cards, evals, trs
    session_ids = [s.session_id for s in sessions]
    cards_by_session: Dict[str, List[IncidentCard]] = {}
    evals_by_card: Dict[str, List[EvaluationResult]] = {}
    evals_by_session: Dict[str, List[EvaluationResult]] = {}
    trs_by_session: Dict[str, List[TicketResult]] = {}

    if session_ids:
        res_cards = await db.execute(
            select(IncidentCard)
            .where(IncidentCard.session_id.in_(session_ids))
            .order_by(IncidentCard.created_at.asc(), IncidentCard.card_id.asc())
        )
        for c in res_cards.scalars().all():
            cards_by_session.setdefault(c.session_id, []).append(c)

        card_ids = [c.card_id for clist in cards_by_session.values() for c in clist]
        eval_conditions = [EvaluationResult.session_id.in_(session_ids)]
        if card_ids:
            eval_conditions.append(EvaluationResult.card_id.in_(card_ids))
        res_evals = await db.execute(
            select(EvaluationResult).where(or_(*eval_conditions))
        )
        seen_eval_ids = set()
        for ev in res_evals.scalars().all():
            if ev.evaluation_id in seen_eval_ids:
                continue
            seen_eval_ids.add(ev.evaluation_id)
            sid = ev.session_id
            if not sid and ev.card_id:
                for sid_k, clist in cards_by_session.items():
                    if any(c.card_id == ev.card_id for c in clist):
                        sid = sid_k
                        break
            if sid:
                evals_by_session.setdefault(sid, []).append(ev)
            if ev.card_id:
                evals_by_card.setdefault(ev.card_id, []).append(ev)

        res_tr = await db.execute(
            select(TicketResult).where(TicketResult.session_id.in_(session_ids))
        )
        for tr in res_tr.scalars().all():
            trs_by_session.setdefault(tr.session_id, []).append(tr)

    # 4. Fetch scenario ticket titles
    scenario_map: Dict[str, str] = {}
    if lesson.scenario_id:
        t = await db.get(ScenarioTicket, lesson.scenario_id)
        if t and t.title:
            scenario_map[t.scenario_id] = t.title
    for s in sessions:
        if s.ticket_id and s.ticket_id not in scenario_map:
            t = await db.get(ScenarioTicket, s.ticket_id)
            if t and t.title:
                scenario_map[t.scenario_id] = t.title
    for clist in cards_by_session.values():
        for c in clist:
            if c.scenario_id and c.scenario_id not in scenario_map:
                t = await db.get(ScenarioTicket, c.scenario_id)
                if t and t.title:
                    scenario_map[t.scenario_id] = t.title

    cadets_list: List[CadetLessonStats] = []
    total_in_progress = 0
    total_passed = 0
    total_failed = 0
    progress_sum = 0

    for student in group_students:
        s = session_by_cadet.get(student.user_id)
        c_stats = CadetLessonStats(
            cadet_id=student.user_id,
            cadet_name=student.full_name or student.username,
            status="WAITING" if lesson.status == "WAITING" else "IDLE",
        )

        if not s:
            c_stats.current_ticket = "Ожидание запуска"
            c_stats.progress = 0
            c_stats.score = None
            c_stats.tickets = []
            cadets_list.append(c_stats)
            continue

        c_stats.session_id = s.session_id
        c_stats.last_activity = extract_last_activity(s)
        session_evals = evals_by_session.get(s.session_id, [])
        session_trs = trs_by_session.get(s.session_id, [])
        session_cards = cards_by_session.get(s.session_id, [])

        dds_data = (s.dynamic_state or {}).get("dds", {}) if isinstance(s.dynamic_state, dict) else {}
        submitted_at = dds_data.get("submitted_at")
        s_status = (s.status or "").upper()

        if dds_data.get("version") == 2:
            c_stats.tickets = queue_ticket_details(s, session_evals, session_trs)
            c_stats.status = "COMPLETED" if submitted_at else "INCOMPLETE" if s_status == "COMPLETED" else "IN_PROGRESS"
            c_stats.progress = round(100 * len(archived_cards(dds_data)) / len(dds_data["queue"]))
            c_stats.current_ticket = c_stats.tickets[dds_data["current_index"]].title
            c_stats.in_progress = int(s_status == "ACTIVE")
            c_stats.passed = sum(ticket.status == "passed" for ticket in c_stats.tickets)
            c_stats.failed = sum(ticket.status == "failed" for ticket in c_stats.tickets)
            scores = [ticket.score for ticket in c_stats.tickets if ticket.score is not None]
            c_stats.score = scores[0] if len(scores) == 1 else round(sum(scores) / len(scores), 1) if scores else None
            total_in_progress += c_stats.in_progress
            total_passed += int(c_stats.passed == len(c_stats.tickets))
            total_failed += int(c_stats.failed > 0)
            cadets_list.append(c_stats)
            continue

        if s_status == "COMPLETED":
            if submitted_at:
                c_stats.status = "COMPLETED"
                c_stats.progress = 100
            else:
                if "dds" in (s.dynamic_state or {}):
                    c_stats.status = "INCOMPLETE"
                    c_stats.progress = 0
                else:
                    c_stats.status = "COMPLETED"
                    c_stats.progress = 100
        elif s_status in ("ACTIVE", "IN_PROGRESS"):
            c_stats.status = "IN_PROGRESS"
            c_stats.progress = 0
            c_stats.in_progress = 1
            total_in_progress += 1
        else:
            c_stats.status = s_status or "WAITING"
            c_stats.progress = 0

        # A default false is_passed flag is not a failed evaluation.
        resolved_score, resolved_passed, *_ = _resolve_session_grade(session_evals, session_trs)
        is_passed = resolved_passed is True
        is_failed = resolved_passed is False
        if is_passed:
            c_stats.passed = 1
            c_stats.failed = 0
            total_passed += 1
        elif is_failed:
            c_stats.passed = 0
            c_stats.failed = 1
            total_failed += 1
        else:
            c_stats.passed = 0
            c_stats.failed = 0

        # Build ticket details
        tickets: List[CadetTicketDetail] = []

        if dds_data.get("incoming_card"):
            # New assigned DDS session: exactly one snapshot card/ticket
            card = session_cards[0] if session_cards else None
            card_id = (card.card_id if card else None) or dds_data.get("card_id")
            t_id = s.ticket_id or (card.scenario_id if card else None) or lesson.scenario_id or card_id
            from backend.core.gradebook_records import historical_record_snapshot
            saved_scenario = historical_record_snapshot(s, t_id)
            title = (saved_scenario.get("title") if saved_scenario else None) or (f"Билет #{t_id[:8]}" if t_id else "Карточка")
            card_evals = evals_by_card.get(card.card_id, []) if card else []
            if not card_evals:
                card_evals = session_evals
            card_trs = [tr for tr in session_trs if tr.ticket_id and card and tr.ticket_id == card.scenario_id] if (card and card.scenario_id) else session_trs
            t_score = get_session_score(card_evals, card_trs if card_trs else session_trs)

            tr = card_trs[0] if card_trs else (session_trs[0] if session_trs else None)
            if tr:
                rec_id = tr.result_id
            elif card or card_id:
                rec_id = card.card_id if card else card_id
            else:
                rec_id = None

            # Error details strictly from associated results, deduplicated
            errors: List[str] = []
            for ev in session_evals:
                if ev.errors_list and isinstance(ev.errors_list, list):
                    for err in ev.errors_list:
                        if isinstance(err, str):
                            msg = err
                        elif isinstance(err, dict):
                            msg = str(err.get("message") or err)
                        else:
                            msg = str(err)
                        if msg not in errors:
                            errors.append(msg)
            for tr_item in session_trs:
                if isinstance(tr_item.error_details, list):
                    for err in tr_item.error_details:
                        if isinstance(err, str):
                            msg = err
                        elif isinstance(err, dict):
                            msg = str(err.get("message") or err)
                        else:
                            msg = str(err)
                        if msg not in errors:
                            errors.append(msg)
                elif isinstance(tr_item.error_details, dict):
                    for k, v in tr_item.error_details.items():
                        msg = f"{k}: {v}"
                        if msg not in errors:
                            errors.append(msg)

            if is_passed:
                t_status = "passed"
            elif is_failed:
                t_status = "failed"
            elif c_stats.status == "COMPLETED":
                t_status = "completed" if t_score is not None else "ungraded"
            elif c_stats.status == "INCOMPLETE":
                t_status = "incomplete"
            elif c_stats.status == "IN_PROGRESS":
                t_status = "in_progress"
            else:
                t_status = "in_progress"

            detail = CadetTicketDetail(
                ticket_id=t_id,
                title=title,
                status=t_status,
                score=t_score,
                record_id=rec_id,
                session_id=s.session_id,
                errors_count=len(errors),
                errors=errors,
                completed_at=s.end_time if c_stats.status in ("COMPLETED", "INCOMPLETE") else None,
                card_id=card_id,
                actions=dds_data.get("actions", []),
            )
            tickets.append(detail)
        elif session_cards:
            # Legacy or multiple cards: one detail per real IncidentCard
            for card in session_cards:
                card_evals = evals_by_card.get(card.card_id, [])
                if not card_evals and len(session_cards) == 1:
                    card_evals = session_evals
                card_trs = [tr for tr in session_trs if tr.ticket_id and tr.ticket_id == card.scenario_id]
                if not card_trs and len(session_cards) == 1:
                    card_trs = session_trs

                card_score = get_session_score(card_evals, card_trs)

                if card.scenario_id:
                    t_id = card.scenario_id
                elif len(session_cards) == 1 and s.ticket_id:
                    t_id = s.ticket_id
                elif len(session_cards) == 1 and lesson.scenario_id:
                    t_id = lesson.scenario_id
                else:
                    t_id = card.card_id

                if t_id in scenario_map:
                    title = scenario_map[t_id]
                elif card.scenario_id or (len(session_cards) == 1 and (s.ticket_id or lesson.scenario_id)):
                    title = f"Билет #{t_id[:8]}"
                else:
                    title = f"Карточка #{card.card_id[:8]}"

                card_errors: List[str] = []
                for ev in card_evals:
                    if ev.errors_list and isinstance(ev.errors_list, list):
                        for err in ev.errors_list:
                            if isinstance(err, str):
                                msg = err
                            elif isinstance(err, dict):
                                msg = str(err.get("message") or err)
                            else:
                                msg = str(err)
                            if msg not in card_errors:
                                card_errors.append(msg)
                for tr in card_trs:
                    if isinstance(tr.error_details, list):
                        for err in tr.error_details:
                            if isinstance(err, str):
                                msg = err
                            elif isinstance(err, dict):
                                msg = str(err.get("message") or err)
                            else:
                                msg = str(err)
                            if msg not in card_errors:
                                card_errors.append(msg)
                    elif isinstance(tr.error_details, dict):
                        for k, v in tr.error_details.items():
                            msg = f"{k}: {v}"
                            if msg not in card_errors:
                                card_errors.append(msg)

                _, card_passed, *_ = _resolve_session_grade(card_evals, card_trs)
                card_is_passed = card_passed is True
                card_is_failed = card_passed is False

                if card_is_passed:
                    t_status = "passed"
                elif card_is_failed:
                    t_status = "failed"
                elif c_stats.status == "COMPLETED":
                    t_status = "completed" if card_score is not None else "ungraded"
                elif c_stats.status == "INCOMPLETE":
                    t_status = "incomplete"
                elif c_stats.status == "IN_PROGRESS":
                    t_status = "in_progress"
                else:
                    t_status = "in_progress"

                tr = card_trs[0] if card_trs else None
                rec_id = tr.result_id if tr else card.card_id

                detail = CadetTicketDetail(
                    ticket_id=t_id,
                    title=title,
                    status=t_status,
                    score=card_score,
                    record_id=rec_id,
                    session_id=s.session_id,
                    errors_count=len(card_errors),
                    errors=card_errors,
                    completed_at=s.end_time if c_stats.status in ("COMPLETED", "INCOMPLETE") else None,
                    card_id=card.card_id,
                    actions=dds_data.get("actions", []),
                )
                tickets.append(detail)
        elif session_trs:
            # TicketResult with real ticket_id without incident cards (legacy)
            # Deduplicate by real ticket_id
            trs_by_tid: Dict[str, List[TicketResult]] = {}
            for tr in session_trs:
                if tr.ticket_id:
                    trs_by_tid.setdefault(tr.ticket_id, []).append(tr)

            for t_id, tr_list in trs_by_tid.items():
                title = scenario_map.get(t_id) or f"Билет #{t_id[:8]}"
                sorted_trs = sorted(
                    tr_list,
                    key=lambda t: (t.created_at or datetime.min, t.result_id or ""),
                    reverse=True,
                )
                tr_score = get_session_score(session_evals, sorted_trs)

                tr_errors: List[str] = []
                for ev in session_evals:
                    if ev.errors_list and isinstance(ev.errors_list, list):
                        for err in ev.errors_list:
                            if isinstance(err, str):
                                msg = err
                            elif isinstance(err, dict):
                                msg = str(err.get("message") or err)
                            else:
                                msg = str(err)
                            if msg not in tr_errors:
                                tr_errors.append(msg)
                for tr in sorted_trs:
                    if isinstance(tr.error_details, list):
                        for err in tr.error_details:
                            if isinstance(err, str):
                                msg = err
                            elif isinstance(err, dict):
                                msg = str(err.get("message") or err)
                            else:
                                msg = str(err)
                            if msg not in tr_errors:
                                tr_errors.append(msg)
                    elif isinstance(tr.error_details, dict):
                        for k, v in tr.error_details.items():
                            msg = f"{k}: {v}"
                            if msg not in tr_errors:
                                tr_errors.append(msg)

                has_completed = any((tr.status or "").lower() in ("completed", "evaluated") for tr in sorted_trs)
                if has_completed:
                    _, saved_passed, *_ = _resolve_session_grade(session_evals, sorted_trs)
                    tr_is_passed = tr_score is not None and saved_passed is True
                    tr_is_failed = tr_score is not None and saved_passed is False
                    if tr_is_passed:
                        t_status = "passed"
                    elif tr_is_failed:
                        t_status = "failed"
                    else:
                        t_status = "ungraded"
                else:
                    if c_stats.status == "COMPLETED":
                        t_status = "completed" if tr_score is not None else "ungraded"
                    elif c_stats.status == "INCOMPLETE":
                        t_status = "incomplete"
                    elif c_stats.status == "IN_PROGRESS":
                        t_status = "in_progress"
                    else:
                        t_status = "in_progress"

                tr = sorted_trs[0] if sorted_trs else None
                rec_id = tr.result_id if tr else None

                detail = CadetTicketDetail(
                    ticket_id=t_id,
                    title=title,
                    status=t_status,
                    score=tr_score,
                    record_id=rec_id,
                    session_id=s.session_id,
                    errors_count=len(tr_errors),
                    errors=tr_errors,
                    completed_at=s.end_time if c_stats.status in ("COMPLETED", "INCOMPLETE") else None,
                    card_id=None,
                    actions=[],
                )
                tickets.append(detail)

        c_stats.tickets = tickets
        if tickets:
            c_stats.current_ticket = tickets[0].title
            valid_scores = [t.score for t in tickets if t.score is not None]
            if len(valid_scores) == 1:
                c_stats.score = valid_scores[0]
            elif len(valid_scores) > 1:
                c_stats.score = round(sum(valid_scores) / len(valid_scores), 1)
            else:
                c_stats.score = None
        else:
            c_stats.current_ticket = None
            c_stats.score = None

        progress_sum += c_stats.progress
        cadets_list.append(c_stats)

    total_cadets = len(cadets_list)
    return cadets_list, total_cadets, total_in_progress, total_passed, total_failed
