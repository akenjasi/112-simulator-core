"""Status and numeric score are independent expert decisions."""
import json

import pytest

from backend.database import AsyncSessionLocal
from backend.models.domain_04 import TicketResult
from backend.tests.test_teacher_grading_acceptance import (
    fixture, request, endpoint, detail, logs, isolated_tables,
)


@pytest.mark.parametrize("status,passed", [("passed", True), ("failed", False)])
async def test_explicit_status_is_saved_with_numeric_score_and_audited(status, passed):
    data = await fixture(ai=84)
    response = await request("POST", endpoint(data), data,
                             json={"score": 100, "status": status, "reason": "Экспертный разбор"})
    assert response.status_code == 200, response.text
    saved = await detail(data)
    assert saved["status"] == status
    assert saved["score"] == saved["expert_score"] == 100
    assert saved["automatic_score"] == 84
    history = await request("GET", "/api/v1/lessons", data)
    lesson = next(row for row in history.json() if row["id"] == data["lesson"])
    attempt = lesson["students"][0]["tickets"][0]
    assert attempt["status"] == status
    audit = json.loads((await logs())[-1].details)
    assert audit["new_is_passed"] is passed
    assert "old_is_passed" in audit


async def test_status_only_grade_does_not_require_or_invent_a_score():
    data = await fixture()
    for status in ("passed", "failed", "passed"):
        response = await request("POST", endpoint(data), data,
                                 json={"status": status, "reason": "Зачёт без балльной оценки"})
        assert response.status_code == 200, response.text
        assert response.json()["new_score"] is None
        saved = await detail(data)
        assert saved["status"] == status
        assert saved["score"] is None
        assert saved["expert_score"] is None
        assert saved["automatic_score"] is None
        history = await request("GET", "/api/v1/lessons", data)
        lesson = next(row for row in history.json() if row["id"] == data["lesson"])
        assert lesson["students"][0]["tickets"][0]["status"] == status
        assert lesson["students"][0]["passed"] == (1 if status == "passed" else 0)
        assert lesson["students"][0]["failed"] == (1 if status == "failed" else 0)
        overview = (await request("GET", "/api/v1/analytics/overview", data)).json()
        assert overview["graded_attempts"] == 1
        assert overview["pending_attempts"] == 0
        assert overview["passed_count"] == (1 if status == "passed" else 0)
        assert overview["failed_count"] == (1 if status == "failed" else 0)
        assert overview["avg_score"] is None


async def test_status_only_preserves_ai_score_without_calling_it_expert_score():
    data = await fixture(ai=84)
    response = await request("POST", endpoint(data), data,
                             json={"status": "passed", "reason": "Проверено преподавателем"})
    assert response.status_code == 200, response.text
    saved = await detail(data)
    assert saved["status"] == "passed"
    assert saved["score"] == saved["automatic_score"] == 84
    assert saved["expert_score"] is None
    response = await request("POST", endpoint(data), data, json={"score": 73.5, "reason": "Уточнён балл"})
    assert response.status_code == 200, response.text
    saved = await detail(data)
    assert saved["status"] == "passed"
    assert saved["expert_score"] == 73.5
    assert saved["automatic_score"] == 84


async def test_status_only_updates_result_and_card_aliases_without_resetting_score():
    data = await fixture(ai=84)
    async with AsyncSessionLocal() as db:
        result = TicketResult(session_id=data["session"], ticket_id=data["ticket"], score_total=84,
                              is_passed=False, status="COMPLETED")
        db.add(result)
        await db.commit()
        result_id = result.result_id
    response = await request("POST", f"/api/v1/analytics/records/{result_id}/grade-override", data,
                             json={"status": "passed", "reason": "Исправлен зачёт"})
    assert response.status_code == 200, response.text
    for record in (result_id, data["card"], data["record"]):
        saved = await detail(data, record)
        assert saved["status"] == "passed"
        assert saved["score"] == 84
        assert saved["automatic_score"] == 84
        assert saved["expert_score"] is None


@pytest.mark.parametrize("payload", [{}, {"status": "unknown"}, {"score": None}, {"score": 101}])
async def test_invalid_or_empty_grade_change_is_rejected(payload):
    data = await fixture()
    response = await request("POST", endpoint(data), data, json={"reason": "Проверка", **payload})
    assert response.status_code == 422, response.text
    assert await logs() == []


async def test_status_only_preserves_submission_and_access_checks():
    data = await fixture(active=True)
    response = await request("POST", endpoint(data), data, json={"status": "passed", "reason": "Слишком рано"})
    assert response.status_code == 409, response.text
    response = await request("POST", endpoint(data), data, actor="other",
                             json={"status": "passed", "reason": "Чужая работа"})
    assert response.status_code == 403, response.text
    assert await logs() == []


async def test_status_only_keeps_an_existing_expert_score_from_ticket_result():
    data = await fixture(ai=84)
    async with AsyncSessionLocal() as db:
        db.add(TicketResult(session_id=data["session"], ticket_id=data["ticket"], score_total=91,
                            is_passed=False, is_appealed=True, status="COMPLETED"))
        await db.commit()
    response = await request("POST", endpoint(data), data,
                             json={"status": "passed", "reason": "Исправлен только зачёт"})
    assert response.status_code == 200, response.text
    saved = await detail(data)
    assert saved["status"] == "passed"
    assert saved["score"] == saved["expert_score"] == 91
    assert saved["automatic_score"] == 84
