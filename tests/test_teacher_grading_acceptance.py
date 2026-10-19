"""Codex-owned acceptance contract; Gemini must not modify these checks."""
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from backend.core.security import create_access_token
from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.models.base import Base
from backend.models.domain_01 import StudentGroup, User, UserActionLog
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, IncidentCard


@pytest.fixture(autouse=True)
async def isolated_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def headers(uid, role="TEACHER"):
    return {"Authorization": "Bearer " + create_access_token(subject=uid, role=role)}


async def fixture(*, ai=None, active=False):
    async with AsyncSessionLocal() as db:
        owner, other, cadet = [User(username=uuid4().hex, password_hash="unused-test-hash", role=role, is_active=True)
                               for role in ("TEACHER", "TEACHER", "CADET")]
        db.add_all([owner, other, cadet])
        await db.flush()
        group = StudentGroup(name="Приёмочная группа", teacher_id=owner.user_id, cadet_ids=[cadet.user_id])
        ticket = ScenarioTicket(title="Пожар на складе", category="Пожар", content={})
        db.add_all([group, ticket])
        await db.flush()
        lesson = Assignment(group_id=group.group_id, assigned_by=owner.user_id,
                            status="COMPLETED", target_role="DISPATCHER_DDS", scenario_id=ticket.scenario_id)
        db.add(lesson)
        await db.flush()
        state = {"incoming_card": {}, "actions": []}
        if not active:
            state["submitted_at"] = datetime.now(timezone.utc).isoformat()
        session = ExamSession(assignment_id=lesson.assignment_id, cadet_id=cadet.user_id,
                              ticket_id=ticket.scenario_id, session_type="CALL_SIMULATION",
                              status="ACTIVE" if active else "COMPLETED", dynamic_state={"dds": state})
        db.add(session)
        await db.flush()
        card = IncidentCard(session_id=session.session_id, scenario_id=ticket.scenario_id,
                            operator_id=cadet.user_id, card_origin="DDS", filled_data={"address": "Склад 1"})
        db.add(card)
        await db.flush()
        ev = None
        if ai is not None:
            ev = EvaluationResult(session_id=session.session_id, card_id=card.card_id,
                                  scores={"final_score": ai, "total": ai}, metrics={"ai_metric": 0.8},
                                  errors_list=[{"field": "address", "message": "Нет номера дома"}])
            db.add(ev)
            await db.flush()
        await db.commit()
        return dict(owner=owner.user_id, other=other.user_id, cadet=cadet.user_id,
                    card=card.card_id, record=ev.evaluation_id if ev else card.card_id,
                    session=session.session_id, lesson=lesson.assignment_id, ticket=ticket.scenario_id)


async def request(method, path, data, *, actor="owner", role="TEACHER", **kwargs):
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        return await client.request(method, path, headers=headers(data[actor], role), **kwargs)


def endpoint(data):
    return f"/api/v1/analytics/records/{data['record']}/grade-override"


async def detail(data, record=None):
    r = await request("GET", f"/api/v1/analytics/records/{record or data['record']}", data)
    assert r.status_code == 200, r.text
    return r.json()


async def logs():
    async with AsyncSessionLocal() as db:
        return list((await db.scalars(select(UserActionLog).where(UserActionLog.action.in_(["GRADE_OVERRIDE", "GRADE_MODIFIED"])))).all())


@pytest.mark.parametrize("score", [0, 87.5, 100])
async def test_first_grade_without_ai_or_ticket_result_is_saved_and_reloaded(score):
    data = await fixture()
    response = await request("POST", endpoint(data), data,
                             json={"score": score, "reason": "Первичная экспертная оценка", "comment": "Проверено вручную"})
    assert response.status_code == 200, response.text
    assert response.json()["old_score"] is None
    assert response.json()["new_score"] == score
    saved = await detail(data)
    assert saved["score"] == score
    assert saved["expert_score"] == score
    assert saved["automatic_score"] is None
    assert saved["teacher_comment"] == "Проверено вручную"
    assert saved["expert_modified_by"] == data["owner"]
    assert saved["expert_modified_at"]
    entries = await logs()
    assert len(entries) == 1
    assert entries[0].user_id == data["owner"]
    assert entries[0].timestamp is not None
    audit = json.loads(entries[0].details)
    assert audit["old_score"] is None and audit["new_score"] == score
    assert audit["reason"] == "Первичная экспертная оценка"
    assert audit["record_id"] == data["record"]
    history = await request("GET", "/api/v1/lessons", data)
    assert history.status_code == 200, history.text
    own = next(row for row in history.json() if row["id"] == data["lesson"])
    attempt = own["students"][0]["tickets"][0]
    assert attempt["record_id"] == data["card"]
    assert attempt["session_id"] == data["session"]
    assert attempt["score"] == score
    overview = await request("GET", "/api/v1/analytics/overview", data)
    assert overview.status_code == 200, overview.text
    assert overview.json()["graded_attempts"] == 1
    assert overview.json()["avg_score"] == score


async def test_expert_revisions_keep_original_ai_and_each_audit_transition():
    data = await fixture(ai=84)
    for score, reason in [(73.5, "Учтена правильная служба"), (66, "Уточнение после разбора")]:
        r = await request("POST", endpoint(data), data, json={"score": score, "reason": reason, "comment": "Рекомендация ученику"})
        assert r.status_code == 200, r.text
        saved = await detail(data)
        assert saved["automatic_score"] == 84
        assert saved["expert_score"] == saved["score"] == score
    entries = await logs()
    assert len(entries) == 2
    transitions = {(json.loads(e.details)["old_score"], json.loads(e.details)["new_score"]) for e in entries}
    assert transitions == {(84, 73.5), (73.5, 66)}
    async with AsyncSessionLocal() as db:
        ev = await db.get(EvaluationResult, data["record"])
        assert ev.metrics == {"ai_metric": 0.8}
        assert ev.errors_list == [{"field": "address", "message": "Нет номера дома"}]


@pytest.mark.parametrize("score", [-1, 101, None, "не число"])
async def test_invalid_score_does_not_write_a_grade_or_audit(score):
    data = await fixture(ai=84)
    r = await request("POST", endpoint(data), data, json={"score": score, "reason": "Проверка"})
    assert r.status_code == 422, r.text
    assert (await detail(data))["score"] == 84
    assert await logs() == []


@pytest.mark.parametrize("reason", ["", "   ", "\t\n"])
async def test_empty_revision_reason_is_rejected(reason):
    data = await fixture(ai=84)
    r = await request("POST", endpoint(data), data, json={"score": 71, "reason": reason})
    assert r.status_code == 422, r.text
    assert (await detail(data))["score"] == 84
    assert await logs() == []


@pytest.mark.parametrize("actor,role", [("other", "TEACHER"), ("cadet", "CADET")])
async def test_forbidden_actor_cannot_change_result_or_create_audit(actor, role):
    data = await fixture(ai=84)
    r = await request("POST", endpoint(data), data, actor=actor, role=role,
                      json={"score": 10, "reason": "Попытка чужого изменения"})
    assert r.status_code == 403, r.text
    assert (await detail(data))["score"] == 84
    assert await logs() == []


async def test_unsubmitted_active_attempt_cannot_be_graded():
    data = await fixture(ai=84, active=True)
    r = await request("POST", endpoint(data), data, json={"score": 71, "reason": "Раннее оценивание"})
    assert r.status_code == 409, r.text
    assert (await detail(data))["score"] == 84
    assert await logs() == []


async def test_unknown_record_returns_404_without_audit():
    data = await fixture()
    r = await request("POST", f"/api/v1/analytics/records/{uuid4()}/grade-override", data,
                      json={"score": 71, "reason": "Проверка"})
    assert r.status_code == 404
    assert await logs() == []


async def test_grading_one_card_cannot_grade_another_attempt_in_same_session():
    data = await fixture(ai=84)
    async with AsyncSessionLocal() as db:
        card = IncidentCard(session_id=data["session"], scenario_id=data["ticket"],
                            operator_id=data["cadet"], card_origin="DDS", filled_data={"address": "Другой ответ"})
        db.add(card)
        await db.commit()
        other_card = card.card_id
    r = await request("POST", endpoint(data), data, json={"score": 71, "reason": "Проверен первый ответ"})
    assert r.status_code == 200, r.text
    assert (await detail(data, other_card))["score"] is None


async def test_audit_failure_rolls_back_grade():
    data = await fixture(ai=84)
    def unavailable_audit(session, flush_context, instances):
        if any(isinstance(row, UserActionLog) and row.action in ("GRADE_OVERRIDE", "GRADE_MODIFIED") for row in session.new):
            raise RuntimeError("Simulated audit failure")
    event.listen(Session, "before_flush", unavailable_audit)
    try:
        r = await request("POST", endpoint(data), data, json={"score": 71, "reason": "Проверка атомарности"})
    finally:
        event.remove(Session, "before_flush", unavailable_audit)
    assert r.status_code == 500
    assert (await detail(data))["score"] == 84
    assert await logs() == []
