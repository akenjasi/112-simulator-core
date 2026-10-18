"""Comprehensive tests for DDS grading context, etalon vs student actions, and historical snapshotting."""
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

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


def auth_headers(uid: str, role: str = "TEACHER"):
    return {"Authorization": "Bearer " + create_access_token(subject=uid, role=role)}


@pytest.mark.asyncio
async def test_dds_context_extracts_cadet_actions_and_verbatim_text():
    """Verifies that cadet's own actions and verbatim comments are extracted,

    while system autostatuses and incoming 112 card data are not attributed as cadet text.
    """
    async with AsyncSessionLocal() as db:
        teacher = User(username="t_" + uuid4().hex[:8], password_hash="hash", role="TEACHER", is_active=True)
        cadet = User(username="c_" + uuid4().hex[:8], password_hash="hash", role="CADET", is_active=True)
        db.add_all([teacher, cadet])
        await db.flush()

        group = StudentGroup(name="Группа ДДС 101", teacher_id=teacher.user_id, cadet_ids=[cadet.user_id])
        ticket = ScenarioTicket(
            title="Запах газа в подъезде",
            category="Газовая служба",
            settings={
                "subcategory": "Утечка газа",
                "dds_etalon": {
                    "service_name": "104",
                    "expected_decision": "Принять",
                    "decision_rationale": "Газовая авария в жилом секторе",
                    "expected_stages": ["Принята", "В пути", "Завершено"],
                    "expected_result": "Утечка устранена, проведен контрольный замер",
                    "required_comment_points": ["концентрация газа", "номер наряда"],
                    "sample_comment": "Концентрация в норме, наряд закрыт",
                    "confirmation_time_limit_seconds": 30,
                }
            },
            ground_truth={
                "dds_etalon": {
                    "service_name": "104",
                    "expected_decision": "Принять",
                    "decision_rationale": "Газовая авария в жилом секторе",
                    "expected_stages": ["Принята", "В пути", "Завершено"],
                    "expected_result": "Утечка устранена, проведен контрольный замер",
                    "required_comment_points": ["концентрация газа", "номер наряда"],
                    "sample_comment": "Концентрация в норме, наряд закрыт",
                    "confirmation_time_limit_seconds": 30,
                }
            },
        )
        db.add_all([group, ticket])
        await db.flush()

        lesson = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            status="COMPLETED",
            target_role="DISPATCHER_DDS",
            scenario_id=ticket.scenario_id,
        )
        db.add(lesson)
        await db.flush()

        start_time = datetime(2026, 10, 18, 10, 0, 0, tzinfo=timezone.utc)
        action_time_1 = datetime(2026, 10, 18, 10, 0, 18, tzinfo=timezone.utc).isoformat()
        action_time_2 = datetime(2026, 10, 18, 10, 5, 0, tzinfo=timezone.utc).isoformat()

        # Dynamic state with system autostatuses AND cadet's actions
        dds_state = {
            "submitted_at": datetime(2026, 10, 18, 10, 6, 0, tzinfo=timezone.utc).isoformat(),
            "directed_at": start_time.isoformat(),
            "incoming_card": {
                "category": "Газовая служба",
                "subcategory": "Утечка газа",
                "description": "Сильный запах газа на 3 этаже",
                "caller": {"name": "Петров П.П.", "role": "Очевидец"},
                "phones": {"aon": "+79991234567"},
                "statuses": {"injured": "нет", "blocked": "нет"},
            },
            "actions": [
                # System automatic status without comment -> should be filtered out
                {"status": "Добавлена", "service_name": "104", "comment": None},
                {"status": "Получена службой", "service_name": "104", "comment": ""},
                # Cadet's real actions
                {
                    "status": "Принята",
                    "service_name": "104",
                    "actor_id": cadet.user_id,
                    "at": action_time_1,
                    "comment": "Карточка принята дежурным диспетчером 104",
                },
                {
                    "status": "Завершено",
                    "service_name": "104",
                    "actor_id": cadet.user_id,
                    "at": action_time_2,
                    "comment": "Утечка ликвидирована на фланцевом соединении",
                    "who_accepted": "Диспетчер ГорГаз Сидоров",
                    "order_number": "Г-4482",
                    "summary": "Работы завершены в полном объеме",
                },
            ],
        }

        session = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet.user_id,
            ticket_id=ticket.scenario_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
            start_time=start_time,
            dynamic_state={
                "dds": dds_state,
                "_gradebook_snapshot": {
                    "ticket_id": ticket.scenario_id,
                    "dds_etalon": ticket.settings["dds_etalon"],
                    "etalon": ticket.ground_truth,
                    "incoming_card": dds_state["incoming_card"],
                },
            },
        )
        db.add(session)
        await db.flush()
        await db.commit()

        card = IncidentCard(
            session_id=session.session_id,
            scenario_id=ticket.scenario_id,
            operator_id=cadet.user_id,
            card_origin="DDS",
            filled_data={"incoming_description": "Не должно быть ответом курсанта"},
        )
        db.add(card)
        await db.commit()
        card_id = card.card_id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/analytics/records/{card_id}", headers=auth_headers(teacher.user_id))
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Incident Context
        ctx = data["incident_context"]
        assert ctx["category"] == "Газовая служба"
        assert ctx["subcategory"] == "Утечка газа"
        assert ctx["caller_name"] == "Петров П.П."
        assert ctx["caller_phone"] == "+79991234567"
        assert "speaker" not in ctx
        assert "gender" not in ctx

        # Actions: only cadet's 2 actions, autostatuses excluded
        actions = data["cadet_actions"]
        assert len(actions) == 2
        assert actions[0]["status"] == "Принята"
        assert actions[0]["seconds_from_start"] == 18
        assert actions[0]["comment"] == "Карточка принята дежурным диспетчером 104"

        assert actions[1]["status"] == "Завершено"
        assert actions[1]["who_accepted"] == "Диспетчер ГорГаз Сидоров"
        assert actions[1]["order_number"] == "Г-4482"
        assert actions[1]["summary"] == "Работы завершены в полном объеме"

        # 4 Criteria comparison
        assert data["has_dds_etalon"] is True
        cmp = data["dds_comparison"]
        assert cmp["decision"]["expected_decision"] == "Принять"
        assert cmp["decision"]["actual_decision"] == "Принята"

        assert cmp["timeliness"]["normative_seconds"] == 30
        assert cmp["timeliness"]["actual_seconds"] == 18
        assert cmp["timeliness"]["is_recorded"] is True

        assert "Завершено" in [stg["status"] for stg in cmp["progression"]["actual_stages"]]
        assert "Г-4482" in [msg["order_number"] for msg in cmp["comment"]["actual_messages"]]


@pytest.mark.asyncio
async def test_missing_actions_handled_honestly_without_fake_zeros():
    """Verifies that missing actions and missing timing are reported honestly,

    without inventing fake 0 seconds or fabricated delays.
    """
    async with AsyncSessionLocal() as db:
        teacher = User(username="t_" + uuid4().hex[:8], password_hash="hash", role="TEACHER", is_active=True)
        cadet = User(username="c_" + uuid4().hex[:8], password_hash="hash", role="CADET", is_active=True)
        db.add_all([teacher, cadet])
        await db.flush()

        group = StudentGroup(name="Группа без действий", teacher_id=teacher.user_id, cadet_ids=[cadet.user_id])
        ticket = ScenarioTicket(title="Происшествие без действий", category="ДТП", content={})
        db.add_all([group, ticket])
        await db.flush()

        lesson = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            status="COMPLETED",
            target_role="DISPATCHER_DDS",
            scenario_id=ticket.scenario_id,
        )
        db.add(lesson)
        await db.flush()

        # Session has NO start_time and NO actions
        session = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet.user_id,
            ticket_id=ticket.scenario_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
            start_time=None,
            dynamic_state={"dds": {"submitted_at": datetime.now(timezone.utc).isoformat(), "actions": []}},
        )
        db.add(session)
        await db.flush()

        card = IncidentCard(
            session_id=session.session_id,
            scenario_id=ticket.scenario_id,
            operator_id=cadet.user_id,
            card_origin="DDS",
        )
        db.add(card)
        await db.commit()
        card_id = card.card_id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/analytics/records/{card_id}", headers=auth_headers(teacher.user_id))
        assert resp.status_code == 200
        data = resp.json()

        assert data["cadet_actions"] == []
        cmp = data["dds_comparison"]
        assert cmp["has_cadet_actions"] is False
        assert cmp["decision"]["actual_decision"] is None
        assert cmp["timeliness"]["actual_seconds"] is None
        assert cmp["timeliness"]["is_recorded"] is False
        assert "Подтверждение не выполнено" in (cmp["timeliness"]["note"] or "")


@pytest.mark.asyncio
async def test_historical_snapshot_immutability_on_ticket_edit():
    """Verifies that subsequent edits to ScenarioTicket do not overwrite or alter

    the historical DDS requirements saved in a completed session.
    """
    async with AsyncSessionLocal() as db:
        teacher = User(username="t_" + uuid4().hex[:8], password_hash="hash", role="TEACHER", is_active=True)
        cadet = User(username="c_" + uuid4().hex[:8], password_hash="hash", role="CADET", is_active=True)
        db.add_all([teacher, cadet])
        await db.flush()

        group = StudentGroup(name="Группа снимков", teacher_id=teacher.user_id, cadet_ids=[cadet.user_id])
        ticket = ScenarioTicket(
            title="Билет со снимком",
            category="Пожары",
            settings={
                "dds_etalon": {
                    "service_name": "101",
                    "expected_decision": "Принять",
                    "decision_rationale": "Историческое обоснование 1",
                }
            },
            ground_truth={"dds_etalon": {"service_name": "101", "expected_decision": "Принять"}},
        )
        db.add_all([group, ticket])
        await db.flush()

        lesson = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            status="COMPLETED",
            target_role="DISPATCHER_DDS",
            scenario_id=ticket.scenario_id,
        )
        db.add(lesson)
        await db.flush()

        session = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet.user_id,
            ticket_id=ticket.scenario_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
            start_time=datetime(2026, 10, 18, 9, 0, 0, tzinfo=timezone.utc),
            dynamic_state={
                "dds": {"submitted_at": datetime(2026, 10, 18, 9, 5, 0, tzinfo=timezone.utc).isoformat()},
                "_gradebook_snapshot": {
                    "ticket_id": ticket.scenario_id,
                    "dds_etalon": ticket.settings["dds_etalon"],
                    "etalon": ticket.ground_truth,
                },
            },
        )
        db.add(session)
        await db.flush()

        card = IncidentCard(
            session_id=session.session_id,
            scenario_id=ticket.scenario_id,
            operator_id=cadet.user_id,
            card_origin="DDS",
        )
        db.add(card)
        await db.commit()
        card_id = card.card_id
        scenario_id = ticket.scenario_id

    # Now teacher edits the ticket in the database or via API to "Не принята"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        edit_resp = await client.patch(
            f"/api/tickets/{scenario_id}",
            headers=auth_headers(teacher.user_id),
            json={
                "dds_etalon": {
                    "service_name": "101",
                    "expected_decision": "Не принята",
                    "decision_rationale": "Новое отредактированное обоснование",
                }
            },
        )
        assert edit_resp.status_code == 200, edit_resp.text

        # Fetch attempt detail for the completed session
        resp = await client.get(f"/api/v1/analytics/records/{card_id}", headers=auth_headers(teacher.user_id))
        assert resp.status_code == 200
        data = resp.json()

        # The attempt MUST STILL have the historical expected decision "Принять", NOT "Не принята"
        assert data["dds_etalon"]["expected_decision"] == "Принять"
        assert data["dds_comparison"]["decision"]["expected_decision"] == "Принять"
        assert data["dds_comparison"]["decision"]["rationale"] == "Историческое обоснование 1"


@pytest.mark.asyncio
async def test_old_ticket_without_dds_etalon_shows_honest_absence_and_allows_grading():
    """Verifies that an old attempt without DDS etalon sets has_dds_etalon=False,

    displays honest absence, and still permits manual grading by the teacher.
    """
    async with AsyncSessionLocal() as db:
        teacher = User(username="t_" + uuid4().hex[:8], password_hash="hash", role="TEACHER", is_active=True)
        cadet = User(username="c_" + uuid4().hex[:8], password_hash="hash", role="CADET", is_active=True)
        db.add_all([teacher, cadet])
        await db.flush()

        group = StudentGroup(name="Старая группа", teacher_id=teacher.user_id, cadet_ids=[cadet.user_id])
        # Old ticket only had applicant/voice keys in ground_truth, NO DDS requirements
        ticket = ScenarioTicket(
            title="Старый билет без эталона",
            category="ЖКХ",
            ground_truth={"fio": "Иванов И.И.", "phone": "12345", "speaker": "bayan", "gender": "male"},
        )
        db.add_all([group, ticket])
        await db.flush()

        lesson = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            status="COMPLETED",
            target_role="DISPATCHER_DDS",
            scenario_id=ticket.scenario_id,
        )
        db.add(lesson)
        await db.flush()

        session = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet.user_id,
            ticket_id=ticket.scenario_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
            dynamic_state={
                "dds": {
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                    "actions": [
                        {"status": "Принята", "comment": "Служба ЖКХ приняла заявку", "seconds_from_start": 25, "actor_id": cadet.user_id}
                    ],
                },
                "_gradebook_snapshot": {
                    "ticket_id": ticket.scenario_id,
                    "etalon": ticket.ground_truth,
                },
            },
        )
        db.add(session)
        await db.flush()

        card = IncidentCard(
            session_id=session.session_id,
            scenario_id=ticket.scenario_id,
            operator_id=cadet.user_id,
            card_origin="DDS",
        )
        db.add(card)
        await db.commit()
        card_id = card.card_id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/analytics/records/{card_id}", headers=auth_headers(teacher.user_id))
        assert resp.status_code == 200
        data = resp.json()

        # Must report has_dds_etalon = False
        assert data["has_dds_etalon"] is False
        assert data["dds_etalon"] is None
        # But cadet's actual actions are preserved and visible
        assert len(data["cadet_actions"]) == 1
        assert data["cadet_actions"][0]["comment"] == "Служба ЖКХ приняла заявку"

        # Grading is not blocked: teacher can set grade
        grade_resp = await client.post(
            f"/api/v1/analytics/records/{card_id}/grade-override",
            headers=auth_headers(teacher.user_id),
            json={"score": 85.0, "reason": "Оценка работы по фактическим действиям", "comment": "Хорошо"},
        )
        assert grade_resp.status_code == 200
        assert grade_resp.json()["new_score"] == 85.0


@pytest.mark.asyncio
async def test_dds_grading_audit_and_permissions():
    """Verifies that teacher grade override creates a proper UserActionLog audit record

    and unauthorized teachers are rejected with 403 Forbidden.
    """
    async with AsyncSessionLocal() as db:
        teacher_owner = User(username="owner_" + uuid4().hex[:8], password_hash="hash", role="TEACHER", is_active=True)
        teacher_other = User(username="other_" + uuid4().hex[:8], password_hash="hash", role="TEACHER", is_active=True)
        cadet = User(username="c_" + uuid4().hex[:8], password_hash="hash", role="CADET", is_active=True)
        db.add_all([teacher_owner, teacher_other, cadet])
        await db.flush()

        group = StudentGroup(name="Группа с проверкой прав", teacher_id=teacher_owner.user_id, cadet_ids=[cadet.user_id])
        ticket = ScenarioTicket(title="Билет аудита", category="Пожары", content={})
        db.add_all([group, ticket])
        await db.flush()

        lesson = Assignment(
            group_id=group.group_id,
            assigned_by=teacher_owner.user_id,
            status="COMPLETED",
            target_role="DISPATCHER_DDS",
            scenario_id=ticket.scenario_id,
        )
        db.add(lesson)
        await db.flush()

        session = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet.user_id,
            ticket_id=ticket.scenario_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
            dynamic_state={
                "dds": {
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                    "actions": [{"status": "Принята", "comment": "Диспетчер 101 принял", "seconds_from_start": 20}],
                },
                "_gradebook_snapshot": {"ticket_id": ticket.scenario_id, "etalon": {}},
            },
        )
        db.add(session)
        await db.flush()

        card = IncidentCard(
            session_id=session.session_id,
            scenario_id=ticket.scenario_id,
            operator_id=cadet.user_id,
            card_origin="DDS",
        )
        db.add(card)
        await db.flush()

        # Existing initial AI evaluation with score 60
        ev = EvaluationResult(
            card_id=card.card_id,
            session_id=session.session_id,
            scores={"final_score": 60.0, "total": 60.0},
        )
        db.add(ev)
        await db.commit()
        card_id = card.card_id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Other teacher cannot access or override (403 Forbidden)
        forbidden_resp = await client.get(f"/api/v1/analytics/records/{card_id}", headers=auth_headers(teacher_other.user_id))
        assert forbidden_resp.status_code == 403

        override_fail_resp = await client.post(
            f"/api/v1/analytics/records/{card_id}/grade-override",
            headers=auth_headers(teacher_other.user_id),
            json={"score": 90.0, "reason": "Чужой преподаватель", "comment": "Не должно пройти"},
        )
        assert override_fail_resp.status_code == 403

        # 2. Owner teacher successfully overrides score
        ok_resp = await client.post(
            f"/api/v1/analytics/records/{card_id}/grade-override",
            headers=auth_headers(teacher_owner.user_id),
            json={"score": 95.5, "reason": "Учтены фактические действия курсанта", "comment": "Отличная работа"},
        )
        assert ok_resp.status_code == 200
        override_data = ok_resp.json()
        assert override_data["old_score"] == 60.0
        assert override_data["new_score"] == 95.5

        # 3. Verify detail endpoint preserves original AI score and returns expert score
        detail_resp = await client.get(f"/api/v1/analytics/records/{card_id}", headers=auth_headers(teacher_owner.user_id))
        assert detail_resp.status_code == 200
        detail_data = detail_resp.json()
        assert detail_data["automatic_score"] == 60.0
        assert detail_data["expert_score"] == 95.5
        assert detail_data["score"] == 95.5
        assert detail_data["teacher_comment"] == "Отличная работа"

    # 4. Check audit log in DB
    async with AsyncSessionLocal() as db:
        logs_res = await db.execute(
            select(UserActionLog).where(
                UserActionLog.action == "GRADE_OVERRIDE",
                UserActionLog.target_id == card_id,
            )
        )
        log = logs_res.scalar_one_or_none()
        assert log is not None
        assert log.user_id == teacher_owner.user_id
        details = json.loads(log.details) if isinstance(log.details, str) else log.details
        assert details["old_score"] == 60.0
        assert details["new_score"] == 95.5
        assert details["reason"] == "Учтены фактические действия курсанта"

