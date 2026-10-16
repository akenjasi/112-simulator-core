import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from backend.core.security import create_access_token, decode_access_token, hash_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import AuthSession, User, UserActionLog


PASSWORD = "correct_password_123"


async def _create_user(role: str = "ADMIN") -> User:
    async with AsyncSessionLocal() as db:
        user = User(
            username=f"session_{uuid.uuid4().hex}",
            password_hash=hash_password(PASSWORD),
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


async def _login(client: AsyncClient, user: User, password: str = PASSWORD):
    return await client.post(
        "/api/auth/login",
        json={"username": user.username, "password": password, "role": user.role},
    )


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_login_creates_tracked_session_and_audit_event():
    user = await _create_user()

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await _login(client, user)

    assert response.status_code == 200
    token = response.json()["access_token"]
    payload = decode_access_token(token)
    assert payload is not None and payload.get("jti")

    async with AsyncSessionLocal() as db:
        tracked = await db.scalar(
            select(AuthSession).where(AuthSession.session_id == payload["jti"])
        )
        refreshed_user = await db.get(User, user.user_id)
        actions = (
            await db.execute(
                select(UserActionLog.action).where(UserActionLog.user_id == user.user_id)
            )
        ).scalars().all()

    assert tracked is not None
    assert tracked.revoked_at is None
    assert refreshed_user is not None and refreshed_user.last_login is not None
    assert "LOGIN" in actions


@pytest.mark.asyncio
async def test_five_failed_logins_lock_account_and_are_audited():
    user = await _create_user()

    async with AsyncClient(app=app, base_url="http://test") as client:
        for _ in range(5):
            response = await _login(client, user, password="wrong-password")
            assert response.status_code == 401
        locked_response = await _login(client, user)

    assert locked_response.status_code == 423
    async with AsyncSessionLocal() as db:
        refreshed_user = await db.get(User, user.user_id)
        failed_events = await db.scalar(
            select(func.count(UserActionLog.log_id)).where(
                UserActionLog.user_id == user.user_id,
                UserActionLog.action == "LOGIN_FAILED",
            )
        )

    assert refreshed_user is not None
    assert refreshed_user.failed_login_attempts == 5
    assert refreshed_user.locked_until is not None
    assert failed_events == 5


@pytest.mark.asyncio
async def test_only_five_active_sessions_are_kept():
    user = await _create_user()

    async with AsyncClient(app=app, base_url="http://test") as client:
        for _ in range(6):
            response = await _login(client, user)
            assert response.status_code == 200

    async with AsyncSessionLocal() as db:
        active_count = await db.scalar(
            select(func.count(AuthSession.session_id)).where(
                AuthSession.user_id == user.user_id,
                AuthSession.revoked_at.is_(None),
            )
        )

    assert active_count == 5


@pytest.mark.asyncio
async def test_logout_revokes_only_current_session_and_logout_all_revokes_rest():
    user = await _create_user()

    async with AsyncClient(app=app, base_url="http://test") as client:
        first = await _login(client, user)
        second = await _login(client, user)
        first_token = first.json()["access_token"]
        second_token = second.json()["access_token"]

        logout = await client.post("/api/auth/logout", headers=_headers(first_token))
        assert logout.status_code == 200
        assert (await client.get("/api/v1/users/me", headers=_headers(first_token))).status_code == 401
        assert (await client.get("/api/v1/users/me", headers=_headers(second_token))).status_code == 200

        logout_all = await client.post("/api/auth/logout-all", headers=_headers(second_token))
        assert logout_all.status_code == 200
        assert (await client.get("/api/v1/users/me", headers=_headers(second_token))).status_code == 401

    async with AsyncSessionLocal() as db:
        actions = (
            await db.execute(
                select(UserActionLog.action).where(UserActionLog.user_id == user.user_id)
            )
        ).scalars().all()

    assert actions.count("LOGOUT") >= 2


@pytest.mark.asyncio
async def test_password_change_revokes_target_users_sessions():
    admin = await _create_user(role="ADMIN")
    target = await _create_user(role="CADET")
    admin_token = create_access_token(subject=admin.user_id, role=admin.role)

    async with AsyncClient(app=app, base_url="http://test") as client:
        login_response = await _login(client, target)
        target_token = login_response.json()["access_token"]

        update_response = await client.patch(
            f"/api/admin/users/{target.user_id}",
            headers=_headers(admin_token),
            json={"password": "new_secure_password_456"},
        )
        assert update_response.status_code == 200
        assert (
            await client.get("/api/v1/users/me", headers=_headers(target_token))
        ).status_code == 401
