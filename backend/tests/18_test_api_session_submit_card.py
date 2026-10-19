import pytest
import datetime
from httpx import AsyncClient
from backend.main import app
from backend.database import engine
from backend.models.base import Base

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    from backend.models.domain_01 import User
    from backend.models.domain_03 import Assignment, ExamSession
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        t = User(username="t", password_hash="h", role="TEACHER")
        session.add(t)
        await session.flush()
        
        a = Assignment(
            session_type="CALL_SIMULATION",
            assigned_by=t.user_id,
            available_from=datetime.datetime.now(datetime.timezone.utc),
            deadline=datetime.datetime.now(datetime.timezone.utc)
        )
        session.add(a)
        await session.flush()
        
        e = ExamSession(
            session_type="CALL_SIMULATION",
            assignment_id=a.assignment_id,
            cadet_id=t.user_id,
            status="active"
        )
        session.add(e)
        await session.commit()
        await session.refresh(e)
        yield e.session_id, t.user_id
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_session_submit_card(init_db, auth_client):
    session_id, user_id = init_db
    
    res = await auth_client.post(f"/api/v2/sessions/{session_id}/submit_card", json={
        "operator_id": user_id,
        "filled_data": {"address": "Minsk"},
        "assigned_services": ["101"]
    })
    assert res.status_code == 200
    data = res.json()
    assert "card_id" in data
    assert data["session_status"] == "COMPLETED"
    
    # Check if session was closed
    state_res = await auth_client.get(f"/api/v2/sessions/{session_id}")
    assert state_res.json()["status"] == "COMPLETED"

