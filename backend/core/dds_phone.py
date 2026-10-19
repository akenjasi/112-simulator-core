"""Transactional phone commands; all state and timing belong to the server."""
from copy import deepcopy
from fastapi import HTTPException
from backend.core import dds_exercise as training
from backend.core.dds_queue import locked_context, store_state
from backend.core.dds_service_policy import current_service_statuses
from backend.models.domain_04 import IncidentCard


def retry(exercise, payload):
    saved = next((r for r in exercise["requests"] if r["payload"]["request_id"] == payload["request_id"]), None)
    if saved and saved["payload"] != payload:
        raise HTTPException(409, detail={"code": "DDS_REQUEST_CONFLICT"})
    return saved


def record(data, payload, at, reason=None):
    ex = data["exercise"]
    entry = {"payload": payload, "accepted": reason is None, "reason": reason}
    ex["requests"].append(entry)
    if reason:
        training.event(ex, "mistake", at, data["card_id"], service_name=payload.get("service_name"),
                       reason=reason, message=training.MESSAGES.get(reason, "Карточка ещё не готова к завершению."),
                       action=payload)
    return entry


async def phone_command(db, session_id, payload, user):
    from backend.core.dds_cycle import get_dds_session_state
    session, lesson = await locked_context(db, session_id, user)
    data = deepcopy(session.dynamic_state["dds"])
    ex = data.get("exercise")
    wire = payload.model_dump(exclude_none=True)
    saved = saved_request(data, wire)
    if saved:
        result = await get_dds_session_state(session_id, user, db)
        result["last_attempt"] = attempt_result(saved)
        return result
    if not ex:
        raise HTTPException(409, detail={"code": "DDS_NO_EXERCISE"})
    if payload.card_id != data["card_id"]:
        raise HTTPException(409, detail={"code": "DDS_CARD_NOT_CURRENT"})
    if session.status != "ACTIVE" or lesson.status != "ACTIVE" or data.get("submitted_at"):
        raise HTTPException(409, detail={"code": "DDS_SESSION_NOT_ACTIVE"})
    at = training.now_utc().isoformat()
    reason = None
    if payload.operation == "dial":
        card = await db.get(IncidentCard, data["card_id"])
        statuses = current_service_statuses(data["incoming_card"], card.assigned_services or {}, data["actions"])
        if payload.service_name not in statuses:
            raise HTTPException(422, "Unknown card service")
        contact = next((c for c in ex["plan"]["contacts"] if c["number"] == payload.number), None)
        if not contact:
            reason = "unknown_number"
        elif contact["service_name"] != payload.service_name:
            reason = "wrong_contact"
        elif statuses[payload.service_name] != "Принята":
            reason = "transition"
        elif any(a["kind"] == "dispatch" and a["service_name"] == payload.service_name for a in data["actions"]):
            raise HTTPException(409, "Assignment already transmitted; use the received report history")
        else:
            call = training.event(ex, "dialed", at, data["card_id"], service_name=payload.service_name,
                                  contact_id=contact["id"], number=contact["number"],
                                  text=contact["reply"], audio=contact.get("audio"))
            ex["outgoing"][payload.service_name] = {"contact_id": contact["id"], "call_id": call["id"],
                                                   "text": contact["reply"], "audio": contact.get("audio")}
    elif payload.operation == "answer":
        report = training.current(ex)
        if (not report or report["id"] != payload.report_id or ex["accepted"]
                or not ex["due_at"] or training.now_utc() < training.parse_time(ex["due_at"])):
            raise HTTPException(409, detail={"code": "DDS_CALL_NOT_RINGING"})
        contact = training.contact_for(ex, report)
        training.event(ex, "answered", at, data["card_id"], report_id=report["id"],
                       available_at=ex["due_at"], service_name=contact["service_name"],
                       contact=training.contact_public(contact), text=report["text"], audio=report.get("audio"))
        ex["accepted"] = report["id"]
    elif payload.operation == "note":
        report = training.current(ex)
        if not report or report["id"] != payload.report_id or ex["accepted"] != report["id"]:
            raise HTTPException(409, detail={"code": "DDS_REPORT_NOT_ACCEPTED"})
        ex.setdefault("notes", {})[report["id"]] = payload.note
        training.event(ex, "note", at, data["card_id"], report_id=report["id"], note=payload.note,
                       service_name=training.contact_for(ex, report)["service_name"])
    else:
        call = next((e for e in ex["events"] if e["id"] == payload.call_id and e["kind"] in ("answered", "dialed")), None)
        if not call or not call.get("audio"):
            raise HTTPException(422, "No audio asset for this call")
        training.event(ex, "audio", at, data["card_id"], call_id=call["id"], result=payload.audio_result)
    record(data, wire, at, reason)
    store_state(session, data)
    await db.commit()
    return await get_dds_session_state(session_id, user, db)


def attempt_result(saved):
    return {"request_id": saved["payload"]["request_id"], "accepted": saved["accepted"],
            "reason": saved.get("reason"), "message": training.MESSAGES.get(saved.get("reason"), "")}


def saved_request(data, payload):
    for item in [data, *data.get("completed_cards", [])]:
        if item.get("exercise"):
            saved = retry(item["exercise"], payload)
            if saved:
                return saved
    return None
