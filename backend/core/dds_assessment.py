"""Immediate, deterministic feedback from the saved DDS protocol, without inference."""

RULES = {
    "confirmation": "Подтверждайте получение карточки каждой службой не позднее 30 секунд после её выдачи.",
    "service": "Перед звонком сверяйте службу и условный номер со справочником; регистрируйте доклад для соответствующей службы.",
    "stage": "Сначала примите и запишите доклад, затем зарегистрируйте подтверждённый им этап работ.",
    "accuracy": "Сверяйте ФИО, должность, номер бригады и содержание доклада с услышанным сообщением перед регистрацией этапа.",
    "completion": "Получите заключительные доклады служб и запишите результат работ перед закрытием карточки.",
}


def assess(data, checks, editable):
    """A read projection: no grades, teacher dependency, writes or future ticket data."""
    if not data.get("exercise"):
        return None
    finished = bool(data.get("card_submitted_at"))
    completed = sum(c["status"] == "completed" for c in checks)
    corrected = sum(c["status"] == "completed_after_correction" for c in checks)
    mistakes = sum(e["kind"] == "mistake" for e in data["exercise"]["events"])
    if editable:
        status = "in_progress"
    elif not finished:
        status = "incomplete"
    elif len(checks) != len(RULES) or any(c["status"] == "not_evaluated" for c in checks):
        status = "insufficient_data"
    elif completed == len(RULES) and not mistakes:
        status = "passed"
    else:
        status = "needs_review"
    recommendations = []
    for check in checks:
        key, value = check["key"], check["status"]
        if key not in RULES or value == "completed":
            continue
        evidence = check["evidence"]
        if key == "confirmation":
            evidence = [e for e in evidence if e.get("seconds") is None or e["seconds"] > 30]
        services = list(dict.fromkeys(e["service_name"] for e in evidence if e.get("service_name")))
        context = f" Службы: {', '.join(services)}." if services else ""
        if value == "completed_after_correction":
            text = "Критерий выполнен после исправления; ошибочные попытки сохранены. " + RULES[key]
        elif value == "not_evaluated" or (not finished and key not in ("confirmation", "completion") and not check["evidence"]):
            text = "Для итогового вывода по этому критерию недостаточно данных. " + RULES[key]
        else:
            text = RULES[key]
        recommendations.append({"criterion": key, "text": text + context})
    if not recommendations and status == "needs_review":
        recommendations.append({"criterion": "completion", "text": "Разберите сохранённые ошибочные попытки в журнале и повторите телефонный цикл без них."})
    return {
        "source": "rules", "version": 1, "status": status,
        "completed_criteria": completed, "corrected_criteria": corrected,
        "total_criteria": len(RULES), "mistakes_count": mistakes,
        "recommendations": recommendations,
    }
