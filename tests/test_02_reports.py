import pytest
from backend.core.reports_engine import calculate_final_score

def test_calculate_final_score_perfect():
    comm_metrics = {"greeting_success": True, "filler_words": 0, "script_followed_pct": 100}
    card_metrics = {
        "address_correct": True, 
        "services_matched": True,
        "over_dispatched_services": [], # Нет лишних служб
        "missed_critical_factoids": []  # Все важные фактоиды записаны
    }
    sla_metrics = {
        "sla_breached_count": 0,
        "time_to_first_dispatch_sec": 45 # Отправил карточку быстро
    }
    
    score, details = calculate_final_score(comm_metrics, card_metrics, sla_metrics)
    assert score == 100
    assert details["penalty"] == 0

def test_calculate_final_score_with_penalties():
    comm_metrics = {"greeting_success": False, "filler_words": 5, "script_followed_pct": 70}
    card_metrics = {
        "address_correct": True, 
        "services_matched": False,
        "over_dispatched_services": ["Служба 103"], # Вызвал скорую, хотя пострадавших нет
        "missed_critical_factoids": ["Запах газа"]  # Пропустил критичный фактоид
    }
    sla_metrics = {
        "sla_breached_count": 1,
        "time_to_first_dispatch_sec": 180 # Долго отправлял карточку
    }
    
    score, details = calculate_final_score(comm_metrics, card_metrics, sla_metrics)
    assert score < 70
    assert "no_greeting" in details["penalties_list"]
    assert "over_dispatching" in details["penalties_list"]
    assert "missed_factoid" in details["penalties_list"]
    assert "slow_dispatch" in details["penalties_list"]
