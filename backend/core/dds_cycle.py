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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult
from backend.schemas.dds_cycle import DispatcherData, DDSActionPayload
from backend.schemas.lessons import CadetLessonStats, CadetTicketDetail
from backend.core.dds_service_policy import action_error, allowed_statuses, current_service_statuses
from backend.core.dds_queue import archived_cards, card_progress, completion_blockers, has_dispatch, queue_ticket_details


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


def get_session_score(
    evals: List[EvaluationResult],
    trs: List[TicketResult],
) -> Optional[float]:
    """Extract actual finite score (0..100) from saved EvaluationResult or TicketResult.

    Deterministic selection by evaluation/result timestamps/IDs.
    Preserves 0.0 as a valid score; returns None only if un-evaluated.
    Does not infer or synthesize a rubric. Does not treat bool or NaN as valid.
    """
    sorted_evals = sorted(
        evals,
        key=lambda e: (e.evaluated_at or datetime.min, e.evaluation_id or ""),
        reverse=True,
    )
    sorted_trs = sorted(
        trs,
        key=lambda t: (t.created_at or datetime.min, t.result_id or ""),
        reverse=True,
    )

    # 1. Check EvaluationResult scores dictionary (final_score or total)
    for ev in sorted_evals:
        if isinstance(ev.scores, dict):
            for key in ("final_score", "total"):
                val = ev.scores.get(key)
                if val is not None and not isinstance(val, bool):
                    try:
                        f_val = float(val)
                        if math.isfinite(f_val) and 0.0 <= f_val <= 100.0:
                            return f_val
                    except (ValueError, TypeError):
                        pass

    # 2. Check TicketResult score_total
    for tr in sorted_trs:
        if tr.score_total is not None and not isinstance(tr.score_total, bool):
            try:
                f_val = float(tr.score_total)
                if math.isfinite(f_val) and 0.0 <= f_val <= 100.0:
                    return f_val
            except (ValueError, TypeError):
                pass

    return None


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

    incoming_card = dds_data.get("incoming_card")
    if not incoming_card and card:
        incoming_card = card.filled_data or {}
    if not incoming_card:
        incoming_card = {}

    card_id = (card.card_id if card else None) or dds_data.get("card_id")
    actions = dds_data.get("actions", [])
    submitted_at = dds_data.get("submitted_at")
    score = get_session_score(evals, trs)
    editable = session.status == "ACTIVE" and lesson.status == "ACTIVE" and submitted_at is None
    service_statuses = current_service_statuses(incoming_card, (card.assigned_services or {}) if card else {}, actions)
    blockers = completion_blockers(dds_data, (card.assigned_services or {}) if card else {})
    progress = card_progress(dds_data)
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

    return {
        "session_id": session.session_id,
        "lesson_id": lesson.assignment_id,
        "ticket_id": session.ticket_id or lesson.scenario_id,
        "card_id": card_id,
        "session_status": session.status,
        "lesson_status": lesson.status,
        "started_at": (
            (session.start_time.replace(tzinfo=timezone.utc) if session.start_time.tzinfo is None else session.start_time).isoformat()
            if session.start_time else None
        ),
        "incoming_card": incoming_card,
        "actions": actions,
        "allowed_service_statuses": {
            name: allowed_statuses(current) if editable else [] for name, current in service_statuses.items()
        },
        "submitted_at": submitted_at,
        "score": score,
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
        "stop_reason": dds_data.get("stop_reason"),
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
        m_ord = (existing.get("order_number") == payload.order_number)
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is not in ACTIVE state; action rejected",
        )
    if (lesson.status or "").upper() != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lesson is not in ACTIVE state; action rejected",
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
    error = action_error(service_statuses.get(payload.service_name, ""), payload)
    if error:
        raise HTTPException(status_code=error[0], detail={"code": error[1]})
    if (payload.kind == "status" and payload.status == "Работы завершены"
            and not has_dispatch(existing_actions, payload.service_name)):
        raise HTTPException(409, detail={"code": "DDS_DISPATCH_REQUIRED"})

    # 7. Record action with server-generated actor_id and timestamp into dynamic_state.dds.actions
    server_now = datetime.now(timezone.utc).isoformat()
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
        action_record["order_number"] = payload.order_number
    if payload.who_accepted is not None:
        action_record["who_accepted"] = payload.who_accepted
    if payload.summary is not None:
        action_record["summary"] = payload.summary

    existing_actions.append(action_record)
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
    result = build_session_state_dict(session, lesson, active_card, evals, trs)
    if archived:
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


async def build_dds_cadet_stats(
    lesson: Assignment,
    group: Optional[StudentGroup],
    db: AsyncSession,
) -> tuple[List[CadetLessonStats], int, int, int, int]:
    """Collect honest cadet stats and aggregate counters for a DDS lesson without faking scores/tickets."""
    # 1. Fetch sessions linked to this lesson
    stmt_sess = select(ExamSession).where(ExamSession.assignment_id == lesson.assignment_id).order_by(ExamSession.start_time.asc(), ExamSession.session_id.asc())
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
        if group:
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

        res_evals = await db.execute(
            select(EvaluationResult).where(EvaluationResult.session_id.in_(session_ids))
        )
        for ev in res_evals.scalars().all():
            evals_by_session.setdefault(ev.session_id, []).append(ev)
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

        # passed/failed strictly from explicit status completed/evaluated TicketResult, not threshold
        is_passed = any(
            tr.is_passed for tr in session_trs
            if (tr.status or "").lower() in ("completed", "evaluated")
        )
        is_failed = any(
            (not tr.is_passed) for tr in session_trs
            if (tr.status or "").lower() in ("completed", "evaluated")
        )
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
            title = scenario_map.get(t_id) or (f"Билет #{t_id[:8]}" if t_id else "Карточка")
            t_score = get_session_score(session_evals, session_trs)

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
            for tr in session_trs:
                if isinstance(tr.error_details, list):
                    for err in tr.error_details:
                        if isinstance(err, str):
                            msg = err
                        elif isinstance(err, dict):
                            msg = str(err.get("message") or err)
                        else:
                            msg = str(err)
                        if msg not in errors:
                            errors.append(msg)
                elif isinstance(tr.error_details, dict):
                    for k, v in tr.error_details.items():
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

                card_is_passed = any(tr.is_passed for tr in card_trs if (tr.status or "").lower() in ("completed", "evaluated"))
                card_is_failed = any((not tr.is_passed) for tr in card_trs if (tr.status or "").lower() in ("completed", "evaluated"))

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

                detail = CadetTicketDetail(
                    ticket_id=t_id,
                    title=title,
                    status=t_status,
                    score=card_score,
                    errors_count=len(card_errors),
                    errors=card_errors,
                    completed_at=s.end_time if c_stats.status in ("COMPLETED", "INCOMPLETE") else None,
                    card_id=card.card_id,
                    actions=[],
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
                    tr_is_passed = any(tr.is_passed for tr in sorted_trs if (tr.status or "").lower() in ("completed", "evaluated"))
                    tr_is_failed = any((not tr.is_passed) for tr in sorted_trs if (tr.status or "").lower() in ("completed", "evaluated"))
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

                detail = CadetTicketDetail(
                    ticket_id=t_id,
                    title=title,
                    status=t_status,
                    score=tr_score,
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
