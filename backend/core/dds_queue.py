from backend.core.report_runtime import learning_priority
"""Persisted sequential DDS exercises. Queue snapshots never leave the server."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.student_workspace import lock_cadets
from backend.core.dds_service_policy import canonical_status, current_service_statuses, WITHOUT_BRIGADE
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_01 import User
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult
from backend.schemas.dds_cycle import DDSTrainingStartPayload


def available_for_training(ticket: ScenarioTicket) -> bool:
    # Unmarked legacy material remains usable; explicitly unpublished drafts do not.
    return (ticket.workflow_state or {}).get("status") in (None, "", "active", "published", "APPROVED")


async def load_pool(db: AsyncSession, ticket_ids: list[str], *, training: bool = False) -> list[dict[str, Any]]:
    from backend.core.dds_cycle import incoming_card_from_ticket, is_suitable_dds_ticket, extract_dds_ticket_metadata
    from backend.core.ticket_lifecycle import is_approved_dds_ticket

    if not ticket_ids or len(set(ticket_ids)) != len(ticket_ids):
        raise HTTPException(422, detail={"code": "DDS_INVALID_POOL"})
    tickets = {ticket.scenario_id: ticket for ticket in (await db.scalars(
        select(ScenarioTicket).where(ScenarioTicket.scenario_id.in_(ticket_ids))
    )).all()}
    pool = []
    for ticket_id in ticket_ids:
        ticket = tickets.get(ticket_id)
        if (not is_suitable_dds_ticket(ticket)
                or (training and not available_for_training(ticket))
                or (not training and not is_approved_dds_ticket(ticket))):
            raise HTTPException(409, detail={"code": "DDS_TICKET_UNAVAILABLE"})
        from backend.core.dds_exercise import validated_plan
        from backend.core.dds_phone_catalog import default_phone_plan
        incoming = incoming_card_from_ticket(ticket)
        raw_plan = (ticket.content or {}).get("dds_exercise")
        try:
            services = [s["name"] for s in incoming["services"]]
            plan = validated_plan(raw_plan, services) if raw_plan else default_phone_plan(services)
        except ValueError as exc:
            raise HTTPException(422, "Invalid DDS exercise plan") from exc
        pool.append({"exercise_plan": plan, "ticket_id": ticket_id, "title": extract_dds_ticket_metadata(ticket)[3],
                     "incoming_card": incoming, "gradebook_snapshot": {"ticket_id": ticket_id, "title": ticket.title or extract_dds_ticket_metadata(ticket)[3], "etalon": deepcopy(ticket.ground_truth or {}), "incoming_card": deepcopy(incoming)}})
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
    state = deepcopy(session.dynamic_state)
    state["_gradebook_snapshots"] = {item["ticket_id"]: deepcopy(item["gradebook_snapshot"])
                                    for item in pool if item.get("gradebook_snapshot")}
    session.dynamic_state = state
    flag_modified(session, "dynamic_state")


def completion_blockers(data: dict[str, Any], assigned: dict[str, Any]) -> list[dict[str, str]]:
    incoming, actions = data.get("incoming_card", {}), data.get("actions", [])
    statuses = current_service_statuses(incoming, assigned, actions)
    blockers = []
    ex = data.get("exercise")
    from backend.core.dds_phone_v2 import finished as finished_v2
    if ex and not (finished_v2(ex) if ex.get("version") == 2 else ex["index"] == len(ex["plan"]["reports"])):
        blockers.append({"code": "DDS_REPORTS_PENDING", "service_name": ""})
    if not statuses:
        return [{"code": "DDS_NO_SERVICES", "service_name": ""}]
    for name, raw in statuses.items():
        current = canonical_status(raw)
        matching = [action for action in actions if action.get("service_name") == name]
        if current in ("Не принята", "Отказ", "Отказ от выполнения работ", WITHOUT_BRIGADE):
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
        if data.get("stop_reason") == "exam_timeout":
            raise HTTPException(409, detail={"code": "DDS_EXAM_TIME_EXPIRED", "message": "Время выполнения экзамена истекло"})
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
    now = datetime.now(timezone.utc)
    if (lesson.mode or "").upper() == "EXAM":
        from backend.core.dds_cycle import _card_started_at
        limit = (
            session.time_limit_seconds
            if (session.time_limit_seconds and session.time_limit_seconds > 0)
            else (
                lesson.time_limit_seconds
                if (lesson and lesson.time_limit_seconds and lesson.time_limit_seconds > 0)
                else 30
            )
        )
        start_dt = _card_started_at(session, data)
        if start_dt is not None:
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
        else:
            start_dt = now
        if now > (start_dt + timedelta(seconds=limit)):
            session.status, session.end_time = "COMPLETED", now
            data["timed_out"] = True
            data["time_exceeded_seconds"] = max(1, int((now - (start_dt + timedelta(seconds=limit))).total_seconds()))
            data["stopped_at"] = now.isoformat()
            data["stop_reason"] = "exam_timeout"
            data["submitted_at"] = None
            if card.status != "Отработана":
                card.status = "Не завершено"
            store_state(session, data)
            await db.commit()
            raise HTTPException(409, detail={"code": "DDS_EXAM_TIME_EXPIRED", "message": "Время выполнения экзамена истекло"})
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
    async with learning_priority():
        # Serialize retries for this user, not all users, including first insertion.
        await lock_cadets(db, [user.user_id])
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
    from backend.core.gradebook_records import latest_evaluation, resolve_attempt_score_and_status
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
        result = max(trs, key=lambda value: (bool(value.is_appealed), str(value.updated_at or value.created_at), value.result_id), default=None)
        score, passed, saved_status, _, _ = resolve_attempt_score_and_status(None, result, latest_evaluation(evs))
        status = saved_status if (score is not None or isinstance(passed, bool)) else (
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
            card_id=card_id, record_id=result.result_id if result else card_id, session_id=session.session_id,
            status=status, score=score, errors_count=len(errors), errors=errors,
            actions=actions, completed_at=datetime.fromisoformat(completed) if completed else None))
    return details
