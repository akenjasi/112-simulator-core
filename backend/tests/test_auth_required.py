"""Regression tests: demo authentication must never unlock protected APIs."""

import pytest
from httpx import AsyncClient

from backend.core.security import hash_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import User


async def _create_active_admin(username: str) -> None:
    async with AsyncSessionLocal() as session:
        session.add(
            User(
                username=username,
                password_hash=hash_password("a-real-password"),
                role="ADMIN",
                is_active=True,
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_protected_endpoint_rejects_missing_or_demo_bearer_tokens():
    """An active admin in the database is not a substitute for a real JWT."""
    await _create_active_admin("strict_auth_admin")

    async with AsyncClient(app=app, base_url="http://test") as client:
        missing_token = await client.get("/api/admin/security-policies")
        demo_token = await client.get(
            "/api/admin/security-policies",
            headers={"Authorization": "Bearer demo_token"},
        )

    assert missing_token.status_code == 401
    assert demo_token.status_code == 401


@pytest.mark.asyncio
async def test_login_rejects_the_former_demo_password():
    """The old `demo` password must not issue a JWT for a real account."""
    await _create_active_admin("no_demo_login")

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/login",
            json={"username": "no_demo_login", "password": "demo", "role": "ADMIN"},
        )

    assert response.status_code == 401
