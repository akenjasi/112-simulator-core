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
async def test_scenario_generate_and_compile(init_db):
    scenario_id = init_db
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post(f"/api/admin/scenarios/{scenario_id}/generate")
        assert res.status_code == 200
        data = res.json()
        assert "job_id" in data
        
        res_compile = await ac.post(f"/api/admin/scenarios/{scenario_id}/compile")
        assert res_compile.status_code == 200
        data_compile = res_compile.json()
        assert data_compile["success"] is True
