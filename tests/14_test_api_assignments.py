import pytest
import uuid
import datetime
from httpx import AsyncClient
from backend.main import app
from backend.database import engine
from backend.models.base import Base

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Needs a user and a scenario
    from backend.models.domain_01 import User
    from backend.models.domain_02 import ScenarioTicket
    from backend.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        u = User(username="teacher", password_hash="h", role="TEACHER")
        s = ScenarioTicket()
        session.add(u)
        session.add(s)
        await session.commit()
        await session.refresh(u)
        await session.refresh(s)
        yield u.user_id, s.scenario_id
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_assignments_crud(init_db, auth_client):
    teacher_id, scenario_id = init_db
    
    # Create
    res = await auth_client.post("/api/admin/assignments", json={
        "scenario_id": scenario_id,
        "session_type": "CALL_SIMULATION",
        "assigned_by": teacher_id,
        "available_from": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "deadline": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })
    assert res.status_code == 200
    data = res.json()
    assert "assignment_id" in data
    assert data["session_type"] == "CALL_SIMULATION"

    # List
    res2 = await auth_client.get("/api/admin/assignments")
    assert res2.status_code == 200
    assignments = res2.json()
    assert isinstance(assignments, list)
    assert len(assignments) == 1
    assert assignments[0]["assignment_id"] == data["assignment_id"]

