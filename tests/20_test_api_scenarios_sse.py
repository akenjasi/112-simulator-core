import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database import engine
from backend.models.base import Base

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    from backend.models.domain_02 import ScenarioTicket
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        s = ScenarioTicket()
        session.add(s)
        await session.commit()
        await session.refresh(s)
        yield s.scenario_id
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_scenario_sse_events(init_db, auth_client):
    scenario_id = init_db
    
    res = await auth_client.get(f"/api/admin/scenarios/{scenario_id}/events")
    assert res.status_code == 200
    # Should be Server-Sent Events stream
    assert "text/event-stream" in res.headers.get("content-type", "")
    # The content should contain standard SSE format data
    content = res.text
    assert "event: status" in content
    assert "data: " in content

