"""Prepared DDS calls and evidence-based criteria. No background worker or LLM."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import re
import uuid
from backend.schemas.dds_exercise import ExercisePlan, STAGES
from backend.core.dds_service_policy import allowed_statuses

MESSAGES = {
    "wrong_service": "Доклад относится к другой службе. Статус не изменён.",
    "premature": "Нет принятого доклада, подтверждающего этот этап.",
    "wrong_stage": "Выбранный статус не соответствует принятому докладу.",
    "record_accuracy": "Проверьте исполнителя, номер бригады и существенные сведения сообщения.",
    "unknown_number": "Условный номер отсутствует в справочнике. Соединения нет.",
    "wrong_contact": "Контакт другой службы не подтверждает передачу задания выбранной бригаде.",
    "call_required": "Сначала позвоните исполнителю выбранной службы.",
    "completion": "Карточка ещё не готова: обработайте доклады и завершите работу служб.",
    "transition": "Переход из текущего статуса недоступен.",
    "refusal": "Для отказа необходимо указать причину.",
    "report_note": "Запишите услышанный доклад: ФИО, должность, номер бригады и этап работ.",
}


def now_utc():
    return datetime.now(timezone.utc)


def parse_time(value):
    value = datetime.fromisoformat(value)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def norm(value):
    return " ".join(re.findall(r"\w+", (value or "").casefold().replace("ё", "е")))


def contains(text, keywords):
    return all(norm(word) in norm(text) for word in keywords)


def validated_plan(raw, services):
    plan = ExercisePlan.model_validate(raw).model_dump()
    if {c["service_name"] for c in plan["contacts"]} != set(services):
        raise ValueError("Exercise contacts must cover exactly the card services")
    return plan


def initialize(plan, card_id, at):
    if not plan:
        return None
    return {"plan": deepcopy(plan), "index": 0, "due_at": None, "accepted": None,
            "outgoing": {}, "events": [{"id": str(uuid.uuid4()), "kind": "received", "at": at,
                                         "card_id": card_id}], "requests": []}


def event(exercise, kind, at, card_id, **extra):
    item = {"id": str(uuid.uuid4()), "kind": kind, "at": at, "card_id": card_id, **extra}
    exercise["events"].append(item)
    return item


def current(exercise):
    reports = exercise["plan"]["reports"]
    index = exercise["index"]
    return reports[index] if index < len(reports) else None


def contact_for(exercise, report):
    return next(c for c in exercise["plan"]["contacts"] if c["id"] == report["contact_id"])


def skip_refused(data, at):
    ex = data["exercise"]
    while (report := current(ex)) and contact_for(ex, report)["service_name"] in ex.get("refused_services", []):
        event(ex, "report_skipped", at, data["card_id"], report_id=report["id"],
              service_name=contact_for(ex, report)["service_name"], reason="refusal")
        ex.update(index=ex["index"] + 1, accepted=None, due_at=None)


def schedule(data, at):
    ex = data.get("exercise")
    if not ex:
        return
    skip_refused(data, at)
    if ex["due_at"] or ex["accepted"]:
        return
    report = current(ex)
    if not report:
        return
    contact = contact_for(ex, report)
    if any(a.get("kind") == "dispatch" and a["service_name"] == contact["service_name"] for a in data["actions"]):
        ex["due_at"] = (parse_time(at) + timedelta(seconds=3)).isoformat()
        event(ex, "incoming_scheduled", at, data["card_id"], report_id=report["id"],
              service_name=contact["service_name"], due_at=ex["due_at"])


def action_issue(data, payload, service_status):
    ex = data["exercise"]
    if payload.kind == "dispatch":
        call = ex["outgoing"].get(payload.service_name)
        if not call:
            return "call_required"
        contact = next(c for c in ex["plan"]["contacts"] if c["id"] == call["contact_id"])
        if not contains(payload.who_accepted, [contact["full_name"], contact["position"]]) or not contains(payload.summary, contact["dispatch_keywords"]):
            return "record_accuracy"
        if service_status != "Принята":
            return "transition"
        return None
    if payload.status in ("Не принята", "Отказ от выполнения работ"):
        if not (payload.comment or "").strip():
            return "refusal"
        return None if payload.status in allowed_statuses(service_status) else "transition"
    if payload.status == "Принята":
        return None if "Принята" in allowed_statuses(service_status) and payload.service_name not in ex.get("refused_services", []) else "transition"
    report = current(ex)
    if not report or ex["accepted"] != report["id"]:
        return "premature"
    contact = contact_for(ex, report)
    if payload.service_name != contact["service_name"]:
        return "wrong_service"
    if payload.status != report["status"]:
        return "wrong_stage"
    if payload.status not in allowed_statuses(service_status):
        return "transition"
    if ex["plan"].get("presentation") == "audio_only":
        note = ex.get("notes", {}).get(report["id"], "")
        number = norm(contact["brigade"])
        spoken_number = {"1": "один", "2": "два", "3": "три", "4": "четыре"}.get(number, number)
        heard_number = any(f" {value} " in f" {norm(note)} " for value in (number, spoken_number))
        if not heard_number or not contains(note, [contact["full_name"], contact["position"], report["status"]]):
            return "report_note"
    if norm(payload.order_number) != norm(contact["brigade"]) or not contains(payload.comment, report["comment_keywords"]):
        return "record_accuracy"
    return None


def accepted_action(data, payload, at):
    ex = data.get("exercise")
    if not ex:
        return
    event(ex, "action", at, data["card_id"], service_name=payload.service_name,
          action=payload.model_dump(exclude_none=True))
    if payload.kind == "status" and payload.status in ("Не принята", "Отказ от выполнения работ"):
        ex.setdefault("refused_services", []).append(payload.service_name)
    if payload.kind == "status" and payload.status in STAGES:
        report = current(ex)
        answered = next(e for e in reversed(ex["events"]) if e["kind"] == "answered" and e["report_id"] == report["id"])
        event(ex, "report_processed", at, data["card_id"], report_id=report["id"],
              service_name=payload.service_name,
              delay_seconds=max(0, (parse_time(at) - parse_time(answered["at"])).total_seconds()))
        ex.update(index=ex["index"] + 1, accepted=None, due_at=None)
    schedule(data, at)


def criteria(data, closed=False):
    ex = data.get("exercise")
    keys = [("confirmation", "Первичное подтверждение за 30 секунд"), ("service", "Соответствие службе"),
            ("stage", "Соответствие этапу"), ("accuracy", "Точность записей"), ("completion", "Завершение")]
    if not ex:
        return [{"key": key, "label": label, "status": "not_evaluated", "evidence": []} for key, label in keys]
    events = ex["events"]
    failures = [e for e in events if e["kind"] == "mistake"]
    groups = {"service": {"wrong_service", "wrong_contact"},
              "stage": {"premature", "wrong_stage", "transition", "call_required", "refusal"},
              "accuracy": {"record_accuracy", "unknown_number", "report_note"},
              "completion": {"completion"}}
    confirmations = []
    for name in dict.fromkeys(c["service_name"] for c in ex["plan"]["contacts"]):
        action = next((a for a in data["actions"] if a["kind"] == "status" and a["service_name"] == name and a.get("status") in ("Принята", "Не принята")), None)
        confirmations.append({"service_name": name, "seconds": max(0, (parse_time(action["at"]) - parse_time(data["received_at"])).total_seconds()) if action and action.get("at") and data.get("received_at") else None})
    result = []
    finished = ex["index"] == len(ex["plan"]["reports"])
    for key, label in keys:
        evidence = [e for e in failures if e.get("reason") in groups.get(key, set())]
        done = finished
        if key == "confirmation":
            done = all(item["seconds"] is not None and item["seconds"] <= 30 for item in confirmations)
            evidence = confirmations
        state = "completed_after_correction" if done and evidence and key != "confirmation" else "completed" if done else "not_completed" if closed or key == "confirmation" and any(item["seconds"] is not None and item["seconds"] > 30 for item in confirmations) else "not_evaluated"
        if ex.get("refused_services") and key in ("service", "stage", "accuracy"):
            state = "not_evaluated"
        result.append({"key": key, "label": label, "status": state, "evidence": evidence})
    return result


def projection(data, editable):
    ex = data.get("exercise")
    result = {"exercise": None, "criteria": data.get("criteria") or criteria(data, closed=not editable), "last_attempt": None}
    if not ex:
        return result
    report = current(ex)
    audio_only = ex["plan"].get("presentation") == "audio_only"
    def public_contact(contact):
        return contact_public(contact, hide_identity=audio_only)
    ringing = bool(editable and report and ex["due_at"] and not ex["accepted"] and now_utc() >= parse_time(ex["due_at"]))
    incoming = None
    if report and (ringing or ex["accepted"]):
        contact = contact_for(ex, report)
        incoming = {"id": report["id"], "contact": public_contact(contact), "ringing": ringing,
                    "text": report["text"] if ex["accepted"] and not audio_only else None,
                    "audio": report.get("audio") if ex["accepted"] else None}
    events, outgoing = deepcopy(ex["events"]), deepcopy(ex["outgoing"])
    if audio_only:
        for item in [*events, *outgoing.values()]:
            item["text"] = None
            if item.get("contact"):
                item["contact"] = public_contact(item["contact"])
    last = ex["requests"][-1] if ex["requests"] else None
    result.update(exercise={"source": "prepared", "presentation": ex["plan"].get("presentation", "text_audio"),
                            "notes": deepcopy(ex.get("notes", {})),
                            "contacts": [public_contact(c) for c in ex["plan"]["contacts"]],
                            "incoming": incoming, "due_at": ex["due_at"] if editable else None,
                            "events": events, "outgoing": outgoing,
                            "refused_services": ex.get("refused_services", []),
                            "processed_reports": ex["index"] - sum(e["kind"] == "report_skipped" for e in ex["events"]), "total_reports": len(ex["plan"]["reports"])},
                  last_attempt={"request_id": last["payload"]["request_id"], "accepted": last["accepted"],
                                "reason": last.get("reason"), "message": MESSAGES.get(last.get("reason"), "")} if last else None)
    return result


def contact_public(contact, hide_identity=False):
    return {key: "" if hide_identity and key in ("full_name", "position", "brigade") else contact[key]
            for key in ("id", "service_name", "number", "full_name", "position", "brigade")}


async def finalize_result(db, session, data, status):
    """Persist criterion evidence and the real error count, without inventing scores."""
    if not data.get("exercise"):
        return
    from sqlalchemy import select
    from backend.models.domain_04 import TicketResult
    data["criteria"] = criteria(data, closed=True)
    mistakes = [e for e in data["exercise"]["events"] if e["kind"] == "mistake"]
    result = await db.scalar(select(TicketResult).where(TicketResult.session_id == session.session_id,
                                                       TicketResult.ticket_id == session.ticket_id))
    if result is None:
        result = TicketResult(session_id=session.session_id, ticket_id=session.ticket_id, status=status)
        db.add(result)
    result.errors_count = len(mistakes)
    result.error_details = {**(result.error_details or {}), "dds_criteria": deepcopy(data["criteria"]),
                            "dds_mistakes": deepcopy(mistakes)}
