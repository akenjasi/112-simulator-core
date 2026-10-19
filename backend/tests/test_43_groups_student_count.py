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
async def test_group_student_count_empty_and_populated(auth_client: AsyncClient):
    # 1. Create an empty group
    res = await auth_client.post("/api/v1/groups", json={
        "group_name": "ИБ-22",
        "department": "Информационная безопасность"
    })
    assert res.status_code == 200
    group_data = res.json()
    group_id = group_data["group_id"]
    assert group_data.get("student_count") == 0

    # 2. Check GET /api/v1/groups returns student_count = 0
    res_list = await auth_client.get("/api/v1/groups")
    assert res_list.status_code == 200
    groups = res_list.json()
    target = next((g for g in groups if g["group_id"] == group_id), None)
    assert target is not None
    assert target["student_count"] == 0

    # 3. Add students via CSV
    csv_content = "first_name,last_name,email\nИван,Иванов,ivan@test.local\nПетр,Петров,petr@test.local\nСидор,Сидоров,sidor@test.local"
    files = {"file": ("students.csv", csv_content.encode("utf-8"), "text/csv")}
    res_csv = await auth_client.post(f"/api/v1/groups/{group_id}/students/csv", files=files)
    assert res_csv.status_code == 200

    # 4. Check GET /api/v1/groups returns updated student_count = 3
    res_list_after = await auth_client.get("/api/v1/groups")
    assert res_list_after.status_code == 200
    groups_after = res_list_after.json()
    target_after = next((g for g in groups_after if g["group_id"] == group_id), None)
    assert target_after is not None
    assert target_after["student_count"] == 3
