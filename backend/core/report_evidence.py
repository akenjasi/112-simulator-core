"""Frozen, attributable text pairs for local semantic review. Never read live tickets."""
import json


def card_text(card):
    """Keep incident facts; omit applicant identity, phone numbers and hidden metadata."""
    if not isinstance(card, dict):
        return ""
    selected = {key: card[key] for key in ("description", "statuses", "classification", "emergency") if key in card}
    if isinstance(card.get("caller"), dict) and card["caller"].get("address"):
        selected["incident_address"] = card["caller"]["address"]
    selected["services"] = [s.get("name") for s in card.get("services", []) if isinstance(s, dict)]
    return json.dumps(selected, ensure_ascii=False) if any(selected.values()) else ""


def etalon_text(etalon):
    if not isinstance(etalon, dict):
        return ""
    selected = {k: etalon[k] for k in ("address", "description", "plot", "category", "subcategory",
                "injured", "blocked", "services", "required_services") if k in etalon}
    return json.dumps(selected, ensure_ascii=False) if selected else ""


def collect_semantic_evidence(session):
    data = (session.dynamic_state or {}).get("dds", {})
    cards = list(data.get("completed_cards") or [])
    if data.get("card_id") and not any(c.get("card_id") == data["card_id"] for c in cards):
        cards.append(data)
    units, limits = [], []
    for card in cards:
        card_id = card.get("card_id")
        prefix = f"{session.session_id}/{card_id}"
        ex = card.get("exercise") or {}
        plan = ex.get("plan") or {}
        events = ex.get("events") or []
        contacts = {c["id"]: c for c in plan.get("contacts", [])}
        reports = {r["id"]: r for r in plan.get("reports", [])}
        ticket_id = card.get("ticket_id") or (session.ticket_id if card_id == data.get("card_id") else None)
        frozen = (session.dynamic_state or {}).get("_gradebook_snapshots", {}).get(ticket_id, {})
        context = {"card": {"ref": prefix + "/card", "text": card_text(card.get("incoming_card") or frozen.get("incoming_card"))},
                   "etalon": {"ref": prefix + "/etalon", "text": etalon_text(frozen.get("etalon"))}}
        context["limits"] = ["Устная передача задания и аудиоответ курсанта не записаны; проверяются только сохранённые тексты."]
        if not context["etalon"]["text"]:
            context["limits"].append("Содержательный эталон карточки в снимке отсутствует.")
        if not context["card"]["text"]:
            context["limits"].append("Исходная карточка в снимке отсутствует.")
        received = {e.get("report_id"): e for e in events
                    if e.get("kind") in ("dialed", "answered") and e.get("report_id")}
        processed = {}
        last_action = None
        for event in events:
            if event.get("kind") == "action":
                last_action = event
            elif event.get("kind") == "report_processed" and last_action:
                if last_action.get("service_name") == event.get("service_name"):
                    processed[event.get("report_id")] = last_action

        def add(task, key, expected_ref, expected, actual_ref, actual, service, at=None):
            if not expected or not actual.strip():
                limits.append(f"{prefix}, {service}: нет пары исходного доклада и сохранённого ответа ({task}).")
                return
            units.append({"comparison_id": prefix + "/" + key, "task": task,
                "session_id": session.session_id, "cadet_id": session.cadet_id, "card_id": card_id,
                "service": service, "at": at, "context": context,
                "expected": {"ref": expected_ref, "text": expected},
                "actual": {"ref": actual_ref, "text": actual}})

        # The first phone form records the received reply, NOT an audio recording
        # of the instruction spoken by the cadet. Never infer lost incident facts.
        for event_index, event in enumerate(events):
            action = event.get("action") or {}
            if event.get("kind") != "action" or action.get("kind") != "dispatch":
                continue
            service = action.get("service_name", "")
            call = next((e for e in reversed(events[:event_index])
                         if e.get("kind") == "dialed" and e.get("service_name") == service), {})
            contact = contacts.get(call.get("contact_id"), {})
            source = reports.get(call.get("report_id"), {})
            expected = call.get("text") or source.get("text") or contact.get("reply", "")
            actual = "\n".join(str(action.get(k) or "") for k in ("who_accepted", "summary"))
            add("dispatch", "dispatch/" + str(event.get("id")), prefix + "/event/" + str(call.get("id")),
                expected, prefix + "/event/" + str(event.get("id")), actual, service, event.get("at"))
        dispatch_reports = {c.get("report_id") for c in (ex.get("outgoing") or {}).values()}
        for report_id, note in (ex.get("notes") or {}).items():
            # In v2 this is already assessed from who_accepted + summary above.
            if ex.get("version") == 2 and report_id in dispatch_reports:
                continue
            report, delivery = reports.get(report_id, {}), received.get(report_id)
            contact = contacts.get(report.get("contact_id"), {})
            service = contact.get("service_name", "")
            if not delivery:
                limits.append(f"{prefix}, доклад {report_id}: получение доклада не подтверждено событием.")
                continue
            note_event = next((e for e in reversed(events) if e.get("kind") == "note" and e.get("report_id") == report_id), {})
            registered = processed.get(report_id, {})
            action = registered.get("action") or {}
            actual = str(note or "")
            if action:
                actual += "\nЗарегистрированный статус: " + str(action.get("status") or "")
                actual += "\nНомер бригады: " + str(action.get("order_number") or "")
                actual += "\nКомментарий: " + str(action.get("comment") or "")
            add("report", "report/" + report_id, prefix + "/event/" + str(delivery.get("id")),
                delivery.get("text") or report.get("text", ""),
                prefix + "/note/" + report_id, actual, service, note_event.get("at"))
        for report_id, delivery in received.items():
            if report_id not in (ex.get("notes") or {}) and report_id not in dispatch_reports:
                limits.append(f"{prefix}, доклад {report_id}: запись курсанта отсутствует; содержание не проверено.")
        if not ex:
            limits.append(f"{prefix}: телефонный протокол отсутствует; содержательное сопоставление невозможно.")
    if not cards:
        limits.append(f"Сессия {session.session_id}: снимки карточек и ответов отсутствуют.")
    return {"comparisons": units, "limitations": limits}
