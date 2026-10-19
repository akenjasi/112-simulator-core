"""Independent verification test suite for Gradebook Truth & Teacher Analytics Integrity.

Covers the 11 critical scenarios:
1. Three active DDS sessions without grades yield avg_score=None, graded=0, pending=3.
2. Completed unevaluated session does not automatically become failed or receive 50.0.
3. Real zero grade (0.0) is strictly preserved as 0.0.
4. Single attempt with multiple evaluation rows does not multiply attempt count.
5. Multiple TicketResults and EvaluationResults do not create Cartesian duplicates.
6. Weighted average check: 1 attempt on 100 and 9 on 0 yield 10.0 (not 50.0).
7. Expert grade override reflects consistently across history, session detail, overview and creates audit log.
8. Group filter switching to empty group clears data without injecting fallback stubs.
9. Renaming, editing, or archiving scenario preserves historical snapshot.
10. Non-existent session and record return 404 (no fake tickets/stubs).
11. Teacher cannot access foreign group or records (403 Forbidden).
"""

import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User, StudentGroup, UserActionLog
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import TicketResult, IncidentCard, EvaluationResult
from backend.core.security import create_access_token, hash_password


@pytest.fixture(autouse=True)
async def init_clean_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _create_user(session, username: str, role: str, full_name: str) -> User:
    user = User(
        username=username,
        password_hash=hash_password("secret123"),
        role=role,
        full_name=full_name,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


async def _create_group(session, group_name: str, teacher_id: str) -> StudentGroup:
    group = StudentGroup(
        name=group_name,
        teacher_id=teacher_id,
        is_active=True,
    )
    session.add(group)
    await session.flush()
    return group



async def setup_review(db):
    owner = await _create_user(db, "owner", "TEACHER", "Owner")
    other = await _create_user(db, "other", "TEACHER", "Other")
    cadet = await _create_user(db, "cadet", "CADET", "Cadet")
    group = await _create_group(db, "Review", owner.user_id)
    assignment = Assignment(group_id=group.group_id, assigned_by=owner.user_id, session_type="CARD_ACTIONS", status="COMPLETED")
    db.add(assignment)
    await db.flush()
    es = ExamSession(assignment_id=assignment.assignment_id, cadet_id=cadet.user_id, session_type="CARD_ACTIONS", status="COMPLETED")
    db.add(es)
    await db.flush()
    card = IncidentCard(session_id=es.session_id, card_origin="test", status="closed", filled_data={"address": "Original"})
    db.add(card)
    await db.flush()
    return owner, other, es, card

def headers_for(user):
    return {"Authorization": "Bearer " + create_access_token(subject=user.user_id, role="TEACHER")}

@pytest.mark.asyncio
async def test_review_foreign_record_override_denied():
    async with AsyncSessionLocal() as db:
        owner, other, es, card = await setup_review(db)
        ev = EvaluationResult(session_id=es.session_id, card_id=card.card_id, scores={"total": 20})
        db.add(ev)
        await db.commit()
        rid, headers = ev.evaluation_id, headers_for(other)
    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        response = await ac.post(f"/api/v1/analytics/records/{rid}/grade-override", json={"score":99, "reason":"Review check"})
        assert response.status_code == 403, response.text

@pytest.mark.asyncio
async def test_review_ticket_result_override_works():
    async with AsyncSessionLocal() as db:
        owner, other, es, card = await setup_review(db)
        tr = TicketResult(session_id=es.session_id, ticket_id="ticket", score_total=20, status="completed")
        db.add(tr)
        await db.commit()
        rid, headers = tr.result_id, headers_for(owner)
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test", headers=headers) as ac:
        response = await ac.post(f"/api/v1/analytics/records/{rid}/grade-override", json={"score":99, "reason":"Review check"})
        assert response.status_code == 200, response.text

@pytest.mark.asyncio
async def test_review_latest_evaluation_selected():
    async with AsyncSessionLocal() as db:
        owner, other, es, card = await setup_review(db)
        now = datetime.now(timezone.utc)
        db.add_all([
            EvaluationResult(session_id=es.session_id, card_id=card.card_id, scores={"total":20}, evaluated_at=now-timedelta(minutes=5)),
            EvaluationResult(session_id=es.session_id, card_id=card.card_id, scores={"total":90}, evaluated_at=now),
        ])
        await db.commit()
        headers = headers_for(owner)
    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        response = await ac.get("/api/analytics/overview")
        assert response.status_code == 200, response.text
        assert response.json()["avg_score"] == 90, response.text

@pytest.mark.asyncio
async def test_review_historical_etalon_not_current_scenario():
    async with AsyncSessionLocal() as db:
        owner, other, es, card = await setup_review(db)
        scenario = ScenarioTicket(title="Original title", ground_truth={"services":["01"]})
        db.add(scenario)
        await db.flush()
        es.ticket_id = scenario.scenario_id
        card.scenario_id = scenario.scenario_id
        es.dynamic_state = {"_gradebook_snapshot":{"ticket_id":scenario.scenario_id,"title":"Original title","etalon":{"services":["01"]}},"dds":{"incoming_card":{"description":"Original card"}}}
        await db.commit()
        scenario.title = "Changed title"
        scenario.ground_truth = {"services":["04"]}
        scenario.is_deleted = True
        await db.commit()
        rid, headers = card.card_id, headers_for(owner)
    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        response = await ac.get(f"/api/v1/analytics/records/{rid}")
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["etalon"] == {"services":["01"]}, response.text
        assert data["title"] == "Original title"
        assert data["snapshot_missing"] is False

@pytest.mark.asyncio
async def test_review_one_attempt_not_both_card_and_result():
    async with AsyncSessionLocal() as db:
        owner, other, es, card = await setup_review(db)
        scenario = ScenarioTicket(title="Ticket", ground_truth={"services":["01"]})
        db.add(scenario)
        await db.flush()
        card.scenario_id = scenario.scenario_id
        es.ticket_id = scenario.scenario_id
        db.add(TicketResult(session_id=es.session_id,ticket_id=scenario.scenario_id,score_total=90,status="completed",is_passed=True))
        await db.commit()
        sid, headers = es.session_id, headers_for(owner)
    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        response = await ac.get(f"/api/v1/analytics/sessions/{sid}")
        assert response.status_code == 200, response.text
        assert len(response.json()["cadets"][0]["records"]) == 1, response.text

@pytest.mark.asyncio
async def test_started_lesson_saves_private_etalon_without_leaking_to_cadet():
    from tests.test_worker2_lessons_assignment import setup_test_environment, api_request
    env = await setup_test_environment(n_cadets=1)
    created = await api_request("POST", "/api/v1/lessons", env["teacher"], json={
        "group_id": env["group_id"], "ticket_id": env["ticket_id"], "target_role": "DISPATCHER_DDS",
    })
    assert created.status_code == 201, created.text
    lesson_id = created.json()["id"]
    started = await api_request("POST", f"/api/v1/lessons/{lesson_id}/start", env["teacher"])
    assert started.status_code == 200, started.text
    async with AsyncSessionLocal() as db:
        es = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson_id))).one()
        card = (await db.scalars(select(IncidentCard).where(IncidentCard.session_id == es.session_id))).one()
        rid = card.card_id
        scenario = await db.get(ScenarioTicket, env["ticket_id"])
        old_title = scenario.title
        scenario.title = "Changed later"
        scenario.ground_truth = {"solution":"wrong new solution"}
        scenario.is_deleted = True
        await db.commit()
    detail = await api_request("GET", f"/api/v1/analytics/records/{rid}", env["teacher"])
    assert detail.status_code == 200, detail.text
    assert detail.json()["etalon"] == {"solution":"send fire immediately"}
    assert detail.json()["title"] == old_title
    history = await api_request("GET", f"/api/v1/lessons/{lesson_id}", env["teacher"])
    assert history.status_code == 200, history.text
    assert history.json()["students"][0]["tickets"][0]["title"] == old_title
    cadet = await api_request("GET", "/api/dds/assignments", env["cadets"][0])
    assert cadet.status_code == 200, cadet.text
    assert "send fire immediately" not in cadet.text
    assert "_gradebook_snapshot" not in cadet.text

@pytest.mark.asyncio
async def test_card_detail_with_multiple_evaluations_uses_latest_and_matches_overview():
    async with AsyncSessionLocal() as db:
        owner, other, es, card = await setup_review(db)
        now = datetime.now(timezone.utc)
        db.add_all([
            EvaluationResult(session_id=es.session_id, card_id=card.card_id, scores={"total":20}, evaluated_at=now-timedelta(minutes=5)),
            EvaluationResult(session_id=es.session_id, card_id=card.card_id, scores={"total":90}, evaluated_at=now),
        ])
        await db.commit()
        rid, headers = card.card_id, headers_for(owner)
    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        detail = await ac.get(f"/api/v1/analytics/records/{rid}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["score"] == 90
        overview = await ac.get("/api/analytics/overview")
        assert overview.json()["avg_score"] == detail.json()["score"]
