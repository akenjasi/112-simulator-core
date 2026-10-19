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


# ─── 1. THREE ACTIVE SESSIONS WITHOUT GRADES ─────────────────────────────────
@pytest.mark.asyncio
async def test_three_active_sessions_without_grades():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_1", "TEACHER", "Преподаватель 1")
        g1 = await _create_group(session, "Группа 101", t1.user_id)
        c1 = await _create_user(session, "cadet_1", "CADET", "Курсант 1")
        c2 = await _create_user(session, "cadet_2", "CADET", "Курсант 2")
        c3 = await _create_user(session, "cadet_3", "CADET", "Курсант 3")

        assignment = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="ACTIVE",
        )
        session.add(assignment)
        await session.flush()

        # 3 active sessions mimicking the 3 PostgreSQL DDS sessions
        for cadet in [c1, c2, c3]:
            es = ExamSession(
                assignment_id=assignment.assignment_id,
                cadet_id=cadet.user_id,
                session_type="CALL_SIMULATION",
                status="INITIALIZED",
            )
            session.add(es)
            await session.flush()

            tr = TicketResult(
                session_id=es.session_id,
                ticket_id="ticket-dds",
                is_passed=False,
                score_total=None,
                status="in_progress",
            )
            session.add(tr)
        await session.commit()
        teacher_id = t1.user_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        res = await ac.get("/api/analytics/overview")
        assert res.status_code == 200
        data = res.json()
        assert data["total_sessions"] == 3
        assert data["total_attempts"] == 3
        assert data["graded_attempts"] == 0
        assert data["pending_attempts"] == 3
        assert data["avg_score"] is None
        assert data["pass_rate"] is None


# ─── 2. COMPLETED UNEVALUATED SESSION NOT FAILED ─────────────────────────────
@pytest.mark.asyncio
async def test_completed_unevaluated_session_not_failed():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_comp", "TEACHER", "Преподаватель Тест")
        g1 = await _create_group(session, "Группа 102", t1.user_id)
        c1 = await _create_user(session, "cadet_comp", "CADET", "Курсант Тест")

        assignment = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(assignment)
        await session.flush()

        es = ExamSession(
            assignment_id=assignment.assignment_id,
            cadet_id=c1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(es)
        await session.flush()

        # Ticket finished but not evaluated yet
        tr = TicketResult(
            session_id=es.session_id,
            ticket_id="ticket-uneval",
            is_passed=False,
            score_total=None,
            status="completed",
        )
        session.add(tr)
        await session.commit()
        teacher_id = t1.user_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        res = await ac.get("/api/analytics/overview")
        assert res.status_code == 200
        data = res.json()
        assert data["graded_attempts"] == 0
        assert data["pending_attempts"] == 1
        assert data["avg_score"] is None
        assert data["pass_rate"] is None


# ─── 3. REAL ZERO GRADE (0.0) PRESERVED ──────────────────────────────────────
@pytest.mark.asyncio
async def test_real_zero_grade_preserved():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_zero", "TEACHER", "Преподаватель Ноль")
        g1 = await _create_group(session, "Группа 103", t1.user_id)
        c1 = await _create_user(session, "cadet_zero", "CADET", "Курсант Ноль")

        assignment = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(assignment)
        await session.flush()

        es = ExamSession(
            assignment_id=assignment.assignment_id,
            cadet_id=c1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(es)
        await session.flush()

        tr = TicketResult(
            session_id=es.session_id,
            ticket_id="ticket-zero",
            is_passed=False,
            score_total=0.0,
            status="completed",
        )
        session.add(tr)
        await session.commit()
        teacher_id = t1.user_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        res = await ac.get("/api/analytics/overview")
        assert res.status_code == 200
        data = res.json()
        assert data["graded_attempts"] == 1
        assert data["pending_attempts"] == 0
        assert data["avg_score"] == 0.0
        assert data["pass_rate"] == 0.0


# ─── 4. SINGLE ATTEMPT WITH MULTIPLE EVALUATIONS (NO MULTIPLICATION) ──────────
@pytest.mark.asyncio
async def test_single_attempt_multiple_evaluations_no_multiplication():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_multi_eval", "TEACHER", "Преподаватель М")
        g1 = await _create_group(session, "Группа 104", t1.user_id)
        c1 = await _create_user(session, "cadet_multi_eval", "CADET", "Курсант М")

        assignment = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
        )
        session.add(assignment)
        await session.flush()

        es = ExamSession(
            assignment_id=assignment.assignment_id,
            cadet_id=c1.user_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
        )
        session.add(es)
        await session.flush()

        card = IncidentCard(
            session_id=es.session_id,
            card_origin="test",
            status="closed",
        )
        session.add(card)
        await session.flush()

        # Two evaluation results for the exact same session (e.g. initial and revised)
        now = datetime.now(timezone.utc)
        er1 = EvaluationResult(
            card_id=card.card_id,
            session_id=es.session_id,
            scores={"total": 70.0},
            evaluated_at=now - timedelta(minutes=10),
        )
        er2 = EvaluationResult(
            card_id=card.card_id,
            session_id=es.session_id,
            scores={"total": 85.0},
            evaluated_at=now,
        )
        session.add_all([er1, er2])

        tr = TicketResult(
            session_id=es.session_id,
            ticket_id="ticket-card",
            is_passed=True,
            score_total=85.0,
            status="completed",
        )
        session.add(tr)
        await session.commit()
        teacher_id = t1.user_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        res = await ac.get("/api/analytics/overview")
        assert res.status_code == 200
        data = res.json()
        assert data["total_sessions"] == 1
        assert data["total_attempts"] == 1
        assert data["graded_attempts"] == 1
        assert data["pending_attempts"] == 0
        assert data["avg_score"] == 85.0


# ─── 5. MULTIPLE TICKET RESULTS NO CARTESIAN DUPLICATES ──────────────────────
@pytest.mark.asyncio
async def test_no_cartesian_product_on_joins():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_cart", "TEACHER", "Преподаватель С")
        g1 = await _create_group(session, "Группа 105", t1.user_id)
        c1 = await _create_user(session, "cadet_cart_1", "CADET", "Курсант С1")
        c2 = await _create_user(session, "cadet_cart_2", "CADET", "Курсант С2")

        assignment = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(assignment)
        await session.flush()

        # 2 sessions, each having 2 tickets = 4 distinct attempts
        for cadet in [c1, c2]:
            es = ExamSession(
                assignment_id=assignment.assignment_id,
                cadet_id=cadet.user_id,
                session_type="CALL_SIMULATION",
                status="COMPLETED",
            )
            session.add(es)
            await session.flush()

            for i in range(2):
                card = IncidentCard(session_id=es.session_id, card_origin="sim")
                session.add(card)
                await session.flush()

                er = EvaluationResult(
                    card_id=card.card_id,
                    session_id=es.session_id,
                    scores={"total": 90.0},
                )
                session.add(er)

                tr = TicketResult(
                    session_id=es.session_id,
                    ticket_id=f"ticket-cart-{i}",
                    is_passed=True,
                    score_total=90.0,
                    status="completed",
                )
                session.add(tr)
        await session.commit()
        teacher_id = t1.user_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        res = await ac.get("/api/analytics/overview")
        assert res.status_code == 200
        data = res.json()
        assert data["total_sessions"] == 2
        assert data["total_attempts"] == 4
        assert data["graded_attempts"] == 4
        assert data["pending_attempts"] == 0
        assert data["avg_score"] == 90.0


# ─── 6. WEIGHTED AVERAGE CALCULATION (1 ON 100, 9 ON 0 = 10.0) ───────────────
@pytest.mark.asyncio
async def test_weighted_average_calculation():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_weighted", "TEACHER", "Преподаватель В")
        g1 = await _create_group(session, "Группа 106", t1.user_id)
        c1 = await _create_user(session, "cadet_weighted", "CADET", "Курсант В")

        assignment = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(assignment)
        await session.flush()

        day1 = datetime.now(timezone.utc) - timedelta(days=2)
        day2 = datetime.now(timezone.utc) - timedelta(days=1)

        # Day 1: 1 attempt with score 100.0
        es1 = ExamSession(
            assignment_id=assignment.assignment_id,
            cadet_id=c1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
            start_time=day1,
        )
        session.add(es1)
        await session.flush()
        tr1 = TicketResult(
            session_id=es1.session_id,
            ticket_id="ticket-d1",
            is_passed=True,
            score_total=100.0,
            status="completed",
            created_at=day1,
        )
        session.add(tr1)

        # Day 2: 9 attempts with score 0.0
        for i in range(9):
            es2 = ExamSession(
                assignment_id=assignment.assignment_id,
                cadet_id=c1.user_id,
                session_type="CALL_SIMULATION",
                status="COMPLETED",
                start_time=day2,
            )
            session.add(es2)
            await session.flush()
            tr2 = TicketResult(
                session_id=es2.session_id,
                ticket_id=f"ticket-d2-{i}",
                is_passed=False,
                score_total=0.0,
                status="completed",
                created_at=day2,
            )
            session.add(tr2)

        await session.commit()
        teacher_id = t1.user_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        res = await ac.get("/api/analytics/overview?days=30")
        assert res.status_code == 200
        data = res.json()
        assert data["graded_attempts"] == 10
        # True weighted average: (1 * 100.0 + 9 * 0.0) / 10 = 10.0
        assert data["avg_score"] == 10.0
        assert data["pass_rate"] == 10.0


# ─── 7. EXPERT GRADE OVERRIDE & AUDIT LOG ────────────────────────────────────
@pytest.mark.asyncio
async def test_expert_grade_override_and_audit_log():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_audit", "TEACHER", "Преподаватель Аудит")
        g1 = await _create_group(session, "Группа 107", t1.user_id)
        c1 = await _create_user(session, "cadet_audit", "CADET", "Курсант Аудит")

        assignment = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(assignment)
        await session.flush()

        es = ExamSession(
            assignment_id=assignment.assignment_id,
            cadet_id=c1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(es)
        await session.flush()

        tr = TicketResult(
            session_id=es.session_id,
            ticket_id="ticket-audit",
            is_passed=False,
            score_total=40.0,
            status="completed",
        )
        session.add(tr)
        await session.commit()
        teacher_id = t1.user_id
        record_id = tr.result_id
        session_id = es.session_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        # Teacher overrides the grade via appeal
        appeal_res = await ac.patch(
            f"/api/v1/analytics/records/{record_id}/appeal",
            json={"status": "passed", "comment": "Апелляция удовлетворена: адрес верный"},
        )
        assert appeal_res.status_code == 200
        appeal_data = appeal_res.json()
        assert appeal_data["status"] == "passed"
        assert appeal_data["score"] == 100.0
        assert appeal_data["is_appealed"] is True

        # Check record detail
        rec_res = await ac.get(f"/api/v1/analytics/records/{record_id}")
        assert rec_res.status_code == 200
        rec_data = rec_res.json()
        assert rec_data["status"] == "passed"
        assert rec_data["score"] == 100.0

        # Check session detail
        ses_res = await ac.get(f"/api/v1/analytics/sessions/{session_id}")
        assert ses_res.status_code == 200
        ses_data = ses_res.json()
        cadet_rec = ses_data["cadets"][0]["records"][0]
        assert cadet_rec["status"] == "passed"
        assert cadet_rec["score"] == 100.0

        # Check overview reflects the update
        ov_res = await ac.get("/api/analytics/overview")
        assert ov_res.status_code == 200
        ov_data = ov_res.json()
        assert ov_data["avg_score"] == 100.0
        assert ov_data["pass_rate"] == 100.0

    # Verify audit log in database
    async with AsyncSessionLocal() as session:
        logs_res = await session.execute(
            select(UserActionLog).where(UserActionLog.action_type == "GRADE_MODIFIED")
        )
        logs = logs_res.scalars().all()
        assert len(logs) >= 1
        log = logs[-1]
        assert str(log.user_id) == str(teacher_id)
        import json
        details = json.loads(log.details) if isinstance(log.details, str) else log.details
        assert "old_is_passed" in details
        assert "new_is_passed" in details
        assert details["new_is_passed"] is True


# ─── 8. GROUP FILTER SWITCHING & EMPTY GROUP ─────────────────────────────────
@pytest.mark.asyncio
async def test_group_filter_clearing_and_empty_group():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_filter", "TEACHER", "Преподаватель Ф")
        g_full = await _create_group(session, "Группа с данными", t1.user_id)
        g_empty = await _create_group(session, "Группа пустая", t1.user_id)
        c1 = await _create_user(session, "cadet_f", "CADET", "Курсант Ф")

        asg = Assignment(
            group_id=g_full.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(asg)
        await session.flush()

        es = ExamSession(
            assignment_id=asg.assignment_id,
            cadet_id=c1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(es)
        await session.flush()

        tr = TicketResult(
            session_id=es.session_id,
            ticket_id="ticket-f",
            is_passed=True,
            score_total=92.0,
            status="completed",
        )
        session.add(tr)
        await session.commit()
        teacher_id = t1.user_id
        empty_gid = g_empty.group_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        # Querying the empty group
        res = await ac.get(f"/api/analytics/overview?group_id={empty_gid}")
        assert res.status_code == 200
        data = res.json()
        assert data["total_sessions"] == 0
        assert data["total_attempts"] == 0
        assert data["graded_attempts"] == 0
        assert data["pending_attempts"] == 0
        assert data["avg_score"] is None
        assert data["pass_rate"] is None
        assert data["daily_dynamics"] == []


# ─── 9. SCENARIO MODIFICATION PRESERVES HISTORY ──────────────────────────────
@pytest.mark.asyncio
async def test_scenario_modification_preserves_history():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_snap", "TEACHER", "Преподаватель Снимок")
        g1 = await _create_group(session, "Группа 108", t1.user_id)
        c1 = await _create_user(session, "cadet_snap", "CADET", "Курсант Снимок")

        scenario = ScenarioTicket(
            title="Оригинальный сценарий: Пожар склада",
            category="fire",
            content={"address": "ул. Складская, 10"},
            ground_truth={"services": ["01"]},
        )
        session.add(scenario)
        await session.flush()

        asg = Assignment(
            group_id=g1.group_id,
            assigned_by=t1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(asg)
        await session.flush()

        es = ExamSession(
            assignment_id=asg.assignment_id,
            ticket_id=scenario.scenario_id,
            cadet_id=c1.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(es)
        await session.flush()

        card = IncidentCard(
            session_id=es.session_id,
            scenario_id=scenario.scenario_id,
            filled_data={"address": "ул. Складская, 10"},
            card_origin="test",
        )
        session.add(card)
        await session.flush()

        tr = TicketResult(
            session_id=es.session_id,
            ticket_id=scenario.scenario_id,
            is_passed=True,
            score_total=95.0,
            status="completed",
        )
        session.add(tr)
        await session.commit()

        # Teacher or admin subsequently renames or archives the scenario
        scenario.title = "Измененный сценарий: Ложный вызов"
        scenario.is_deleted = True
        await session.commit()

        teacher_id = t1.user_id
        session_id = es.session_id
        record_id = tr.result_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        res = await ac.get(f"/api/v1/analytics/sessions/{session_id}")
        assert res.status_code == 200
        data = res.json()
        assert len(data["cadets"]) == 1
        rec = data["cadets"][0]["records"][0]
        assert rec["score"] == 95.0
        assert rec["status"] == "passed"

        rec_res = await ac.get(f"/api/v1/analytics/records/{record_id}")
        assert rec_res.status_code == 200
        rec_data = rec_res.json()
        assert rec_data["score"] == 95.0


# ─── 10. NON-EXISTENT SESSION & RECORD RETURN 404 (NO STUBS) ─────────────────
@pytest.mark.asyncio
async def test_missing_session_and_record_return_404():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_404", "TEACHER", "Преподаватель 404")
        await session.commit()
        teacher_id = t1.user_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        fake_uuid = str(uuid.uuid4())
        res_session = await ac.get(f"/api/v1/analytics/sessions/{fake_uuid}")
        assert res_session.status_code == 404, f"Expected 404, got {res_session.status_code}"

        res_record = await ac.get(f"/api/v1/analytics/records/{fake_uuid}")
        assert res_record.status_code == 404, f"Expected 404, got {res_record.status_code}"


# ─── 11. TEACHER CANNOT ACCESS FOREIGN GROUP OR SESSION (403) ────────────────
@pytest.mark.asyncio
async def test_teacher_cannot_access_foreign_group_or_session():
    async with AsyncSessionLocal() as session:
        t1 = await _create_user(session, "teacher_auth1", "TEACHER", "Преподаватель Раз")
        t2 = await _create_user(session, "teacher_auth2", "TEACHER", "Преподаватель Два")

        g2 = await _create_group(session, "Группа Учителя 2", t2.user_id)
        c2 = await _create_user(session, "cadet_auth2", "CADET", "Курсант Два")

        asg2 = Assignment(
            group_id=g2.group_id,
            assigned_by=t2.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(asg2)
        await session.flush()

        es2 = ExamSession(
            assignment_id=asg2.assignment_id,
            cadet_id=c2.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        session.add(es2)
        await session.flush()

        tr2 = TicketResult(
            session_id=es2.session_id,
            ticket_id="ticket-foreign",
            is_passed=True,
            score_total=88.0,
            status="completed",
        )
        session.add(tr2)
        await session.commit()

        t1_id = t1.user_id
        g2_id = g2.group_id
        s2_id = es2.session_id
        tr2_id = tr2.result_id

    # Token for Teacher 1 trying to access Teacher 2's group/session/record
    token_t1 = create_access_token(subject=str(t1_id), role="TEACHER")
    headers_t1 = {"Authorization": f"Bearer {token_t1}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers_t1) as ac:
        # Overview filtered to foreign group: 403 Forbidden
        res_ov = await ac.get(f"/api/analytics/overview?group_id={g2_id}")
        assert res_ov.status_code == 403

        # Session detail for foreign session: 403 Forbidden
        res_ses = await ac.get(f"/api/v1/analytics/sessions/{s2_id}")
        assert res_ses.status_code == 403

        # Record detail for foreign record: 403 Forbidden
        res_rec = await ac.get(f"/api/v1/analytics/records/{tr2_id}")
        assert res_rec.status_code == 403

        # Appeal for foreign record: 403 Forbidden
        res_app = await ac.patch(
            f"/api/v1/analytics/records/{tr2_id}/appeal",
            json={"status": "passed", "comment": "Hacked appeal"},
        )
        assert res_app.status_code == 403
