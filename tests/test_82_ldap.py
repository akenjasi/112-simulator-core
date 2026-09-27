import pytest
from httpx import AsyncClient
from backend.main import app
from unittest.mock import patch
import os

@pytest.mark.asyncio
async def test_ldap_authentication_flow(async_client: AsyncClient, monkeypatch):
    """
    Test that the login endpoint can use LDAP if enabled,
    and auto-provisions a new user if they authenticate successfully 
    against LDAP but don't exist in the local DB.
    """
    # Mock environment variables
    monkeypatch.setenv("LDAP_ENABLED", "True")
    monkeypatch.setenv("LDAP_SERVER", "ldap://dummy.local")

    # We patch the adapter function directly in the module where it's used
    with patch("backend.api.router_auth.authenticate_ldap", return_value=True):
        response = await async_client.post(
            "/api/auth/login",
            json={"username": "new_ldap_user", "password": "some_password", "role": "CADET"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["username"] == "new_ldap_user"
        assert data["role"] == "CADET"

@pytest.mark.asyncio
async def test_ldap_fallback(async_client: AsyncClient, monkeypatch):
    """
    Test that the login endpoint falls back to local DB if LDAP fails.
    """
    monkeypatch.setenv("LDAP_ENABLED", "True")
    monkeypatch.setenv("LDAP_SERVER", "ldap://dummy.local")

    with patch("backend.api.router_auth.authenticate_ldap", return_value=False):
        # We test that it falls back to the DB check, which will return 401
        # since the user does not exist or password is wrong.
        response = await async_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong_password", "role": "ADMIN"}
        )
        assert response.status_code == 401
