"""Heatmap rows and aggregates must describe cadets only."""

import uuid

import pytest

from backend.models.domain_01 import StudentGroup, User
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import TicketResult


@pytest.mark.asyncio
async def test_heatmap_excludes_staff_students_and_anonymous_sessions(auth_client, db_session):
    suffix = uuid.uuid4().hex
    group = StudentGroup(group_name=f"Heatmap {suffix}", cadet_ids=[])
    db_session.add(group)
    await db_session.flush()
    assignment = Assignment(group_id=group.group_id)
    db_session.add(assignment)
    await db_session.flush()

    cadet = None
    for role in ("CADET", "ADMIN", "TEACHER", "STUDENT", None):
        user = None
        if role:
            user = User(username=f"heatmap_{role}_{suffix}", password_hash="unused", role=role)
            db_session.add(user)
            await db_session.flush()
            if role == "CADET":
                cadet = user
        session = ExamSession(
            session_type="CALL_SIMULATION",
            assignment_id=assignment.assignment_id,
            cadet_id=user.user_id if user else None,
        )
        db_session.add(session)
        await db_session.flush()
        db_session.add(TicketResult(
            session_id=session.session_id,
            error_details=[{"penalty_type": "comm_rude_tone", "category": "communication"}],
        ))
    await db_session.commit()

    for prefix in ("/api/analytics", "/api/v1/analytics"):
        response = await auth_client.get(f"{prefix}/errors-heatmap", params={"group_id": group.group_id})
        assert response.status_code == 200, response.text
        body = response.json()
        assert [entity["id"] for entity in body["entities"]] == [cadet.user_id]
        assert body["totals_by_error"] == {"comm_rude_tone": 1}

        response = await auth_client.get(f"{prefix}/errors-heatmap", params={
            "group_id": group.group_id, "entity_type": "groups",
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body["entities"]) == 1
        assert body["entities"][0]["total_errors"] == 1
        assert body["totals_by_error"] == {"comm_rude_tone": 1}
