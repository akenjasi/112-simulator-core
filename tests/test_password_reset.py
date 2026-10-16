from datetime import datetime, timedelta, timezone
import uuid

import pytest
from httpx import AsyncClient

from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import User


OLD_PASSWORD = "old_password_123"
CUSTOM_PASSWORD = "my_custom_password_456"


async def _create_user(role: str) -> User:
    async with AsyncSessionLocal() as db:
        user = User(
            username=f"password_{uuid.uuid4().hex}",
            password_hash=hash_password(OLD_PASSWORD),
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _login(client: AsyncClient, user: User, password: str):
    return await client.post(
        "/api/auth/login",
        json={"username": user.username, "password": password, "role": user.role},
    )


@pytest.mark.asyncio
async def test_custom_password_unlocks_account_and_keeps_existing_session():
    admin = await _create_user("ADMIN")
    target = await _create_user("CADET")
    admin_token = create_access_token(subject=admin.user_id, role=admin.role)

    async with AsyncClient(app=app, base_url="http://test") as client:
        login = await _login(client, target, OLD_PASSWORD)
        target_token = login.json()["access_token"]

        async with AsyncSessionLocal() as db:
            stored_target = await db.get(User, target.user_id)
            stored_target.failed_login_attempts = 5
            stored_target.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.commit()

        reset = await client.post(
            f"/api/admin/users/{target.user_id}/reset-password",
            headers=_headers(admin_token),
            json={"password": CUSTOM_PASSWORD, "revoke_sessions": False},
        )

        assert reset.status_code == 200
        assert reset.json()["new_password"] == CUSTOM_PASSWORD
        assert reset.json()["password_was_generated"] is False
        assert reset.json()["sessions_revoked"] is False
        assert (
            await client.get("/api/v1/users/me", headers=_headers(target_token))
        ).status_code == 200
        assert (await _login(client, target, OLD_PASSWORD)).status_code == 401
        assert (await _login(client, target, CUSTOM_PASSWORD)).status_code == 200


@pytest.mark.asyncio
async def test_generated_password_obeys_policy_and_can_be_used():
    admin = await _create_user("ADMIN")
    target = await _create_user("CADET")
    admin_token = create_access_token(subject=admin.user_id, role=admin.role)

    async with AsyncClient(app=app, base_url="http://test") as client:
        reset = await client.post(
            f"/api/admin/users/{target.user_id}/reset-password",
            headers=_headers(admin_token),
        )

        assert reset.status_code == 200
        generated_password = reset.json()["new_password"]
        assert reset.json()["password_was_generated"] is True
        assert len(generated_password) >= 8
        assert (await _login(client, target, generated_password)).status_code == 200


@pytest.mark.asyncio
async def test_blank_custom_password_is_rejected_instead_of_generating_one():
    admin = await _create_user("ADMIN")
    target = await _create_user("CADET")
    admin_token = create_access_token(subject=admin.user_id, role=admin.role)

    async with AsyncClient(app=app, base_url="http://test") as client:
        reset = await client.post(
            f"/api/admin/users/{target.user_id}/reset-password",
            headers=_headers(admin_token),
            json={"password": "   ", "revoke_sessions": False},
        )

        assert reset.status_code == 400


@pytest.mark.asyncio
async def test_password_reset_can_explicitly_revoke_sessions():
    admin = await _create_user("ADMIN")
    target = await _create_user("CADET")
    admin_token = create_access_token(subject=admin.user_id, role=admin.role)

    async with AsyncClient(app=app, base_url="http://test") as client:
        login = await _login(client, target, OLD_PASSWORD)
        target_token = login.json()["access_token"]

        reset = await client.post(
            f"/api/admin/users/{target.user_id}/reset-password",
            headers=_headers(admin_token),
            json={"password": CUSTOM_PASSWORD, "revoke_sessions": True},
        )

        assert reset.status_code == 200
        assert reset.json()["sessions_revoked"] is True
        assert (
            await client.get("/api/v1/users/me", headers=_headers(target_token))
        ).status_code == 401
