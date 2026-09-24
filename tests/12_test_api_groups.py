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

@pytest.mark.asyncio
async def test_v1_groups_and_csv_upload(auth_client):
    # Create via v1
    res = await auth_client.post("/api/v1/groups", json={
        "group_name": "Group 101",
        "department": "Communication Dept"
    })
    assert res.status_code == 200
    group = res.json()
    group_id = group["group_id"]
    assert "profile" not in group

    # Upload CSV
    csv_content = "first_name,last_name,email\nИван,Иванов,ivan@test.local\nПетр,Петров,petr@test.local"
    files = {"file": ("students.csv", csv_content.encode("utf-8"), "text/csv")}
    res_csv = await auth_client.post(f"/api/v1/groups/{group_id}/students/csv", files=files)
    assert res_csv.status_code == 200
    data = res_csv.json()
    assert data["count"] == 2
    assert len(data["cadet_ids"]) == 2

    # Verify list
    res_list = await auth_client.get("/api/v1/groups")
    assert res_list.status_code == 200
    all_groups = res_list.json()
    target = next(g for g in all_groups if g["group_id"] == group_id)
    assert len(target["cadet_ids"]) == 2

