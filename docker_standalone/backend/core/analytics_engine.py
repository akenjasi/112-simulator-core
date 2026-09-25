"""Core analytics aggregation engine.

Provides pure functions for aggregating scenario errors and calculating progress trends.
"""

from typing import Any, Dict, List, Optional, Union


def build_error_heatmap(records: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    """Build a 2D mapping of scenario category -> error type -> frequency count.

    Accepts a flat list of error records (or rows containing category and errors).
    Example record formats:
    - {"category": "ДТП", "penalty_type": "over_dispatching"}
    - {"category": "Пожар", "error_type": "missed_factoid"}
    - {"category": "ДТП", "errors_list": ["over_dispatching", "missed_factoid"]}

    Returns:
        Dict[str, Dict[str, int]]: e.g. {"ДТП": {"over_dispatching": 2}}
    """
    heatmap: Dict[str, Dict[str, int]] = {}

    for record in records:
        category = record.get("category") or "Unknown"
        if category not in heatmap:
            heatmap[category] = {}

        # 1. Direct penalty_type / error_type / error
        penalty = (
            record.get("penalty_type")
            or record.get("error_type")
            or record.get("error")
        )
        if penalty:
            penalty_str = str(penalty)
            heatmap[category][penalty_str] = heatmap[category].get(penalty_str, 0) + 1

        # 2. In case record contains an errors_list
        errors_list = record.get("errors_list")
        if isinstance(errors_list, list):
            for err in errors_list:
                if isinstance(err, dict):
                    err_key = (
                        err.get("penalty_type")
                        or err.get("error_type")
                        or err.get("error")
                        or str(err)
                    )
                else:
                    err_key = str(err)
                if err_key:
                    heatmap[category][err_key] = heatmap[category].get(err_key, 0) + 1

    return heatmap


def calculate_trends(records: List[Dict[str, Any]]) -> Dict[str, Dict[str, Optional[Union[int, float]]]]:
    """Group target cadet score and peer group average by date (session_date).

    Each record should contain:
    - 'session_date': str (e.g. '2023-10-01')
    - 'score': float or int
    - 'is_target_user': bool

    Returns:
        Dict[str, Dict[str, Optional[Union[int, float]]]]:
        {
            "2023-10-01": {"user_score": 70, "group_avg": 90},
            ...
        }
    """
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for r in records:
        date_str = str(r.get("session_date", ""))
        if not date_str:
            continue
        grouped.setdefault(date_str, []).append(r)

    trends: Dict[str, Dict[str, Optional[Union[int, float]]]] = {}

    for date_str in sorted(grouped.keys()):
        day_records = grouped[date_str]
        user_scores = [
            r["score"]
            for r in day_records
            if r.get("is_target_user") is True and r.get("score") is not None
        ]
        peer_scores = [
            r["score"]
            for r in day_records
            if r.get("is_target_user") is False and r.get("score") is not None
        ]

        user_score: Optional[Union[int, float]] = None
        if user_scores:
            u_avg = round(sum(user_scores) / len(user_scores), 2)
            user_score = int(u_avg) if u_avg.is_integer() else u_avg

        group_avg: Optional[Union[int, float]] = None
        if peer_scores:
            p_avg = round(sum(peer_scores) / len(peer_scores), 2)
            group_avg = int(p_avg) if p_avg.is_integer() else p_avg
        elif user_scores:
            group_avg = user_score

        trends[date_str] = {
            "user_score": user_score,
            "group_avg": group_avg,
        }

    return trends
