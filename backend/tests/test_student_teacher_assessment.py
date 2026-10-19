"""Student-visible teacher assessments, exercised through grading and history routes."""

from datetime import datetime

import pytest

from backend.database import AsyncSessionLocal
from backend.models.domain_01 import User
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult
# Reuse the isolated-table setup and real teacher grading fixture.
from backend.tests.test_teacher_grading_acceptance import endpoint, fixture, isolated_tables, request


@pytest.mark.parametrize("queue_version", [False, True])
async def test_student_history_uses_moscow_calendar_time(queue_version):
    data = await fixture()
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, data["session"])
        # SQLite returns naive UTC; 21:30 UTC belongs to the following Moscow day.
        session.start_time = datetime(2026, 10, 19, 21, 30)
        if queue_version:
            session.dynamic_state = {"dds": {"version": 2,
                "queue": [{"ticket_id": data["ticket"]}], "current_index": 0,
                "card_id": data["card"], "completed_cards": [], "actions": []}}
        await db.commit()
    response = await request("GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", data, actor="cadet", role="CADET")
    assert response.status_code == 200
    item = next(item for item in response.json() if item["session_id"] == data["session"])
    assert item["date"] == "20.10.2026 00:30"


@pytest.mark.parametrize(
    ("score",),
    [(0,), (82,)],
)
async def test_teacher_grade_is_visible_only_on_its_students_exact_card(score):
    data = await fixture()
    async with AsyncSessionLocal() as db:
        first_card = await db.get(IncidentCard, data["card"])
        session = await db.get(ExamSession, data["session"])
        another_ticket = ScenarioTicket(title="Вторая учебная карточка", category="Пожар", content={})
        same_session_other_card = IncidentCard(
            session_id=data["session"], scenario_id=None,
            operator_id=data["cadet"], card_origin="DDS", filled_data={"address": "Другой дом"},
        )
        db.add(another_ticket)
        await db.flush()
        same_session_other_card.scenario_id = another_ticket.scenario_id
        other_student = User(username="assessment-reader", password_hash="unused-test-hash", role="CADET", is_active=True)
        db.add_all([same_session_other_card, other_student])
        await db.flush()
        other_student_session = ExamSession(
            assignment_id=data["lesson"], cadet_id=other_student.user_id,
            ticket_id=data["ticket"], session_type="CALL_SIMULATION", status="COMPLETED",
            dynamic_state={"dds": {"submitted_at": "2026-10-19T10:00:00+00:00"}},
        )
        db.add(other_student_session)
        await db.flush()
        other_student_card = IncidentCard(
            session_id=other_student_session.session_id, scenario_id=data["ticket"],
            operator_id=other_student.user_id, card_origin="DDS", filled_data={"address": "Чужая карточка"},
        )
        db.add(other_student_card)
        submitted_at = "2026-10-19T10:00:00+00:00"
        session.dynamic_state = {"dds": {
            "version": 2,
            "queue": [
                {"ticket_id": data["ticket"], "title": "Пожар на складе"},
                {"ticket_id": another_ticket.scenario_id, "title": "Вторая учебная карточка"},
            ],
            "current_index": 1,
            "card_id": same_session_other_card.card_id,
            "card_submitted_at": submitted_at,
            "submitted_at": submitted_at,
            "actions": [],
            "completed_cards": [{"ticket_id": data["ticket"], "card_id": first_card.card_id,
                                  "card_submitted_at": submitted_at, "actions": []}],
        }}
        other_student_session = await db.get(ExamSession, other_student_session.session_id)
        other_student_session.dynamic_state = {"dds": {
            "version": 2, "queue": [{"ticket_id": data["ticket"], "title": "Пожар на складе"}],
            "current_index": 0, "card_id": other_student_card.card_id,
            "card_submitted_at": submitted_at, "submitted_at": submitted_at, "actions": [],
        }}
        await db.commit()
        first_card_id = first_card.card_id
        sibling_card_id = same_session_other_card.card_id

    changed = await request(
        "POST", endpoint(data), data,
        json={"score": score, "reason": "Проверено преподавателем", "comment": "Оценка за эту карточку"},
    )
    assert changed.status_code == 200, changed.text

    own_response = await request("GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", data, actor="cadet", role="CADET")
    assert own_response.status_code == 200, own_response.text
    own_session = next(item for item in own_response.json() if item["session_id"] == data["session"])
    by_card = {item["card_id"]: item for item in own_session["tickets"]}
    teacher_assessment = by_card[first_card_id]["teacher_assessment"]
    assert teacher_assessment["score"] == score
    assert teacher_assessment["is_passed"] is None
    assert teacher_assessment["comment"] == "Оценка за эту карточку"
    assert datetime.fromisoformat(teacher_assessment["graded_at"])
    assert by_card[sibling_card_id]["teacher_assessment"] is None
    assert all(item["card_id"] != other_student_card.card_id for item in own_session["tickets"])
    other_data = {**data, "cadet": other_student.user_id}
    other_history = await request(
        "GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", other_data,
        actor="cadet", role="CADET",
    )
    assert other_history.status_code == 200, other_history.text
    other_own_session = next(item for item in other_history.json() if item["session_id"] == other_student_session.session_id)
    assert all(item["teacher_assessment"] is None for item in other_own_session["tickets"])
    assert all(item["card_id"] != first_card_id for item in other_own_session["tickets"])


async def test_status_only_teacher_override_does_not_turn_automatic_score_into_teacher_score():
    data = await fixture(ai=84)
    changed = await request(
        "POST", endpoint(data), data,
        json={"status": "passed", "reason": "Зачёт после разбора", "comment": "Зачтено преподавателем"},
    )
    assert changed.status_code == 200, changed.text
    own_response = await request(
        "GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", data,
        actor="cadet", role="CADET",
    )
    assert own_response.status_code == 200, own_response.text
    own_session = next(item for item in own_response.json() if item["session_id"] == data["session"])
    attempt = next(item for item in own_session["tickets"] if item["card_id"] == data["card"])
    assert attempt["score"] == 84
    assert attempt["teacher_assessment"]["score"] is None
    assert attempt["teacher_assessment"]["is_passed"] is True
    assert attempt["teacher_assessment"]["comment"] == "Зачтено преподавателем"
    assert attempt["teacher_assessment"]["graded_at"]


async def test_legacy_ticket_result_history_keeps_the_unambiguous_incident_card_identity():
    data = await fixture()
    async with AsyncSessionLocal() as db:
        result = TicketResult(
            ticket_id=data["ticket"], session_id=data["session"], status="COMPLETED",
            score_total=61, is_passed=False,
        )
        db.add(result)
        await db.commit()
        result_id = result.result_id

    graded = await request(
        "POST", endpoint({**data, "record": result_id}), data,
        json={"score": 76, "reason": "Проверена попытка по билету", "comment": "Замечание по карточке ученика"},
    )
    assert graded.status_code == 200, graded.text
    history = await request("GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", data, actor="cadet", role="CADET")
    assert history.status_code == 200, history.text
    lesson = next(item for item in history.json() if item["session_id"] == data["session"])
    attempt = next(item for item in lesson["tickets"] if item["ticket_id"] == data["ticket"])
    assert attempt["card_id"] == data["card"]
    assert attempt["teacher_assessment"]["score"] == 76
    assert attempt["teacher_assessment"]["comment"] == "Замечание по карточке ученика"
    assert attempt["teacher_assessment"]["graded_at"]


async def test_legacy_ambiguous_ticket_result_does_not_hide_a_separately_graded_card():
    data = await fixture()
    async with AsyncSessionLocal() as db:
        second_card = IncidentCard(
            session_id=data["session"], scenario_id=data["ticket"],
            operator_id=data["cadet"], card_origin="DDS", filled_data={"address": "Второй ответ"},
        )
        result = TicketResult(
            ticket_id=data["ticket"], session_id=data["session"], status="COMPLETED",
            score_total=54, is_passed=False,
        )
        db.add_all([second_card, result])
        await db.commit()
        second_card_id = second_card.card_id

    graded = await request(
        "POST", endpoint({**data, "record": second_card_id}), data,
        json={"score": 69, "reason": "Проверена вторая карточка отдельно", "comment": "Комментарий второй карточки"},
    )
    assert graded.status_code == 200, graded.text
    history = await request("GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", data, actor="cadet", role="CADET")
    assert history.status_code == 200, history.text
    lesson = next(item for item in history.json() if item["session_id"] == data["session"])
    graded_card_rows = [item for item in lesson["tickets"] if item["card_id"] == second_card_id]
    assert len(graded_card_rows) == 1
    assert graded_card_rows[0]["ticket_id"] == data["ticket"]
    assert graded_card_rows[0]["teacher_assessment"]["score"] == 69
    assert graded_card_rows[0]["teacher_assessment"]["comment"] == "Комментарий второй карточки"
    result_rows = [item for item in lesson["tickets"] if item["card_id"] is None and item["ticket_id"] == data["ticket"]]
    assert len(result_rows) == 1
    assert result_rows[0]["teacher_assessment"] is None
