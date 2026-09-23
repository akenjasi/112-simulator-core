from sqlalchemy import text
import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User
from backend.core.security import hash_password, create_access_token


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed users for roles
    async with AsyncSessionLocal() as session:
        admin = User(username="admin_user", password_hash=hash_password("admin_pass"), role="ADMIN")
        teacher = User(username="teacher_user", password_hash=hash_password("teacher_pass"), role="TEACHER")
        cadet = User(username="cadet_user", password_hash=hash_password("cadet_pass"), role="CADET")
        session.add_all([admin, teacher, cadet])
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def get_token_for(username: str, role: str) -> str:
    async with AsyncSessionLocal() as session:
        result = await session.execute(text(f"SELECT user_id FROM users WHERE username = '{username}'"))
        user_id = str(result.scalar_one())
    return create_access_token(subject=user_id, role=role)


@pytest.mark.asyncio
async def test_rbac_admin_endpoint_no_token():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/api/admin/users")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_rbac_admin_endpoint_cadet_token():
    token = await get_token_for("cadet_user", "CADET")
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/api/admin/users", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_rbac_teacher_creates_cadet_success():
    token = await get_token_for("teacher_user", "TEACHER")
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/api/admin/users", json={
            "username": "new_cadet_by_teacher",
            "password": "pwd",
            "role": "CADET"
        }, headers=headers)
    assert response.status_code == 200
    assert response.json()["username"] == "new_cadet_by_teacher"


@pytest.mark.asyncio
async def test_rbac_teacher_creates_admin_forbidden():
    token = await get_token_for("teacher_user", "TEACHER")
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/api/admin/users", json={
            "username": "new_admin_by_teacher",
            "password": "pwd",
            "role": "ADMIN"
        }, headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_rbac_soft_delete():
    # Admin soft-deletes a cadet
    token = await get_token_for("admin_user", "ADMIN")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get cadet ID
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT user_id FROM users WHERE username = 'cadet_user'"))
        cadet_id = str(result.scalar_one())

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.delete(f"/api/admin/users/{cadet_id}", headers=headers)
    
    assert response.status_code == 200

    # Verify user is soft deleted in DB
    async with AsyncSessionLocal() as session:
        result = await session.execute(text(f"SELECT is_active FROM users WHERE user_id = '{cadet_id}'"))
        is_active = result.scalar_one()
        assert not is_active


    # Soft-deleted user token cannot access endpoints
    cadet_token = create_access_token(subject=cadet_id, role="CADET")
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get(f"/api/v2/sessions/dummy", headers={"Authorization": f"Bearer {cadet_token}"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_rbac_patch_user_by_admin():
    token = await get_token_for("admin_user", "ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT user_id FROM users WHERE username = 'cadet_user'"))
        cadet_id = str(result.scalar_one())

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.patch(f"/api/admin/users/{cadet_id}", json={
            "full_name": "Cadet Ivanov",
            "role": "TEACHER",
            "password": "new_password_123",
        }, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "Cadet Ivanov"
    assert data["role"] == "TEACHER"


@pytest.mark.asyncio
async def test_rbac_patch_user_by_teacher_forbidden():
    token = await get_token_for("teacher_user", "TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncSessionLocal() as session:
        cadet_res = await session.execute(text("SELECT user_id FROM users WHERE username = 'cadet_user'"))
        cadet_id = str(cadet_res.scalar_one())
        admin_res = await session.execute(text("SELECT user_id FROM users WHERE username = 'admin_user'"))
        admin_id = str(admin_res.scalar_one())

    # Teacher cannot change cadet role to ADMIN
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res1 = await ac.patch(f"/api/admin/users/{cadet_id}", json={
            "role": "ADMIN",
        }, headers=headers)
    assert res1.status_code == 403

    # Teacher cannot change an ADMIN user
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res2 = await ac.patch(f"/api/admin/users/{admin_id}", json={
            "full_name": "Hacked Admin",
        }, headers=headers)
    assert res2.status_code == 403


@pytest.mark.asyncio
async def test_rbac_delete_by_teacher():
    token = await get_token_for("teacher_user", "TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncSessionLocal() as session:
        admin_res = await session.execute(text("SELECT user_id FROM users WHERE username = 'admin_user'"))
        admin_id = str(admin_res.scalar_one())
        cadet_res = await session.execute(text("SELECT user_id FROM users WHERE username = 'cadet_user'"))
        cadet_id = str(cadet_res.scalar_one())

    # Teacher cannot delete an ADMIN
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res_admin = await ac.delete(f"/api/admin/users/{admin_id}", headers=headers)
    assert res_admin.status_code == 403

    # Teacher can delete a CADET
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res_cadet = await ac.delete(f"/api/admin/users/{cadet_id}", headers=headers)
    assert res_cadet.status_code == 200

