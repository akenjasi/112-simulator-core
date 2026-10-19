import pytest
from datetime import datetime, timezone, timedelta
from backend.core.sla_monitor import calculate_sla_status, update_service_status

def test_calculate_sla_status_not_overdue():
    now = datetime.now(timezone.utc)
    dispatched_at = (now - timedelta(seconds=10)).isoformat()
    services = {
        "Служба 101": {
            "status": "Добавлена",
            "dispatched_at": dispatched_at,
            "is_overdue": False,
            "history": []
        }
    }
    
    updated = calculate_sla_status(services, now, timeout_sec=30)
    assert updated["Служба 101"]["is_overdue"] is False

def test_calculate_sla_status_overdue():
    now = datetime.now(timezone.utc)
    dispatched_at = (now - timedelta(seconds=40)).isoformat()
    services = {
        "Служба 101": {
            "status": "Добавлена",
            "dispatched_at": dispatched_at,
            "is_overdue": False,
            "history": []
        }
    }
    
    updated = calculate_sla_status(services, now, timeout_sec=30)
    assert updated["Служба 101"]["is_overdue"] is True

def test_update_service_status():
    now = datetime.now(timezone.utc)
    services = {
        "Служба 101": {
            "status": "Добавлена",
            "dispatched_at": now.isoformat(),
            "is_overdue": False,
            "history": []
        }
    }
    
    updated = update_service_status(
        services, 
        service_name="Служба 101", 
        new_status="Принята", 
        comment="Выехали",
        current_time=now
    )
    
    assert updated["Служба 101"]["status"] == "Принята"
    assert len(updated["Служба 101"]["history"]) == 1
    assert updated["Служба 101"]["history"][0]["status"] == "Принята"
    assert updated["Служба 101"]["history"][0]["comment"] == "Выехали"
