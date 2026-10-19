"""Bounded DDS summaries; no applicant data or free trainee notes enter the LLM."""
from collections import Counter
from datetime import datetime, time, timedelta, timezone
import hashlib
import json
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from backend.core.dds_report_data import _exercise_protocols
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, TicketResult

MOSCOW = ZoneInfo("Europe/Moscow")


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def student_period(now):
    local = aware(now).astimezone(MOSCOW)
    day = local.date() if local.time() >= time(0, 10) else local.date() - timedelta(days=1)
    end = datetime.combine(day, time(), MOSCOW)
    return (end - timedelta(days=7)).astimezone(timezone.utc), end.astimezone(timezone.utc)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


async def collect_report_snapshot(db, *, lesson_id=None, owner_id=None, period_start=None, period_end=None):
    query = select(ExamSession).join(Assignment).where(
        Assignment.target_role == "DISPATCHER_DDS",
        func.upper(ExamSession.status) == "COMPLETED")
    if lesson_id:
        query = query.where(Assignment.assignment_id == lesson_id)
    else:
        query = query.where(ExamSession.cadet_id == owner_id,
                            ExamSession.end_time >= period_start, ExamSession.end_time < period_end)
    sessions = list((await db.scalars(query.order_by(ExamSession.end_time, ExamSession.session_id))).all())
    ids = [s.session_id for s in sessions]
    results = list((await db.scalars(select(TicketResult).where(TicketResult.session_id.in_(ids)))).all()) if ids else []
    evaluations = list((await db.scalars(select(EvaluationResult).where(EvaluationResult.session_id.in_(ids)))).all()) if ids else []
    checks, reasons, participants, revisions = Counter(), Counter(), {}, {}
    examples, warnings = [], []
    total_cards = completed_cards = errors_count = assessed = protocol_count = 0
    for session in sessions:
        data = (session.dynamic_state or {}).get("dds", {})
        protocols = _exercise_protocols(data)
        protocol_count += len(protocols)
        cards = len(data.get("queue") or []) or 1
        done = len(data.get("completed_cards") or []) or int(bool(data.get("submitted_at")))
        total_cards += cards
        completed_cards += done
        learner = participants.setdefault(session.cadet_id, {"cadet_id": session.cadet_id,
            "sessions": 0, "total_cards": 0, "completed_cards": 0, "mistakes": 0})
        learner["sessions"] += 1
        learner["total_cards"] += cards
        learner["completed_cards"] += done
        seen_events, safe_protocols = set(), []
        for protocol in protocols:
            safe_checks = []
            for check in protocol["criteria"]:
                key, state = check.get("key"), check.get("status")
                if key not in {"confirmation", "service", "stage", "accuracy", "completion"}:
                    continue
                if state not in {"completed", "completed_after_correction", "not_completed", "not_evaluated"}:
                    continue
                checks[f"{key}:{state}"] += 1
                safe_checks.append({"criterion": key, "status": state})
            safe_events = []
            for event in protocol["events"]:
                event_key = (protocol.get("card_id"), event.get("id"))
                if event.get("kind") != "mistake" or event_key in seen_events:
                    continue
                seen_events.add(event_key)
                # Reason is an internal code. Never forward arbitrary legacy text.
                reason = event.get("reason")
                if reason not in {"wrong_service", "wrong_contact", "premature", "wrong_stage", "transition",
                    "call_required", "refusal", "record_accuracy", "unknown_number", "report_note", "completion"}:
                    reason = "other_recorded_mistake"
                reasons[reason] += 1
                errors_count += 1
                learner["mistakes"] += 1
                evidence = {"session_id": session.session_id, "card_id": protocol.get("card_id"),
                            "event_id": event.get("id"), "reason": reason, "blocking": event.get("blocking")}
                safe_events.append(evidence)
                if len(examples) < 12:
                    examples.append(evidence)
            safe_protocols.append({"checks": safe_checks, "events": safe_events})
        # Select the last saved result for each ticket, rather than counting revisions twice.
        latest_results = {}
        for result in sorted((r for r in results if r.session_id == session.session_id),
                             key=lambda r: (bool(r.is_appealed), str(r.updated_at or r.created_at), r.result_id)):
            latest_results[result.ticket_id] = result
        evs = [e for e in evaluations if e.session_id == session.session_id]
        saved_results = [{"id": r.result_id, "updated_at": str(r.updated_at), "status": r.status,
                          "score": r.score_total, "errors_count": r.errors_count}
                         for r in latest_results.values()]
        saved_evals = [{"id": e.evaluation_id, "at": str(e.evaluated_at),
                        "scores": {k: v for k, v in (e.scores or {}).items()
                                   if k in {"final_score", "total", "expert_score", "automatic_score", "is_passed"}
                                   and isinstance(v, (int, float, bool, type(None)))}} for e in evs]
        has_grade = any(r.score_total is not None for r in latest_results.values()) or any(
            any(isinstance(v, (int, float)) and not isinstance(v, bool) for k, v in e["scores"].items()
                if k != "is_passed") for e in saved_evals)
        assessed += int(has_grade)
        if not protocols:
            legacy_errors = sum(r.errors_count or 0 for r in latest_results.values())
            errors_count += legacy_errors
            learner["mistakes"] += legacy_errors
        revisions[session.session_id] = digest({"end": str(session.end_time), "cards": cards, "done": done,
            "protocols": safe_protocols, "results": saved_results, "evaluations": saved_evals})
    if assessed < len(sessions):
        warnings.append(f"Сессий без числовой оценки: {len(sessions) - assessed}. Это не означает успешное выполнение.")
    if not protocol_count:
        warnings.append("Протоколы критериев отсутствуют; смысловая проверка свободного текста не выполнялась.")
    summary = {"sessions": len(sessions), "participants": len(participants), "total_cards": total_cards,
               "completed_cards": completed_cards, "incomplete_cards": max(0, total_cards - completed_cards),
               "sessions_with_score": assessed, "protocols": protocol_count, "mistakes": errors_count}
    return {"summary": summary, "criteria": dict(sorted(checks.items())), "mistakes": dict(sorted(reasons.items())),
            "participants": sorted(participants.values(), key=lambda p: p["cadet_id"] or ""),
            "examples": examples, "warnings": warnings, "source_revisions": revisions}


def has_new_results(snapshot, previous):
    old = (previous or {}).get("source_revisions", {})
    return any(old.get(key) != value for key, value in snapshot["source_revisions"].items())
