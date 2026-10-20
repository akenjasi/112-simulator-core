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
    "phone_busy": "Сначала запишите и зарегистрируйте текущий принятый доклад.",
    "result_comment": "Укажите результат работ в комментарии перед завершением.",
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



# Closed vocabulary for the prepared phone stages. This is a rule check, not a
# semantic grade: accepted affirmative formulations must not require the literal
# label from the status menu to appear in the trainee's free-text note.
STAGE_RECORD_PHRASES = {
    "Начало реагирования": ("выехала", "выехали", "выехал"),
    "Прибытие": ("прибыла", "прибыли", "прибыл", "на месте происшествия"),
    "Проведение работ": ("приступила к работам", "приступили к работам", "приступил к работам"),
    "Работы завершены": ("работы закончены", "задача выполнена"),
}


def records_stage(note, stage):
    phrases = (stage, *STAGE_RECORD_PHRASES.get(stage, ()))
    for sentence in re.split(r"[.!?;\n]+", note or ""):
        value = norm(sentence)
        # Do not turn an explicitly negated action into a confirmed stage.
        if "не" in value.split():
            continue
        if any(f" {norm(phrase)} " in f" {value} " for phrase in phrases):
            return True
    return False


def validated_plan(raw, services):
    plan = ExercisePlan.model_validate(raw).model_dump()
    if {c["service_name"] for c in plan["contacts"]} != set(services):
        raise ValueError("Exercise contacts must cover exactly the card services")
    if plan["version"] == 2:
        plan["contacts"].sort(key=lambda c: services.index(c["service_name"]))
    return plan


def initialize(plan, card_id, at):
    if not plan:
        return None
    if plan.get("version") == 2:
        from backend.core import dds_phone_v2
        result = dds_phone_v2.initialize(plan, card_id, at)
        event(result, "received", at, card_id)
        return result
    return {"plan": deepcopy(plan), "index": 0, "due_at": None, "accepted": None,
            "outgoing": {}, "events": [{"id": str(uuid.uuid4()), "kind": "received", "at": at,
                                         "card_id": card_id}], "requests": []}


def event(exercise, kind, at, card_id, **extra):
    item = {"id": str(uuid.uuid4()), "kind": kind, "at": at, "card_id": card_id, **extra}
    exercise["events"].append(item)
    return item


def current(exercise):
    if exercise.get("version") == 2:
        from backend.core.dds_phone_v2 import current as current_v2
        return current_v2(exercise)
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
    if ex.get("version") == 2:
        from backend.core.dds_phone_v2 import refresh_due
        refresh_due(ex)
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
    if data["exercise"].get("version") == 2:
        from backend.core.dds_phone_v2 import action_issue as issue_v2
        return issue_v2(data, payload, service_status)
    ex = data["exercise"]
    if payload.kind == "dispatch":
        call = ex["outgoing"].get(payload.service_name)
        if not call:
            return "call_required"
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
        if not note.strip():
            return "report_note"
    return None


def accuracy_issues(data, payload):
    """Assess written content without rejecting the trainee's action or changing it."""
    ex = data["exercise"]
    issues = []
    if payload.kind == "dispatch":
        contact = next(c for c in ex["plan"]["contacts"]
                       if c["id"] == ex["outgoing"][payload.service_name]["contact_id"])
        if not contains(payload.who_accepted, [contact["full_name"]]):
            issues.append("В телефонограмме неверно записано ФИО исполнителя.")
        if not contains(payload.who_accepted, [contact["position"]]):
            issues.append("В телефонограмме неверно записана или пропущена должность исполнителя.")
        if not contains(payload.summary, contact["dispatch_keywords"]):
            issues.append("В сути телефонограммы не отражены существенные сведения ответа службы.")
        return issues
    if payload.status not in STAGES:
        return issues
    report = current(ex)
    contact = contact_for(ex, report)
    if ex["plan"].get("presentation") == "audio_only":
        note = ex.get("notes", {}).get(report["id"], "")
        number = norm(contact["brigade"])
        spoken_number = {"1": "один", "2": "два", "3": "три", "4": "четыре"}.get(number, number)
        if not contains(note, [contact["full_name"]]):
            issues.append("В записи доклада неверно записано ФИО докладчика.")
        if not contains(note, [contact["position"]]):
            issues.append("В записи доклада неверно записана или пропущена должность докладчика.")
        if not any(f" {value} " in f" {norm(note)} " for value in (number, spoken_number)):
            issues.append("В записи доклада неверно указан или пропущен номер бригады.")
        if not records_stage(note, report["status"]):
            issues.append("В записи доклада неверно отражён или пропущен этап работ.")
    if norm(payload.order_number) != norm(contact["brigade"]):
        issues.append("В статусе службы указан неверный номер бригады.")
    result_matches = contains(payload.comment, report["comment_keywords"])
    if [norm(word) for word in report["comment_keywords"]] == ["задача выполнена"]:
        result_matches = result_matches or records_stage(payload.comment, "Работы завершены")
    if not result_matches:
        issues.append("В комментарии к статусу не отражён результат работ из доклада.")
    return issues


def accepted_action(data, payload, at):
    ex = data.get("exercise")
    if not ex:
        return
    if ex.get("version") == 2:
        from backend.core.dds_phone_v2 import accepted_action as accepted_v2
        return accepted_v2(data, payload, at)
    issues = accuracy_issues(data, payload)
    if issues:
        report = current(ex) if payload.kind == "status" else None
        action = payload.model_dump(exclude_none=True)
        if report and ex["plan"].get("presentation") == "audio_only":
            action["note"] = ex.get("notes", {}).get(report["id"], "")
        event(ex, "mistake", at, data["card_id"], service_name=payload.service_name,
              reason="record_accuracy", blocking=False, message=" ".join(issues),
              report_id=report["id"] if report else None,
              action=action)
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
        action = next((a for a in data["actions"] if a["kind"] == "status" and a["service_name"] == name and a.get("status") in ("Принята", "Не принята", "Работы завершены: Завершение работ без бригады")), None)
        confirmations.append({"service_name": name, "seconds": max(0, (parse_time(action["at"]) - parse_time(data["received_at"])).total_seconds()) if action and action.get("at") and data.get("received_at") else None})
    result = []
    from backend.core.dds_phone_v2 import finished as finished_v2
    finished = finished_v2(ex) if ex.get("version") == 2 else ex["index"] == len(ex["plan"]["reports"])
    for key, label in keys:
        evidence = [e for e in failures if e.get("reason") in groups.get(key, set())]
        done = finished
        if key == "confirmation":
            done = all(item["seconds"] is not None and item["seconds"] <= 30 for item in confirmations)
            evidence = confirmations
        state = "completed_after_correction" if done and evidence and key != "confirmation" else "completed" if done else "not_completed" if closed or key == "confirmation" and any(item["seconds"] is not None and item["seconds"] > 30 for item in confirmations) else "not_evaluated"
        if key == "accuracy" and any(e.get("blocking") is False for e in evidence):
            state = "not_completed"
        refused = ex.get("refused_services") or (ex.get("version") == 2 and any(p["paused"] or p["terminal"] and p["index"] < 4 for p in ex["services"].values()))
        if refused and key in ("service", "stage", "accuracy"):
            state = "not_completed" if ex.get("version") == 2 and evidence else "not_evaluated"
        result.append({"key": key, "label": label, "status": state, "evidence": evidence})
    return result


def projection(data, editable):
    ex = data.get("exercise")
    result = {"exercise": None, "criteria": data.get("criteria") or criteria(data, closed=not editable), "last_attempt": None}
    from backend.core.dds_assessment import assess
    result["assessment"] = assess(data, result["criteria"], editable)
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
    outgoing_report = bool(ex.get("version") == 2 and incoming and any(c.get("report_id") == incoming["id"] for c in outgoing.values()))
    if incoming:
        incoming["direction"] = "outgoing" if outgoing_report else "incoming"
    result.update(exercise={"version": ex.get("version", 1), "service_progress": deepcopy(ex.get("services", {})), "source": "prepared", "presentation": ex["plan"].get("presentation", "text_audio"),
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
