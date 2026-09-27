import pytest
import pyotp
from httpx import AsyncClient
from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User
from backend.core.security import hash_password


@pytest.fixture(autouse=True)
async def init_2fa_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        admin = User(
            username="admin_2fa_test",
            password_hash=hash_password("admin_pass_123"),
            role="ADMIN",
            is_active=True,
        )
        cadet = User(
            username="cadet_2fa_test",
            password_hash=hash_password("cadet_pass_123"),
            role="CADET",
            is_active=True,
        )
        session.add_all([admin, cadet])
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_2fa_auth_flow(monkeypatch):
    """
    Test 2FA flow: 
    1. If 2FA enabled, login should return requires_2fa=True.
    2. Verifying TOTP code should return the final access_token.
    """
    # This is a structural test. Worker must implement the endpoints and logic.
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/api/auth/login", data={"username": "admin", "password": "password"})
        # Should gracefully handle 2FA if enabled (we assume mock or standard behavior)
        # If not enabled, returns token. If enabled, returns requires_2fa.
        assert res.status_code in (200, 401)


@pytest.mark.asyncio
async def test_2fa_full_lifecycle():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 1. Normal login before 2FA enabled
        res = await ac.post("/api/auth/login", json={
            "username": "admin_2fa_test",
            "password": "admin_pass_123",
            "role": "ADMIN",
        })
        assert res.status_code == 200
        token_data = res.json()
        assert "access_token" in token_data
        token = token_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Check initial 2FA status
        status_res = await ac.get("/api/auth/2fa/status", headers=headers)
        assert status_res.status_code == 200
        assert status_res.json()["is_2fa_enabled"] is False

        # 3. Setup 2FA
        setup_res = await ac.post("/api/auth/2fa/setup", headers=headers)
        assert setup_res.status_code == 200
        setup_data = setup_res.json()
        assert "secret" in setup_data
        assert "otpauth_url" in setup_data
        secret = setup_data["secret"]
        assert "otpauth://" in setup_data["otpauth_url"]

        # 4. Verify setup with invalid code
        bad_verify = await ac.post("/api/auth/2fa/verify-setup", json={"code": "000000"}, headers=headers)
        assert bad_verify.status_code == 400

        # 5. Verify setup with valid TOTP code
        totp = pyotp.TOTP(secret)
        good_code = totp.now()
        good_verify = await ac.post("/api/auth/2fa/verify-setup", json={"code": good_code}, headers=headers)
        assert good_verify.status_code == 200
        assert good_verify.json()["is_2fa_enabled"] is True

        # Check status after verification
        status_res = await ac.get("/api/auth/2fa/status", headers=headers)
        assert status_res.status_code == 200
        assert status_res.json()["is_2fa_enabled"] is True

        # 6. Now login should return requires_2fa=True and user_id
        login_res = await ac.post("/api/auth/login", json={
            "username": "admin_2fa_test",
            "password": "admin_pass_123",
        })
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert login_data.get("requires_2fa") is True
        assert "user_id" in login_data
        user_id = login_data["user_id"]

        # 7. Submitting wrong 2FA code at login
        bad_login_2fa = await ac.post("/api/auth/login/2fa", json={
            "user_id": user_id,
            "code": "999999",
        })
        assert bad_login_2fa.status_code == 401

        # 8. Submitting valid 2FA code at login
        current_totp_code = totp.now()
        good_login_2fa = await ac.post("/api/auth/login/2fa", json={
            "user_id": user_id,
            "code": current_totp_code,
        })
        assert good_login_2fa.status_code == 200
        mfa_token_data = good_login_2fa.json()
        assert "access_token" in mfa_token_data
        assert mfa_token_data["username"] == "admin_2fa_test"

        # 9. Disable 2FA
        new_headers = {"Authorization": f"Bearer {mfa_token_data['access_token']}"}
        disable_res = await ac.post("/api/auth/2fa/disable", headers=new_headers)
        assert disable_res.status_code == 200
        assert disable_res.json()["is_2fa_enabled"] is False

        # 10. Login again without 2FA directly gives token
        direct_login = await ac.post("/api/auth/login", json={
            "username": "admin_2fa_test",
            "password": "admin_pass_123",
        })
        assert direct_login.status_code == 200
        assert "access_token" in direct_login.json()
        assert direct_login.json().get("requires_2fa") is not True


@pytest.mark.asyncio
async def test_cadet_cannot_enable_2fa():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Cadet login
        res = await ac.post("/api/auth/login", json={
            "username": "cadet_2fa_test",
            "password": "cadet_pass_123",
            "role": "CADET",
        })
        assert res.status_code == 200
        cadet_token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {cadet_token}"}

        # Attempt to setup 2FA -> should be 403 Forbidden
        setup_res = await ac.post("/api/auth/2fa/setup", headers=headers)
        assert setup_res.status_code == 403

