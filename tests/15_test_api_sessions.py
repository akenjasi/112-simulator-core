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
    from backend.models.domain_02 import ScenarioTicket
    from backend.models.domain_03 import Assignment
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        t = User(username="teacher", password_hash="h", role="TEACHER")
        c = User(username="cadet", password_hash="h", role="CADET")
        s = ScenarioTicket()
        session.add_all([t, c, s])
        await session.flush()
        
        a = Assignment(
            scenario_id=s.scenario_id,
            session_type="CALL_SIMULATION",
            assigned_by=t.user_id,
            available_from=datetime.datetime.now(datetime.timezone.utc),
            deadline=datetime.datetime.now(datetime.timezone.utc)
        )
        session.add(a)
        await session.commit()
        await session.refresh(a)
        yield a.assignment_id, c.user_id
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_start_session(init_db):
    assignment_id, cadet_id = init_db
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Start Session
        res = await ac.post(f"/api/v2/assignments/{assignment_id}/sessions/start", json={
            "cadet_id": cadet_id
        })
        assert res.status_code == 200
        data = res.json()
        assert "session_id" in data
        assert data["session_type"] == "CALL_SIMULATION"
        assert data["status"] == "active"
