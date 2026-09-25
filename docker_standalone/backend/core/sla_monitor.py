"""SLA calculation and service status update functions (Functional Core)."""

import copy
from datetime import datetime, timezone
from typing import Any, Dict


def calculate_sla_status(
    services: Dict[str, Any],
    current_time: datetime,
    timeout_sec: int = 30,
) -> Dict[str, Any]:
    """Calculate SLA overdue status for assigned services.

    For any service with status 'Добавлена', checks if elapsed time since
    'dispatched_at' exceeds timeout_sec. Returns a new dictionary (immutable).
    """
    if not services:
        return {}

    new_services = copy.deepcopy(services)

    for svc_name, svc_data in new_services.items():
        if not isinstance(svc_data, dict):
            continue

        if svc_data.get("status") == "Добавлена":
            disp_at_raw = svc_data.get("dispatched_at")
            if disp_at_raw:
                if isinstance(disp_at_raw, str):
                    try:
                        disp_dt = datetime.fromisoformat(disp_at_raw)
                    except ValueError:
                        continue
                elif isinstance(disp_at_raw, datetime):
                    disp_dt = disp_at_raw
                else:
                    continue

                # Align timezones between current_time and disp_dt
                if current_time.tzinfo is not None and disp_dt.tzinfo is None:
                    disp_dt = disp_dt.replace(tzinfo=current_time.tzinfo)
                elif current_time.tzinfo is None and disp_dt.tzinfo is not None:
                    disp_dt = disp_dt.replace(tzinfo=None)

                elapsed_sec = (current_time - disp_dt).total_seconds()
                svc_data["is_overdue"] = elapsed_sec > timeout_sec
            else:
                svc_data["is_overdue"] = False

    return new_services


def update_service_status(
    services: Dict[str, Any],
    service_name: str,
    new_status: str,
    comment: str,
    current_time: datetime,
) -> Dict[str, Any]:
    """Update service status and append to service history.

    Returns a new dictionary (immutable).
    """
    new_services = copy.deepcopy(services) if services else {}

    if service_name not in new_services:
        new_services[service_name] = {
            "status": new_status,
            "dispatched_at": current_time.isoformat(),
            "is_overdue": False,
            "history": [],
        }
    else:
        new_services[service_name]["status"] = new_status

    if "history" not in new_services[service_name] or not isinstance(
        new_services[service_name]["history"], list
    ):
        new_services[service_name]["history"] = []

    history_entry = {
        "status": new_status,
        "comment": comment,
        "time": current_time.isoformat(),
    }
    new_services[service_name]["history"].append(history_entry)

    return new_services
