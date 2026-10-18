"""Service action policy, shared by validation and the saved-session UI contract."""
from typing import Any


PROGRESS = ("Принята", "Начало реагирования", "Прибытие", "Проведение работ", "Работы завершены")
REFUSALS = {"Не принята", "Отказ от выполнения работ"}
TERMINAL = {"Работы завершены", "Отказ от выполнения работ", "Отказ"}
# Read old snapshots without rewriting their status or recorded history.
ALIASES = {"Получена слу...": "Получена службой", "В пути": "Начало реагирования", "Прибыли": "Прибытие",
           "Завершена": "Работы завершены", "Завершение работ без бригады": "Работы завершены"}
INITIAL = {"Добавлена", "Получена службой", "В обработке", "Направлена"}


def canonical_status(value: str) -> str:
    return ALIASES.get(value, value)


def allowed_statuses(current: str) -> list[str]:
    current = canonical_status(current)
    if current in INITIAL:
        return ["Принята", "Не принята"]
    if current == "Не принята":
        return ["Принята"]
    if current in TERMINAL or current not in PROGRESS:
        return []
    # Stages are consecutive; a repeated stage only supplements its history.
    index = PROGRESS.index(current)
    return [PROGRESS[index + 1], "Отказ от выполнения работ", current]


def current_service_statuses(incoming: dict, assigned: dict, actions: list[dict]) -> dict[str, str]:
    """Project real actions over the immutable snapshot, matching the client view."""
    statuses = {s["name"]: s.get("status", "Получена службой")
                for s in incoming.get("services", []) if isinstance(s, dict) and s.get("name")}
    for name, metadata in assigned.items():
        if name not in statuses and isinstance(metadata, dict):
            statuses[name] = metadata.get("status", "Получена службой")
    for action in actions:
        if action.get("kind") == "status" and action.get("status") and action.get("service_name") in statuses:
            statuses[action["service_name"]] = action["status"]
    return statuses


def action_error(current: str, payload: Any) -> tuple[int, str] | None:
    """Run after idempotency lookup and under the assignment transaction lock."""
    current = canonical_status(current)
    if payload.kind == "dispatch":
        if payload.status is not None:
            return 422, "DDS_DISPATCH_STATUS_FORBIDDEN"
        if current not in PROGRESS[:-1]:
            return 409, "DDS_SERVICE_NOT_DISPATCHABLE"
        return None
    if payload.status in REFUSALS and not (payload.comment or "").strip():
        return 422, "DDS_REFUSAL_REASON_REQUIRED"
    # Legacy aliases are readable; new actions use the methodological names.
    if payload.status not in allowed_statuses(current):
        return 409, "DDS_SERVICE_TRANSITION_FORBIDDEN"
    if payload.status == current and not (payload.comment or "").strip():
        return 422, "DDS_STATUS_COMMENT_REQUIRED"
    return None
