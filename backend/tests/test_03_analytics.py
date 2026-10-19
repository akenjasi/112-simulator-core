import pytest
from backend.core.analytics_engine import build_error_heatmap, calculate_trends

def test_build_error_heatmap():
    # Mock data representing joined rows from DB
    records = [
        {"category": "ДТП", "penalty_type": "over_dispatching"},
        {"category": "ДТП", "penalty_type": "over_dispatching"},
        {"category": "Пожар", "penalty_type": "missed_factoid"}
    ]
    
    heatmap = build_error_heatmap(records)
    
    assert heatmap["ДТП"]["over_dispatching"] == 2
    assert heatmap["Пожар"]["missed_factoid"] == 1

def test_calculate_trends():
    records = [
        {"session_date": "2023-10-01", "score": 70, "is_target_user": True},
        {"session_date": "2023-10-01", "score": 90, "is_target_user": False},
        {"session_date": "2023-10-02", "score": 85, "is_target_user": True},
        {"session_date": "2023-10-02", "score": 90, "is_target_user": False},
    ]
    
    trends = calculate_trends(records)
    
    assert trends["2023-10-01"]["user_score"] == 70
    assert trends["2023-10-01"]["group_avg"] == 90
    assert trends["2023-10-02"]["user_score"] == 85
