"""Test suite for Task 75: Advanced Analytics & Dummy Data Seeder.

Verifies:
- Seeder generates >= 50 students (cadets) across 3-5 groups.
- Seeder generates 10-20 TicketResults per student across different dates (over the last month).
- Diverse error types generated (communication, card, SLA).
- Analytics API endpoints return structured data for charts:
  - GET /api/analytics/dynamics (daily scores and volume for Line Chart)
  - GET /api/analytics/groups-comparison (group performance comparison for Bar Chart)
  - GET /api/analytics/errors-heatmap (2D error frequency matrix for Heatmap)
  - GET /api/analytics/heatmap (scenario category heatmap)
"""

import pytest
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlalchemy import select, func

from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_04 import TicketResult, EvaluationResult
from backend.core.security import create_access_token
from scripts.seed import seed_analytics_data, ERROR_TYPES


@pytest.fixture(autouse=True)
async def init_clean_db():
    """Ensure database schema is fresh before test and torn down after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_dummy_data_seeder_and_analytics():
    """
    Test that the system seeds enough dummy data for analytics (>50 users, 3-5 groups,
    10-20 TicketResults per user with diverse errors) and that the analytics endpoints
    return structured data for frontend charts.
    """
    # ─── 1. Run Seeder ─────────────────────────────────────────────────────────
    async with AsyncSessionLocal() as session:
        seed_res = await seed_analytics_data(
            db=session,
            num_students=55,
            min_tickets=10,
            max_tickets=20,
            num_groups=4,
        )
        assert seed_res["status"] == "success"

        # ─── 2. Database Checks ────────────────────────────────────────────────
        # A. Check >50 students (cadets)
        cadets_res = await session.execute(
            select(User).where(User.role == "CADET")
        )
        cadets = cadets_res.scalars().all()
        assert len(cadets) >= 50, f"Expected at least 50 cadets, found {len(cadets)}"
        assert len(cadets) == 55

        # B. Check 3-5 groups
        groups_res = await session.execute(select(StudentGroup))
        groups = groups_res.scalars().all()
        assert 3 <= len(groups) <= 5, f"Expected 3-5 groups, found {len(groups)}"

        # Verify all cadets are assigned to groups
        for cadet in cadets:
            assert len(cadet.group_ids) > 0, f"Cadet {cadet.user_id} has no group_ids"

        # C. Check TicketResults (10-20 per student, dates over last month)
        tr_res = await session.execute(select(TicketResult))
        ticket_results = tr_res.scalars().all()
        assert len(ticket_results) >= 55 * 10, f"Expected at least 550 ticket results, found {len(ticket_results)}"

        # Check dates span across multiple days
        session_dates = {tr.created_at.strftime("%Y-%m-%d") for tr in ticket_results if tr.created_at}
        assert len(session_dates) >= 15, f"Expected sessions on at least 15 distinct dates, found {len(session_dates)}"

        # D. Check errors taxonomy diversity (communication, card, SLA)
        found_categories = set()
        found_error_keys = set()
        for tr in ticket_results:
            if isinstance(tr.error_details, list):
                for err in tr.error_details:
                    if isinstance(err, dict):
                        if "category" in err:
                            found_categories.add(err["category"])
                        if "penalty_type" in err:
                            found_error_keys.add(err["penalty_type"])

        assert "communication" in found_categories, "Missing communication errors"
        assert "card" in found_categories, "Missing card filling errors"
        assert "sla" in found_categories, "Missing SLA errors"
        assert len(found_error_keys) >= 5, "Expected a variety of error keys"

        # Create teacher token for analytics API requests
        teacher_res = await session.execute(select(User).where(User.role == "TEACHER"))
        teacher = teacher_res.scalars().first()
        token = create_access_token(subject=teacher.user_id, role="TEACHER")
        headers = {"Authorization": f"Bearer {token}"}
        target_group_id = groups[0].group_id

    # ─── 3. Analytics Endpoints Checks ─────────────────────────────────────────
    async with AsyncClient(app=app, base_url="http://test", headers=headers) as client:
        # A. GET /api/analytics/dynamics (Line Chart: Daily Score Dynamics)
        res_dyn = await client.get("/api/analytics/dynamics", params={"days": 30})
        assert res_dyn.status_code == 200, f"Dynamics failed: {res_dyn.text}"
        dyn_data = res_dyn.json()
        assert isinstance(dyn_data, list)
        assert len(dyn_data) > 0
        first_dyn = dyn_data[0]
        assert "date" in first_dyn
        assert "avg_score" in first_dyn
        assert "total_sessions" in first_dyn
        assert "pass_rate" in first_dyn
        assert 0.0 <= first_dyn["avg_score"] <= 100.0

        # Filter dynamics by group
        res_dyn_group = await client.get("/api/analytics/dynamics", params={"group_id": target_group_id, "days": 30})
        assert res_dyn_group.status_code == 200
        dyn_grp_data = res_dyn_group.json()
        assert isinstance(dyn_grp_data, list)

        # B. GET /api/analytics/groups-comparison (Bar Chart: Groups Comparison)
        res_comp = await client.get("/api/analytics/groups-comparison")
        assert res_comp.status_code == 200, f"Groups comparison failed: {res_comp.text}"
        comp_data = res_comp.json()
        assert isinstance(comp_data, list)
        assert len(comp_data) == len(groups)
        for g_item in comp_data:
            assert "group_id" in g_item
            assert "group_name" in g_item
            assert "student_count" in g_item
            assert g_item["student_count"] >= 10
            assert "avg_score" in g_item
            assert 0.0 <= g_item["avg_score"] <= 100.0
            assert "pass_rate" in g_item
            assert "total_sessions" in g_item
            assert g_item["total_sessions"] > 0

        # C. GET /api/analytics/errors-heatmap (Heatmap: Error Frequency Matrix)
        res_hm = await client.get("/api/analytics/errors-heatmap")
        assert res_hm.status_code == 200, f"Errors heatmap failed: {res_hm.text}"
        hm_data = res_hm.json()
        assert "error_types" in hm_data
        assert "entities" in hm_data
        assert "totals_by_error" in hm_data

        # Verify error types contain communication, card, and sla
        hm_categories = {et["category"] for et in hm_data["error_types"]}
        assert "communication" in hm_categories
        assert "card" in hm_categories
        assert "sla" in hm_categories

        # Verify entities contain students with counts
        assert len(hm_data["entities"]) == 55
        first_entity = hm_data["entities"][0]
        assert "id" in first_entity
        assert "name" in first_entity
        assert "error_counts" in first_entity
        assert "total_errors" in first_entity

        # Test entity_type="groups"
        res_hm_groups = await client.get("/api/analytics/errors-heatmap", params={"entity_type": "groups"})
        assert res_hm_groups.status_code == 200
        hm_groups_data = res_hm_groups.json()
        assert len(hm_groups_data["entities"]) == len(groups)

        # Test category filter
        res_hm_comm = await client.get("/api/analytics/errors-heatmap", params={"category": "communication"})
        assert res_hm_comm.status_code == 200
        hm_comm_data = res_hm_comm.json()
        assert all(et["category"] == "communication" for et in hm_comm_data["error_types"])

        # D. GET /api/analytics/heatmap (Original Heatmap Compatibility)
        res_orig_hm = await client.get("/api/analytics/heatmap")
        assert res_orig_hm.status_code == 200
        orig_hm_data = res_orig_hm.json()
        assert isinstance(orig_hm_data, dict)
        assert len(orig_hm_data) > 0
