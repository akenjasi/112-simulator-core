import pytest
import datetime
from httpx import AsyncClient

from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.core.security import create_access_token
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, EvaluationResult



@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_analytics_endpoints():
    async with AsyncSessionLocal() as session:
        # Create group
        group = StudentGroup(group_name="Группа 101")
        session.add(group)
        await session.flush()

        # Create cadets
        u1 = User(username="cadet1", password_hash="h", role="CADET", full_name="Иванов Иван", group_ids=[group.group_id])
        u2 = User(username="cadet2", password_hash="h", role="CADET", full_name="Петров Петр", group_ids=[group.group_id])
        session.add_all([u1, u2])
        await session.flush()

        group.cadet_ids = [u1.user_id, u2.user_id]
        session.add(group)

        # Create scenario tickets
        s1 = ScenarioTicket(settings={"category": "ДТП"})
        s2 = ScenarioTicket(settings={"category": "Пожары"})
        session.add_all([s1, s2])
        await session.flush()

        # Create assignment
        now = datetime.datetime.now(datetime.timezone.utc)
        a1 = Assignment(
            session_type="CALL_SIMULATION",
            group_id=group.group_id,
            scenario_id=s1.scenario_id,
            available_from=now,
            deadline=now,
        )
        session.add(a1)
        await session.flush()

        # Date 1: 2026-09-20
        d1 = datetime.datetime(2026, 9, 20, 10, 0, 0, tzinfo=datetime.timezone.utc)
        # Date 2: 2026-09-21
        d2 = datetime.datetime(2026, 9, 21, 10, 0, 0, tzinfo=datetime.timezone.utc)

        # Cadet 1 session on d1
        sess1 = ExamSession(
            session_type="CALL_SIMULATION",
            assignment_id=a1.assignment_id,
            cadet_id=u1.user_id,
            start_time=d1,
        )
        session.add(sess1)
        await session.flush()

        card1 = IncidentCard(
            session_id=sess1.session_id,
            scenario_id=s1.scenario_id,
            operator_id=u1.user_id,
            card_origin="runtime",
            filled_data={"category": "ДТП"},
        )
        session.add(card1)
        await session.flush()

        eval1 = EvaluationResult(
            card_id=card1.card_id,
            session_id=sess1.session_id,
            scores={"final_score": 80},
            metrics={"sla_metrics": {"time_to_first_dispatch_sec": 45}},
            errors_list=["over_dispatching", "missed_factoid"],
            evaluated_at=d1,
        )
        session.add(eval1)

        # Cadet 2 session on d1
        sess2 = ExamSession(
            session_type="CALL_SIMULATION",
            assignment_id=a1.assignment_id,
            cadet_id=u2.user_id,
            start_time=d1,
        )
        session.add(sess2)
        await session.flush()

        card2 = IncidentCard(
            session_id=sess2.session_id,
            scenario_id=s1.scenario_id,
            operator_id=u2.user_id,
            card_origin="runtime",
            filled_data={"category": "ДТП"},
        )
        session.add(card2)
        await session.flush()

        eval2 = EvaluationResult(
            card_id=card2.card_id,
            session_id=sess2.session_id,
            scores={"final_score": 90},
            metrics={"sla_metrics": {"time_to_first_dispatch_sec": 30}},
            errors_list=["over_dispatching"],
            evaluated_at=d1,
        )
        session.add(eval2)

        # Cadet 1 session on d2
        sess3 = ExamSession(
            session_type="CALL_SIMULATION",
            assignment_id=a1.assignment_id,
            cadet_id=u1.user_id,
            start_time=d2,
        )
        session.add(sess3)
        await session.flush()

        card3 = IncidentCard(
            session_id=sess3.session_id,
            scenario_id=s2.scenario_id,
            operator_id=u1.user_id,
            card_origin="runtime",
            filled_data={"category": "Пожары"},
        )
        session.add(card3)
        await session.flush()

        eval3 = EvaluationResult(
            card_id=card3.card_id,
            session_id=sess3.session_id,
            scores={"final_score": 95},
            metrics={"sla_metrics": {"time_to_first_dispatch_sec": 25}},
            errors_list=["address_error"],
            evaluated_at=d2,
        )
        session.add(eval3)

        # Cadet 2 session on d2
        sess4 = ExamSession(
            session_type="CALL_SIMULATION",
            assignment_id=a1.assignment_id,
            cadet_id=u2.user_id,
            start_time=d2,
        )
        session.add(sess4)
        await session.flush()

        card4 = IncidentCard(
            session_id=sess4.session_id,
            scenario_id=s2.scenario_id,
            operator_id=u2.user_id,
            card_origin="runtime",
            filled_data={"category": "Пожары"},
        )
        session.add(card4)
        await session.flush()

        eval4 = EvaluationResult(
            card_id=card4.card_id,
            session_id=sess4.session_id,
            scores={"final_score": 85},
            metrics={"sla_metrics": {"time_to_first_dispatch_sec": 50}},
            errors_list=["address_error"],
            evaluated_at=d2,
        )
        session.add(eval4)

        teacher = User(username="teacher_analytics", password_hash="h", role="TEACHER")
        session.add(teacher)

        await session.commit()
        u1_id = u1.user_id
        g_id = group.group_id
        token = create_access_token(subject=teacher.user_id, role="TEACHER")
        headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as ac:
        # 1. Test Heatmap

        res_hm = await ac.get("/api/analytics/heatmap", params={"group_id": g_id})
        assert res_hm.status_code == 200
        heatmap = res_hm.json()
        assert "ДТП" in heatmap
        assert heatmap["ДТП"]["over_dispatching"] == 2
        assert heatmap["ДТП"]["missed_factoid"] == 1
        assert "Пожары" in heatmap
        assert heatmap["Пожары"]["address_error"] == 2

        # 2. Test Trends for u1
        res_tr = await ac.get(f"/api/analytics/trends/{u1_id}", params={"group_id": g_id})
        assert res_tr.status_code == 200
        trends = res_tr.json()
        assert "2026-09-20" in trends
        assert trends["2026-09-20"]["user_score"] == 80
        assert trends["2026-09-20"]["group_avg"] == 90
        assert "2026-09-21" in trends
        assert trends["2026-09-21"]["user_score"] == 95
        assert trends["2026-09-21"]["group_avg"] == 85

        # 3. Test Leaderboard (final_score -> DESC)
        res_lb_score = await ac.get("/api/analytics/leaderboard", params={"group_id": g_id, "metric_name": "final_score"})
        assert res_lb_score.status_code == 200
        lb_score = res_lb_score.json()
        assert len(lb_score) == 2
        # u1: (80 + 95)/2 = 87.5
        # u2: (90 + 85)/2 = 87.5
        assert lb_score[0]["metric_value"] == 87.5
        assert lb_score[1]["metric_value"] == 87.5

        # 4. Test Leaderboard (time_to_first_dispatch_sec -> ASC)
        res_lb_time = await ac.get("/api/analytics/leaderboard", params={"group_id": g_id, "metric_name": "time_to_first_dispatch_sec"})
        assert res_lb_time.status_code == 200
        lb_time = res_lb_time.json()
        assert len(lb_time) == 2
        # u1: (45 + 25)/2 = 35.0
        # u2: (30 + 50)/2 = 40.0
        # ASC: u1 should be first
        assert lb_time[0]["cadet_name"] == "Иванов Иван"
        assert lb_time[0]["metric_value"] == 35.0
        assert lb_time[1]["cadet_name"] == "Петров Петр"
        assert lb_time[1]["metric_value"] == 40.0
