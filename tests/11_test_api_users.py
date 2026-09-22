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
async def test_users_crud():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Create
        res = await ac.post("/api/admin/users", json={
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
        res2 = await ac.get("/api/admin/users")
        assert res2.status_code == 200
        users = res2.json()
        assert isinstance(users, list)
        assert len(users) == 1
        assert users[0]["username"] == "new_cadet"
