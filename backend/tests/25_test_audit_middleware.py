import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User, UserActionLog
from backend.core.security import hash_password, create_access_token
from sqlalchemy import select, func


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        admin = User(username="admin_audit", password_hash=hash_password("admin_pass"), role="ADMIN")
        session.add(admin)
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def get_admin_token() -> str:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User.user_id).where(User.username == 'admin_audit'))
        user_id = str(result.scalar_one())
    return create_access_token(subject=user_id, role="ADMIN")


@pytest.mark.asyncio
async def test_audit_middleware_logs_mutating_requests():
    token = await get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. GET request - should NOT be logged
    async with AsyncClient(app=app, base_url="http://test") as ac:
        await ac.get("/api/admin/users", headers=headers)
        
    async with AsyncSessionLocal() as session:
        count_get = await session.execute(select(func.count(UserActionLog.log_id)))
        assert count_get.scalar_one() == 0

    # 2. POST request - should BE logged
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # We try to create a user. Even if it fails validation, the attempt might be logged,
        # but let's send a valid payload.
        await ac.post("/api/admin/users", json={
            "username": "audit_test_user",
            "password": "pwd",
            "role": "CADET"
        }, headers=headers)

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(UserActionLog))
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].action.startswith("POST")
        assert "/api/admin/users" in logs[0].action
        assert logs[0].role == "ADMIN"


@pytest.mark.asyncio
async def test_audit_endpoint_permissions():
    token = await get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/audit-logs", headers=headers)
        
    # Endpoint should exist and be accessible to admin
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_audit_endpoint_forbidden_for_cadet_and_anonymous():
    # 1. Anonymous request -> 401
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/audit-logs")
    assert res.status_code == 401

    # 2. Cadet request -> 403
    async with AsyncSessionLocal() as session:
        cadet = User(username="cadet_audit", password_hash=hash_password("cadet_pass"), role="CADET")
        session.add(cadet)
        await session.commit()
        cadet_token = create_access_token(subject=cadet.user_id, role="CADET")

    headers = {"Authorization": f"Bearer {cadet_token}"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/audit-logs", headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_audit_endpoint_pagination():
    token = await get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Insert 5 logs directly
    async with AsyncSessionLocal() as session:
        for i in range(5):
            session.add(UserActionLog(
                user_id="test_uid",
                role="ADMIN",
                action=f"POST /api/test/{i}",
            ))
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Request limit=2
        res = await ac.get("/api/admin/audit-logs?limit=2&offset=0", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2

        # Request limit=2, offset=2
        res2 = await ac.get("/api/admin/audit-logs?limit=2&offset=2", headers=headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert len(data2) == 2
        assert data[0]["log_id"] != data2[0]["log_id"]


@pytest.mark.asyncio
async def test_audit_middleware_other_methods_and_invalid_token():
    token = await get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # PATCH request
    async with AsyncClient(app=app, base_url="http://test") as ac:
        await ac.patch("/api/admin/users/non-existent-id", json={"full_name": "New Name"}, headers=headers)

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(UserActionLog).where(UserActionLog.action.startswith("PATCH")))
        patch_logs = result.scalars().all()
        assert len(patch_logs) == 1
        assert "PATCH" in patch_logs[0].action

    # Request with invalid token does not crash and does not log
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/api/admin/users", json={"username": "invalid"}, headers={"Authorization": "Bearer badtoken"})
        assert res.status_code in (401, 403, 422)

    # Request with no token does not crash
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/api/admin/users", json={"username": "notoken"})
        assert res.status_code in (401, 403, 422)

