"""Stable relationships between stored attempts, cards and their evaluations."""
from datetime import datetime, timezone
import math
from typing import Optional

from backend.models.domain_04 import EvaluationResult


def _evaluation_order(evaluation):
    stamp = evaluation.expert_modified_at or evaluation.evaluated_at
    if stamp is None:
        stamp = datetime.min.replace(tzinfo=timezone.utc)
    elif stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return (bool(evaluation.is_appealed or evaluation.expert_modified_at), stamp, evaluation.evaluation_id or "")


def latest_evaluation(evaluations, card_id=None) -> Optional[EvaluationResult]:
    candidates = [e for e in evaluations if card_id is None or e.card_id == card_id]
    return max(candidates, key=_evaluation_order, default=None)


def build_attempt_records(results, cards, evaluations):
    """Pair a card with its result once, never borrow another card's evaluation.

    Multiple results for a scenario remain separate attempts. A card without an
    unambiguous result remains a separate record rather than guessing a link.
    """
    used_cards = set()
    records = []
    for result in results:
        matches = [c for c in cards if c.scenario_id and c.scenario_id == result.ticket_id]
        same_ticket_results = [r for r in results if r.ticket_id == result.ticket_id]
        if len(matches) == 1 and len(same_ticket_results) == 1:
            card = matches[0]
        elif len(results) == 1 and len(cards) == 1 and not cards[0].scenario_id:
            card = cards[0]
        else:
            card = None
        if card:
            used_cards.add(card.card_id)
        records.append((result, card))
    # Legacy cards without a scenario key cannot establish an additional
    # attempt when explicit TicketResults already enumerate those attempts.
    records.extend((None, c) for c in cards if c.card_id not in used_cards and (not results or c.scenario_id))
    if not records:
        records.append((None, None))
    return [
        (result, card, latest_evaluation(evaluations, card.card_id) if card else
         (latest_evaluation(evaluations) if len(records) == 1 else None))
        for result, card in records
    ]


def historical_record_snapshot(session, scenario_id):
    state = session.dynamic_state if session and isinstance(session.dynamic_state, dict) else {}
    snapshot = state.get("_gradebook_snapshot")
    if isinstance(snapshot, dict) and snapshot.get("ticket_id") == scenario_id:
        return snapshot
    return None


def _score(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        score = float(value)
    except (ValueError, TypeError):
        return None
    return score if math.isfinite(score) and 0 <= score <= 100 else None


def resolve_attempt_score_and_status(session, ticket_result=None, eval_result=None):
    """Use the same saved grade in the overview, record and DDS history."""
    tr = ticket_result
    ev = eval_result
    dds = (session.dynamic_state or {}).get("dds", {}) if session and isinstance(session.dynamic_state, dict) else {}
    ev_scores = ev.scores if ev and isinstance(ev.scores, dict) else {}
    ev_score = next((_score(ev_scores[k]) for k in ("final_score", "total", "total_score", "score") if _score(ev_scores.get(k)) is not None), None)
    tr_score = _score(tr.score_total) if tr else None
    dds_score = _score(dds.get("score"))
    # A numeric mark alone does not define success without a saved rubric outcome.
    saved_passed = ev_scores.get("is_passed")
    if not isinstance(saved_passed, bool):
        saved_passed = bool(tr.is_passed) if tr is not None and tr_score is not None else None
    dds_passed = dds.get("is_passed") if isinstance(dds.get("is_passed"), bool) else None

    def result_status(passed):
        return "passed" if passed is True else ("failed" if passed is False else "completed")

    if tr and tr.is_appealed and tr_score is not None:
        return tr_score, bool(tr.is_passed), "passed" if tr.is_passed else "failed", tr.errors_count or 0, "OVERRIDDEN"
    if ev and (ev.is_appealed or ev.expert_modified_at) and ev_score is not None:
        passed = saved_passed
        return ev_score, passed, result_status(passed), len(ev.errors_list or []), "OVERRIDDEN"
    if dds.get("teacher_comment") and dds_score is not None:
        passed = dds_passed
        return dds_score, passed, result_status(passed), len(dds.get("errors") or []), "OVERRIDDEN"
    if ev_score is not None:
        passed = saved_passed
        return ev_score, passed, result_status(passed), len(ev.errors_list or []), "AUTOMATIC"
    if tr_score is not None:
        return tr_score, bool(tr.is_passed), "passed" if tr.is_passed else "failed", tr.errors_count or 0, "AUTOMATIC"
    if dds_score is not None:
        passed = dds_passed
        return dds_score, passed, result_status(passed), len(dds.get("errors") or []), "AUTOMATIC"
    active = (tr and (tr.status or "").lower() in ("active", "in_progress")) or (session and (session.status or "").upper() in ("ACTIVE", "INITIALIZED", "IN_PROGRESS"))
    return None, None, "in_progress" if active else "pending", (tr.errors_count or 0) if tr else 0, None
