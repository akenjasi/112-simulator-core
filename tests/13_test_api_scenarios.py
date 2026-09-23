import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database import engine
from backend.models.base import Base

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_scenarios_crud(auth_client):
    # Create
    res = await auth_client.post("/api/admin/scenarios", json={
        "settings": {"difficulty": "hard"},
    })
    assert res.status_code == 200
    data = res.json()
    assert "scenario_id" in data
    assert data["settings"]["difficulty"] == "hard"

    # List
    res2 = await auth_client.get("/api/admin/scenarios")
    assert res2.status_code == 200
    scenarios = res2.json()
    assert isinstance(scenarios, list)
    assert len(scenarios) == 1
    assert scenarios[0]["settings"]["difficulty"] == "hard"

