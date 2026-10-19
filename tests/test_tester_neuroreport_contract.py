"""FIX-02 contracts: DDS reports describe saved work without inventing marks.

No live model calls; these synthetic checks do not prove runtime availability.
"""

import json
from datetime import datetime, timezone
from uuid import uuid4

import httpx
import pytest

from backend.core.dds_report_data import collect_lesson_report_data
from backend.core.dds_report_llm import (
    DDSLLMSettings,
    DDSReportGenerationError,
    generate_dds_lesson_report,
    check_dds_llm_health,
)
from backend.models.domain_01 import User
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult


def snapshot(*, actions=None, placeholder_result=False):
    return {
        "lesson_id": "tester-neuroreport-lesson",
        "status": "COMPLETED",
        "summary": {
            "student_count": 1, "completed_session_count": 1,
            "evaluation_count": 0,
            "ticket_result_count": int(placeholder_result),
            "incident_card_count": 0,
        },
        "students": [{"cadet_id": "tester-cadet", "session_ids": ["tester-session"]}],
        "sessions": [{
            "session_id": "tester-session", "cadet_id": "tester-cadet",
            "evaluations": [], "cards": [],
            "actions": actions or [],
            "ticket_results": ([{
                "result_id": "tester-ungraded", "is_passed": False,
                "status": "ungraded", "score_total": None,
                "errors_count": 0, "error_details": {},
            }] if placeholder_result else []),
        }],
        "warnings": ["Оценивание не проводилось; корректность действий не установлена."],
    }


def saved_action(card_id, stamp):
    return {
        "request_id": str(uuid4()), "card_id": card_id,
        "kind": "status", "service_name": "Пожарная охрана",
        "status": "Работы завершены", "at": stamp,
    }


@pytest.mark.parametrize("actions", [[{}], [{"request_id": "empty"}]])
async def test_empty_action_shell_is_not_report_evidence(actions):
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: pytest.fail("Empty actions must not invoke inference")
    )) as client:
        with pytest.raises(DDSReportGenerationError, match="Недостаточно данных"):
            await generate_dds_lesson_report(snapshot(actions=actions), client=client, settings=DDSLLMSettings())


@pytest.mark.parametrize("status", ["completed", "in_progress", "pending"])
async def test_technical_ticket_status_without_grade_is_not_evidence(status):
    data = snapshot(placeholder_result=True)
    data["sessions"][0]["ticket_results"][0]["status"] = status
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: pytest.fail("Technical status must not invoke inference")
    )) as client:
        with pytest.raises(DDSReportGenerationError, match="Недостаточно данных"):
            await generate_dds_lesson_report(data, client=client, settings=DDSLLMSettings())


@pytest.mark.asyncio
async def test_tester_neuroreport_snapshot_keeps_current_and_archived_actions_without_pii(db_session):
    """Both archived and stopped current cards are evidence, including chronology."""
    tag = uuid4().hex
    user = User(username=f"neuroreport_{tag}", password_hash="test", role="CADET")
    db_session.add(user)
    await db_session.flush()
    lesson = Assignment(status="COMPLETED", target_role="DISPATCHER_DDS", session_type="CARD_ACTIONS")
    db_session.add(lesson)
    await db_session.flush()
    session = ExamSession(assignment_id=lesson.assignment_id, cadet_id=user.user_id,
                          status="COMPLETED", session_type="CARD_ACTIONS",
                          start_time=datetime(2026, 10, 18, tzinfo=timezone.utc))
    db_session.add(session)
    await db_session.flush()
    current = IncidentCard(session_id=session.session_id, operator_id=user.user_id, card_origin="DDS")
    archived = IncidentCard(session_id=session.session_id, operator_id=user.user_id, card_origin="DDS")
    db_session.add_all([current, archived])
    await db_session.flush()
    old_action = saved_action(archived.card_id, "2026-10-18T10:01:00+00:00")
    new_action = saved_action(current.card_id, "2026-10-18T10:03:00+00:00")
    new_action["who_accepted"] = "TEST_RECEIVER_PII_MUST_NOT_LEAK"
    new_action["reason"] = "TEST_FREE_TEXT_PII_MUST_NOT_LEAK"
    session.dynamic_state = {"dds": {
        "version": 2, "queue": [{"ticket_id": "old"}, {"ticket_id": "new"}],
        "current_index": 1, "card_id": current.card_id, "actions": [new_action],
        "incoming_card": {"caller_phone": "TEST_CALLER_PII_MUST_NOT_LEAK"},
        "completed_cards": [{"card_id": archived.card_id, "actions": [old_action],
                             "incoming_card": {"caller_name": "TEST_CALLER_PII_MUST_NOT_LEAK"}}],
        "submitted_at": None, "stopped_at": "2026-10-18T10:04:00+00:00",
    }}
    db_session.add(TicketResult(session_id=session.session_id, status="ungraded", score_total=None))
    await db_session.commit()

    data = await collect_lesson_report_data(db_session, lesson.assignment_id)
    rendered = json.dumps(data, ensure_ascii=False)
    assert old_action["at"] in rendered, "Report drops actions on completed queue cards"
    assert new_action["at"] in rendered, "Report drops actions on the card stopped by teacher"
    assert "TEST_CALLER_PII_MUST_NOT_LEAK" not in rendered
    assert "TEST_RECEIVER_PII_MUST_NOT_LEAK" not in rendered
    assert "TEST_FREE_TEXT_PII_MUST_NOT_LEAK" not in rendered
    assert data["summary"]["evaluation_count"] == 0
    assert data["sessions"][0]["ticket_results"][0]["score_total"] is None
    assert data["sessions"][0]["exercise_status"] == "incomplete"


@pytest.mark.parametrize("upstream_status,expected", [(200, "ok"), (503, "degraded")])
async def test_llama_health_uses_root_endpoint_without_generating(upstream_status, expected):
    requests = []

    def respond(request):
        requests.append(request)
        assert request.method == "GET"
        assert str(request.url) == "http://llm:8080/health"
        return httpx.Response(upstream_status, json={"status": expected})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        result = await check_dds_llm_health(client=client, settings=DDSLLMSettings(base_url="http://llm:8080/v1"))
    assert result["status"] == expected
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_tester_neuroreport_saved_actions_allow_factual_report_without_grades():
    """Evidence is enough for a descriptive report; a grade is never synthesized."""
    action = saved_action("tester-card", "2026-10-18T10:03:00+00:00")
    requests = []

    def respond(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={
            "choices": [{"finish_reason": "stop", "message": {
                "content": "Зафиксирована смена статуса службы. Оценивание не проводилось."
            }}],
        })

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        result = await generate_dds_lesson_report(snapshot(actions=[action]), client=client,
                                                  settings=DDSLLMSettings())
    assert result["analysis_text"]
    assert len(requests) == 1
    assert action["at"] in json.dumps(requests[0], ensure_ascii=False)
    assert "Оценивание не проводилось" in json.dumps(requests[0], ensure_ascii=False)


@pytest.mark.asyncio
@pytest.mark.parametrize("placeholder_result", [False, True])
async def test_tester_neuroreport_empty_ungraded_placeholder_is_not_evidence(placeholder_result):
    """Row counts/default False/zero errors do not prove an assessed attempt."""
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {
            "content": "Не должно быть запрошено"
        }}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(DDSReportGenerationError, match="Недостаточно данных"):
            await generate_dds_lesson_report(snapshot(placeholder_result=placeholder_result),
                                             client=client, settings=DDSLLMSettings())
    assert calls == []
