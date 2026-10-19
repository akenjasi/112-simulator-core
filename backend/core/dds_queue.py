"""Persisted sequential DDS exercises. Queue snapshots never leave the server."""
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.dds_service_policy import canonical_status, current_service_statuses
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_01 import User
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult
from backend.schemas.dds_cycle import DDSTrainingStartPayload


def available_for_training(ticket: ScenarioTicket) -> bool:
    # Unmarked legacy material remains usable; explicitly unpublished drafts do not.
    return (ticket.workflow_state or {}).get("status") in (None, "", "active", "published")


async def load_pool(db: AsyncSession, ticket_ids: list[str], *, training: bool = False) -> list[dict[str, Any]]:
    from backend.core.dds_cycle import incoming_card_from_ticket, is_suitable_dds_ticket, extract_dds_ticket_metadata

    if not ticket_ids or len(set(ticket_ids)) != len(ticket_ids):
        raise HTTPException(422, detail={"code": "DDS_INVALID_POOL"})
    tickets = {ticket.scenario_id: ticket for ticket in (await db.scalars(
        select(ScenarioTicket).where(ScenarioTicket.scenario_id.in_(ticket_ids))
    )).all()}
    pool = []
    for ticket_id in ticket_ids:
        ticket = tickets.get(ticket_id)
        if not is_suitable_dds_ticket(ticket) or (training and not available_for_training(ticket)):
            raise HTTPException(409, detail={"code": "DDS_TICKET_UNAVAILABLE"})
        from backend.core.dds_exercise import validated_plan
        incoming = incoming_card_from_ticket(ticket)
        raw_plan = (ticket.content or {}).get("dds_exercise")
        try:
            plan = validated_plan(raw_plan, [s["name"] for s in incoming["services"]]) if raw_plan else None
        except ValueError as exc:
            raise HTTPException(422, "Invalid DDS exercise plan") from exc
        pool.append({"exercise_plan": plan, "ticket_id": ticket_id, "title": extract_dds_ticket_metadata(ticket)[3],
                     "incoming_card": incoming_card_from_ticket(ticket)})
    return pool


def store_state(session: ExamSession, data: dict[str, Any]) -> None:
    state = deepcopy(session.dynamic_state or {})
    state["dds"] = data
    session.dynamic_state = state
    flag_modified(session, "dynamic_state")


async def activate_card(db: AsyncSession, session: ExamSession, data: dict[str, Any],
                        index: int, now: datetime) -> IncidentCard:
    item = data["queue"][index]
    incoming = deepcopy(item["incoming_card"])
    services = {
        service["name"]: {
            "id": service.get("id", ""), "status": service.get("status", "Получена службой"),
            "history": [{"status": h["status"], "time": h.get("time") or h.get("at")}
                        for h in service.get("history", []) if h.get("status")],
        } for service in incoming["services"]
    }
    card = IncidentCard(session_id=session.session_id, scenario_id=item["ticket_id"],
                        operator_id=session.cadet_id, card_origin="DDS", filled_data=incoming,
                        assigned_services=services, status="open", created_at=now)
    db.add(card)
    await db.flush()
    session.ticket_id = item["ticket_id"]
    data.update(current_index=index, card_id=card.card_id, incoming_card=incoming,
                actions=[], received_at=now.isoformat(), card_submitted_at=None)
    from backend.core.dds_exercise import initialize
    data.pop("criteria", None)
    data["exercise"] = initialize(item.get("exercise_plan"), card.card_id, now.isoformat())
    return card


async def initialize_queue(db: AsyncSession, session: ExamSession, pool: list[dict[str, Any]], now: datetime) -> None:
    data = {"version": 2, "queue": deepcopy(pool), "completed_cards": [], "submitted_at": None}
    await activate_card(db, session, data, 0, now)
    store_state(session, data)


def completion_blockers(data: dict[str, Any], assigned: dict[str, Any]) -> list[dict[str, str]]:
    incoming, actions = data.get("incoming_card", {}), data.get("actions", [])
    statuses = current_service_statuses(incoming, assigned, actions)
    blockers = []
    if data.get("exercise") and data["exercise"]["index"] < len(data["exercise"]["plan"]["reports"]):
        blockers.append({"code": "DDS_REPORTS_PENDING", "service_name": ""})
    if not statuses:
        return [{"code": "DDS_NO_SERVICES", "service_name": ""}]
    for name, raw in statuses.items():
        current = canonical_status(raw)
        matching = [action for action in actions if action.get("service_name") == name]
        if current in ("Не принята", "Отказ", "Отказ от выполнения работ"):
            reason = next(((action.get("comment") or "") for action in reversed(matching)
                           if action.get("kind") == "status" and action.get("status") == raw), "")
            if not reason.strip():
                blockers.append({"code": "DDS_REFUSAL_REASON_REQUIRED", "service_name": name})
        elif current == "Работы завершены":
            if not has_dispatch(actions, name):
                blockers.append({"code": "DDS_DISPATCH_REQUIRED", "service_name": name})
        else:
            blockers.append({"code": "DDS_SERVICE_NOT_FINISHED", "service_name": name})
    return blockers


def has_dispatch(actions: list[dict[str, Any]], service_name: str) -> bool:
    return any(action.get("kind") == "dispatch" and action.get("service_name") == service_name
               and (action.get("who_accepted") or "").strip() and (action.get("summary") or "").strip()
               for action in actions)


def archived_cards(data: dict[str, Any]) -> list[dict[str, Any]]:
    return data.get("completed_cards", []) if data.get("version") == 2 else []


def card_progress(data: dict[str, Any]) -> dict[str, int]:
    return {
        "current_index": data.get("current_index", 0),
        "total_cards": len(data["queue"]) if data.get("version") == 2 else 1,
        "completed_cards": len(archived_cards(data)) if data.get("version") == 2
                           else int(bool(data.get("submitted_at"))),
    }


async def locked_context(db: AsyncSession, session_id: str, user: User) -> tuple[ExamSession, Assignment]:
    """Authorize before taking a write lock; re-read state after obtaining it."""
    from backend.core.dds_cycle import _validate_session_is_assigned_dds, lock_assignment

    session = await db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if user.role != "ADMIN" and (user.role != "CADET" or session.cadet_id != user.user_id):
        raise HTTPException(403, "Access denied")
    lesson = await db.get(Assignment, session.assignment_id) if session.assignment_id else None
    if not lesson:
        raise HTTPException(409, "Session is not assigned")
    _validate_session_is_assigned_dds(session, lesson)
    await lock_assignment(db, lesson.assignment_id)
    await db.refresh(lesson)
    await db.refresh(session)
    return session, lesson


async def complete_card(db: AsyncSession, session_id: str, card_id: str, request_id: str,
                        user: User) -> dict[str, Any]:
    from backend.core.dds_cycle import get_dds_session_state

    session, lesson = await locked_context(db, session_id, user)
    data = deepcopy(session.dynamic_state["dds"])
    previous = archived_cards(data)
    reused = next((item for item in previous if item.get("complete_request_id") == request_id), None)
    if reused and reused["card_id"] != card_id:
        raise HTTPException(409, detail={"code": "DDS_REQUEST_CONFLICT"})
    if any(item["card_id"] == card_id for item in previous) or (
        data.get("card_id") == card_id and data.get("submitted_at")
    ):
        # The same card can be acknowledged repeatedly, but never advance twice.
        return await get_dds_session_state(session_id, user, db)
    if session.status != "ACTIVE" or lesson.status != "ACTIVE":
        raise HTTPException(409, detail={"code": "DDS_SESSION_NOT_ACTIVE"})
    if data.get("card_id") != card_id:
        raise HTTPException(409, detail={"code": "DDS_CARD_NOT_CURRENT"})
    card = await db.get(IncidentCard, card_id)
    if not card or card.session_id != session_id:
        raise HTTPException(409, "Card not found")
    if data.get("exercise"):
        from backend.core.dds_phone import retry, attempt_result
        wire = {"request_id": request_id, "card_id": card_id, "operation": "complete"}
        saved = retry(data["exercise"], wire)
        if saved:
            result = await get_dds_session_state(session_id, user, db)
            result["last_attempt"] = attempt_result(saved)
            return result
    blockers = completion_blockers(data, card.assigned_services or {})
    if blockers and data.get("exercise"):
        from backend.core.dds_phone import retry, record
        from backend.core.dds_exercise import now_utc
        wire = {"request_id": request_id, "card_id": card_id, "operation": "complete"}
        if not retry(data["exercise"], wire):
            record(data, wire, now_utc().isoformat(), "completion")
            store_state(session, data)
            await db.commit()
        return await get_dds_session_state(session_id, user, db)
    if blockers:
        raise HTTPException(409, detail={"code": "DDS_CARD_NOT_READY", "blockers": blockers})
    now = datetime.now(timezone.utc)
    data["card_submitted_at"] = now.isoformat()
    if data.get("exercise"):
        from backend.core.dds_exercise import criteria
        from backend.core.dds_phone import record
        record(data, {"request_id": request_id, "card_id": card_id, "operation": "complete"}, now.isoformat())
        data["criteria"] = criteria(data, closed=True)
    card.status = "Отработана"
    result = await db.scalar(select(TicketResult).where(
        TicketResult.session_id == session_id, TicketResult.ticket_id == session.ticket_id))
    if result is None:
        db.add(TicketResult(session_id=session_id, ticket_id=session.ticket_id, status="ungraded"))
    elif result.score_total is None and result.status in (None, "active", "in_progress"):
        result.status = "ungraded"
    from backend.core.dds_exercise import finalize_result
    await finalize_result(db, session, data, "ungraded")
    if data.get("version") == 2:
        previous.append({key: deepcopy(data.get(key)) for key in (
            "card_id", "incoming_card", "actions", "received_at", "card_submitted_at", "exercise", "criteria")})
        previous[-1].update(ticket_id=session.ticket_id, complete_request_id=request_id)
        data["completed_cards"] = previous
        if data["current_index"] + 1 < len(data["queue"]):
            await activate_card(db, session, data, data["current_index"] + 1, now)
        else:
            session.status, session.end_time = "COMPLETED", now
            data["submitted_at"] = now.isoformat()
    else:
        session.status, session.end_time = "COMPLETED", now
        data["submitted_at"] = now.isoformat()
    if session.status == "COMPLETED" and lesson.card_pool_source == "self_training":
        lesson.status, lesson.completed_at = "COMPLETED", now
    store_state(session, data)
    await db.commit()
    return await get_dds_session_state(session_id, user, db)


async def stop_session(db: AsyncSession, session_id: str, user: User) -> dict[str, Any]:
    from backend.core.dds_cycle import get_dds_session_state

    session, lesson = await locked_context(db, session_id, user)
    data = deepcopy(session.dynamic_state["dds"])
    if session.status == "COMPLETED":
        if data.get("stop_reason") == "teacher" or (data.get("stopped_at") and not data.get("stop_reason")):
            raise HTTPException(409, detail={"code": "DDS_SESSION_NOT_ACTIVE"})
        return await get_dds_session_state(session_id, user, db)
    if lesson.status != "ACTIVE" or session.status != "ACTIVE":
        raise HTTPException(409, detail={"code": "DDS_SESSION_NOT_ACTIVE"})
    now = datetime.now(timezone.utc)
    session.status, session.end_time = "COMPLETED", now
    if lesson.card_pool_source == "self_training":
        lesson.status, lesson.completed_at = "COMPLETED", now
    data.update(stopped_at=now.isoformat(), stop_reason="cadet", submitted_at=None)
    from backend.core.dds_exercise import finalize_result
    await finalize_result(db, session, data, "incomplete")
    card = await db.get(IncidentCard, data.get("card_id"))
    if card:
        card.status = "Не завершено"
    store_state(session, data)
    await db.commit()
    return await get_dds_session_state(session_id, user, db)


async def start_training(db: AsyncSession, payload: DDSTrainingStartPayload, user: User) -> dict[str, Any]:
    from backend.core.dds_cycle import get_dds_session_state

    if user.role != "CADET":
        raise HTTPException(403, "Self-training requires a cadet")
    # Serialize retries for this user, not all users, including first insertion.
    await db.execute(text("UPDATE users SET is_active = is_active WHERE user_id = :uid"), {"uid": user.user_id})
    sessions = (await db.scalars(select(ExamSession).join(Assignment).where(
        ExamSession.cadet_id == user.user_id, Assignment.card_pool_source == "self_training"))).all()
    for session in sessions:
        data = (session.dynamic_state or {}).get("dds", {})
        if data.get("start_request_id") == payload.request_id:
            if [item["ticket_id"] for item in data["queue"]] != payload.ticket_ids:
                raise HTTPException(409, detail={"code": "DDS_REQUEST_CONFLICT"})
            return await get_dds_session_state(session.session_id, user, db)
    pool = await load_pool(db, payload.ticket_ids, training=True)
    now = datetime.now(timezone.utc)
    lesson = Assignment(cadet_id=user.user_id, target_role="DISPATCHER_DDS", status="ACTIVE",
                        scenario_id=payload.ticket_ids[0], card_pool_ids=payload.ticket_ids,
                        card_pool_source="self_training", started_at=now)
    db.add(lesson)
    await db.flush()
    session = ExamSession(assignment_id=lesson.assignment_id, cadet_id=user.user_id,
                          ticket_id=payload.ticket_ids[0], session_type="CARD_ACTIONS", status="ACTIVE", start_time=now)
    db.add(session)
    await db.flush()
    await initialize_queue(db, session, pool, now)
    data = deepcopy(session.dynamic_state["dds"])
    data["start_request_id"] = payload.request_id
    store_state(session, data)
    await db.commit()
    return await get_dds_session_state(session.session_id, user, db)


def queue_ticket_details(session, evaluations, results):
    """One honest detail per queue entry, including unreceived/ungraded cards."""
    from backend.core.dds_cycle import get_session_score
    from backend.schemas.lessons import CadetTicketDetail

    data = session.dynamic_state["dds"]
    archives = {item["ticket_id"]: item for item in archived_cards(data)}
    details = []
    for index, item in enumerate(data["queue"]):
        ticket_id = item["ticket_id"]
        saved = archives.get(ticket_id)
        current = index == data["current_index"] and not saved
        card_id = saved["card_id"] if saved else data["card_id"] if current else None
        actions = saved["actions"] if saved else data["actions"] if current else []
        evs = [ev for ev in evaluations if card_id and ev.card_id == card_id]
        trs = [result for result in results if result.ticket_id == ticket_id]
        score = get_session_score(evs, trs)
        graded = [result for result in trs if result.status in ("completed", "evaluated")]
        status = ("failed" if any(not result.is_passed for result in graded) else "passed") if graded else (
            "ungraded" if saved else "in_progress" if current and session.status == "ACTIVE" else
            "incomplete" if session.status == "COMPLETED" else "pending")
        errors = []
        for source in [ev.errors_list for ev in evs] + [result.error_details for result in trs]:
            if isinstance(source, list):
                for error in source:
                    message = str(error.get("message") or error) if isinstance(error, dict) else str(error)
                    if message not in errors:
                        errors.append(message)
        completed = saved.get("card_submitted_at") if saved else None
        details.append(CadetTicketDetail(ticket_id=ticket_id,
            title=item.get("title") or f"Билет #{ticket_id[:8]}",
            card_id=card_id, status=status, score=score, errors_count=len(errors), errors=errors,
            actions=actions, completed_at=datetime.fromisoformat(completed) if completed else None))
    return details
