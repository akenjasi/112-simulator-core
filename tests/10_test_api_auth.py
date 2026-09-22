import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database import engine
from backend.models.base import Base
from backend.core.security import hash_password


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from backend.models.domain_01 import User
    from backend.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        user = User(
            username="test_admin",
            password_hash=hash_password("secret"),  # real bcrypt hash
            role="ADMIN",
        )
        session.add(user)
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_auth_login_success():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/api/auth/login",
            json={"username": "test_admin", "password": "secret", "role": "ADMIN"},
        )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["username"] == "test_admin"
    assert data["role"] == "ADMIN"


@pytest.mark.asyncio
async def test_auth_login_fail_wrong_password():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/api/auth/login",
            json={"username": "test_admin", "password": "wrong_password", "role": "ADMIN"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_auth_login_fail_wrong_role():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/api/auth/login",
            json={"username": "test_admin", "password": "secret", "role": "CADET"},
        )
    assert response.status_code == 401
