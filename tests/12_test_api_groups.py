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
async def test_groups_crud(auth_client):
    # Create
    res = await auth_client.post("/api/admin/groups", json={
        "group_name": "Group A",
        "department": "Fire Dept"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["group_name"] == "Group A"
    assert "group_id" in data

    # List
    res2 = await auth_client.get("/api/admin/groups")
    assert res2.status_code == 200
    groups = res2.json()
    assert isinstance(groups, list)
    assert len(groups) == 1
    assert groups[0]["group_name"] == "Group A"

