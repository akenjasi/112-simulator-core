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
async def test_users_crud(auth_client):
    # Create
    res = await auth_client.post("/api/admin/users", json={
        "username": "new_cadet",
        "password": "pwd",
        "role": "CADET",
        "full_name": "Ivanov I.I."
    })
    assert res.status_code == 200
    data = res.json()
    assert data["username"] == "new_cadet"
    assert "user_id" in data

    # List
    res2 = await auth_client.get("/api/admin/users")
    assert res2.status_code == 200
    users = res2.json()
    assert isinstance(users, list)
    assert any(u["username"] == "new_cadet" for u in users)

