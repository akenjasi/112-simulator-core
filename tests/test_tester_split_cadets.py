"""Independent acceptance checks for FIX-08 (split-screen cadets and lesson review)."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.core.security import create_access_token
from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.models.base import Base
from backend.models.domain_01 import StudentGroup, User
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, IncidentCard
from tests.test_dds_queue import exercise, launch
from tests.test_dds_cycle_acceptance import request


async def test_lesson_review_only_exposes_received_queue_cards():
    users, ids = await exercise(n=1, count=3)
    lesson_id, states = await launch(users, ids)
    response = await request("GET", f"/api/v1/analytics/lessons/{lesson_id}", users["teacher"])
    assert response.status_code == 200, response.text
    cadet = response.json()["cadets"][0]
    assert cadet["success_rate"] is None
    assert [record["record_id"] for record in cadet["records"]] == [states[0]["card_id"]]
    detail = await request("GET", f"/api/v1/analytics/records/{states[0]['card_id']}", users["teacher"])
    assert detail.status_code == 200, detail.text


@pytest.fixture(autouse=True)
async def isolated_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def auth_headers(uid: str, role: str = "TEACHER"):
    return {"Authorization": "Bearer " + create_access_token(subject=uid, role=role)}


async def setup_two_cadet_lesson():
    """Create a lesson with two cadets, real sessions, cards, and attempts."""
    async with AsyncSessionLocal() as db:
        owner = User(username="teacher_" + uuid4().hex[:8], password_hash="test-hash", role="TEACHER", is_active=True, full_name="Преподаватель Иванов")
        other_teacher = User(username="teacher_" + uuid4().hex[:8], password_hash="test-hash", role="TEACHER", is_active=True, full_name="Чужой Преподаватель")
        cadet1 = User(username="cadet1_" + uuid4().hex[:8], password_hash="test-hash", role="CADET", is_active=True, full_name="Курсант Смирнов")
        cadet2 = User(username="cadet2_" + uuid4().hex[:8], password_hash="test-hash", role="CADET", is_active=True, full_name="Курсант Васильев")
        other_cadet = User(username="cadet3_" + uuid4().hex[:8], password_hash="test-hash", role="CADET", is_active=True, full_name="Посторонний Курсант")

        db.add_all([owner, other_teacher, cadet1, cadet2, other_cadet])
        await db.flush()

        group = StudentGroup(
            name="Группа 101-П",
            teacher_id=owner.user_id,
            cadet_ids=[cadet1.user_id, cadet2.user_id],
        )
        ticket1 = ScenarioTicket(
            title="Билет 1: Пожар на складе",
            category="Пожар",
            content={"address": "ул. Складская, 1", "services": ["01"]},
        )
        ticket2 = ScenarioTicket(
            title="Билет 2: ДТП с пострадавшими",
            category="ДТП",
            content={"address": "пр. Мира, 10", "services": ["02", "03"]},
        )
        db.add_all([group, ticket1, ticket2])
        await db.flush()

        lesson = Assignment(
            group_id=group.group_id,
            assigned_by=owner.user_id,
            status="COMPLETED",
            target_role="DISPATCHER_DDS",
            scenario_id=ticket1.scenario_id,
            card_pool_ids=[ticket1.scenario_id, ticket2.scenario_id],
            teacher_notes="Занятие по отработке экстренных вызовов",
        )
        db.add(lesson)
        await db.flush()

        # Cadet 1 session: completed and graded (passed)
        now_iso = datetime.now(timezone.utc).isoformat()
        state1 = {
            "incoming_card": {"address": "ул. Складская, 1"},
            "actions": [{"actor_id": cadet1.user_id, "kind": "status", "service_name": "01", "status": "Вызов принят", "order_number": "ORD-101"}],
            "submitted_at": now_iso,
        }
        session1 = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet1.user_id,
            ticket_id=ticket1.scenario_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
            dynamic_state={"dds": state1},
        )
        db.add(session1)
        await db.flush()

        card1 = IncidentCard(
            session_id=session1.session_id,
            scenario_id=ticket1.scenario_id,
            operator_id=cadet1.user_id,
            card_origin="DDS",
            filled_data={"address": "ул. Складская, 1"},
            status="Завершено",
        )
        db.add(card1)
        await db.flush()

        eval1 = EvaluationResult(
            session_id=session1.session_id,
            card_id=card1.card_id,
            scores={"final_score": 95.0, "total": 95.0, "is_passed": True},
            metrics={"ai_metric": 0.95},
            errors_list=[],
        )
        db.add(eval1)

        # Cadet 2 session: completed but unrated / awaiting review (score is None)
        state2 = {
            "incoming_card": {"address": "пр. Мира, 10"},
            "actions": [{"actor_id": cadet2.user_id, "kind": "status", "service_name": "02", "status": "Вызов принят", "order_number": "ORD-202"}],
            "submitted_at": now_iso,
        }
        session2 = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet2.user_id,
            ticket_id=ticket2.scenario_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
            dynamic_state={"dds": state2},
        )
        db.add(session2)
        await db.flush()

        card2 = IncidentCard(
            session_id=session2.session_id,
            scenario_id=ticket2.scenario_id,
            operator_id=cadet2.user_id,
            card_origin="DDS",
            filled_data={"address": "пр. Мира, 10"},
            status="Завершено",
        )
        db.add(card2)
        await db.flush()

        await db.commit()

        return {
            "owner_id": owner.user_id,
            "other_teacher_id": other_teacher.user_id,
            "cadet1_id": cadet1.user_id,
            "cadet2_id": cadet2.user_id,
            "other_cadet_id": other_cadet.user_id,
            "lesson_id": lesson.assignment_id,
            "session1_id": session1.session_id,
            "session2_id": session2.session_id,
            "card1_id": card1.card_id,
            "card2_id": card2.card_id,
            "eval1_id": eval1.evaluation_id,
        }


@pytest.mark.asyncio
async def test_lesson_analytics_returns_both_cadets_with_real_records():
    data = await setup_two_cadet_lesson()
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        # 1. Check GET /api/v1/lessons/{id}
        res_lesson = await client.get(
            f"/api/v1/lessons/{data['lesson_id']}",
            headers=auth_headers(data["owner_id"]),
        )
        assert res_lesson.status_code == 200, res_lesson.text
        lesson_data = res_lesson.json()
        assert len(lesson_data["students"]) == 2
        student_ids = {s["cadet_id"] for s in lesson_data["students"]}
        assert data["cadet1_id"] in student_ids
        assert data["cadet2_id"] in student_ids

        # Cadet 1 has real record_id matching card1
        cadet1_stat = next(s for s in lesson_data["students"] if s["cadet_id"] == data["cadet1_id"])
        assert len(cadet1_stat["tickets"]) >= 1
        assert cadet1_stat["tickets"][0]["record_id"] == data["card1_id"]
        assert cadet1_stat["tickets"][0]["score"] == 95.0
        assert cadet1_stat["tickets"][0]["status"] == "passed"

        # Cadet 2 has real record_id matching card2 without fake passing grade
        cadet2_stat = next(s for s in lesson_data["students"] if s["cadet_id"] == data["cadet2_id"])
        assert len(cadet2_stat["tickets"]) >= 1
        assert cadet2_stat["tickets"][0]["record_id"] == data["card2_id"]
        assert cadet2_stat["score"] is None or cadet2_stat["tickets"][0]["score"] is None

        # 2. Check dedicated /api/v1/analytics/lessons/{id}
        res_analytics = await client.get(
            f"/api/v1/analytics/lessons/{data['lesson_id']}",
            headers=auth_headers(data["owner_id"]),
        )
        assert res_analytics.status_code == 200, res_analytics.text
        analytics_data = res_analytics.json()
        assert len(analytics_data["cadets"]) == 2
        analytics_ids = {c["cadet_id"] for c in analytics_data["cadets"]}
        assert data["cadet1_id"] in analytics_ids
        assert data["cadet2_id"] in analytics_ids

        # Both records have valid IDs
        c1 = next(c for c in analytics_data["cadets"] if c["cadet_id"] == data["cadet1_id"])
        assert c1["records"][0]["record_id"] == data["card1_id"]
        assert c1["success_rate"] == 100.0 or c1["success_rate"] == 95.0

        c2 = next(c for c in analytics_data["cadets"] if c["cadet_id"] == data["cadet2_id"])
        assert c2["records"][0]["record_id"] == data["card2_id"]
        # Cadet 2 was not graded, should not have fabricated 100% success rate
        assert c2["success_rate"] is None


@pytest.mark.asyncio
async def test_lesson_analytics_forbidden_for_other_teacher_and_cadet():
    data = await setup_two_cadet_lesson()
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        # Foreign teacher cannot view this lesson
        res_other = await client.get(
            f"/api/v1/analytics/lessons/{data['lesson_id']}",
            headers=auth_headers(data["other_teacher_id"], role="TEACHER"),
        )
        assert res_other.status_code == 403, res_other.text

        # Cadet cannot view teacher analytics
        res_cadet = await client.get(
            f"/api/v1/analytics/lessons/{data['lesson_id']}",
            headers=auth_headers(data["cadet1_id"], role="CADET"),
        )
        assert res_cadet.status_code in (401, 403), res_cadet.text

        # Non-existent lesson returns 404
        res_404 = await client.get(
            f"/api/v1/analytics/lessons/nonexistent-{uuid4().hex[:6]}",
            headers=auth_headers(data["owner_id"], role="TEACHER"),
        )
        assert res_404.status_code == 404, res_404.text


@pytest.mark.asyncio
async def test_cadet_card_opens_in_record_detail():
    data = await setup_two_cadet_lesson()
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        # Owner teacher can open card1 details
        res1 = await client.get(
            f"/api/v1/analytics/records/{data['card1_id']}",
            headers=auth_headers(data["owner_id"]),
        )
        assert res1.status_code == 200, res1.text
        r1 = res1.json()
        assert r1["record_id"] == data["card1_id"]
        assert r1["cadet_name"] == "Курсант Смирнов"

        # Owner teacher can open card2 details
        res2 = await client.get(
            f"/api/v1/analytics/records/{data['card2_id']}",
            headers=auth_headers(data["owner_id"]),
        )
        assert res2.status_code == 200, res2.text
        r2 = res2.json()
        assert r2["record_id"] == data["card2_id"]
        assert r2["cadet_name"] == "Курсант Васильев"

        # Foreign teacher cannot open record detail
        res_foreign = await client.get(
            f"/api/v1/analytics/records/{data['card1_id']}",
            headers=auth_headers(data["other_teacher_id"]),
        )
        assert res_foreign.status_code == 403, res_foreign.text
