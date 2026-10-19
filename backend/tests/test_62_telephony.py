"""Tests for TZ 62: VoIP & Telephony Architecture (Preparation)."""

import pytest
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient

from backend.main import app
from backend.api.router_telephony import telephony_manager


@pytest.mark.asyncio
async def test_start_call_and_status_flow(saved_call, cadet_auth_client, monkeypatch):
    session_id, ticket_id = saved_call
    monkeypatch.setattr("backend.api.router_telephony.telephony_adapter.enabled", "false")
    """Verifies that start_call transitions status and responds with ANSWERED."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=cadet_auth_client.headers) as ac:
        # 1. Start call
        payload = {
            "ticket_id": ticket_id,
            "operator_ext": "1002",
            "session_id": session_id,
        }
        resp = await ac.post("/api/v2/telephony/start_call", json=payload)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "ANSWERED"
        assert data["operator_ext"] == "1002"
        assert data["ticket_id"] == ticket_id
        assert data["call_id"].startswith("call-")

        # 2. Check status via polling endpoint
        status_resp = await ac.get(f"/api/v2/telephony/status/{session_id}")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["call_status"] == "ANSWERED"
        assert status_data["operator_ext"] == "1002"


@pytest.mark.asyncio
async def test_play_audio_endpoint(saved_call, cadet_auth_client, monkeypatch):
    session_id, ticket_id = saved_call
    monkeypatch.setattr("backend.api.router_telephony.telephony_adapter.enabled", "false")
    """Verifies mock audio playback dispatch."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=cadet_auth_client.headers) as ac:
        payload = {
            "session_id": session_id,
            "audio_url": "/static/audio/turn_01.mp3",
            "text": "Пожар на балконе!",
        }
        resp = await ac.post("/api/v2/telephony/play_audio", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "PLAYING"
        assert data["audio_url"] == "/static/audio/turn_01.mp3"


@pytest.mark.asyncio
async def test_hangup_endpoint(saved_call, cadet_auth_client, monkeypatch):
    session_id, ticket_id = saved_call
    monkeypatch.setattr("backend.api.router_telephony.telephony_adapter.enabled", "false")
    """Verifies hangup endpoint stops call and updates status to HANGUP."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=cadet_auth_client.headers) as ac:
        payload = {
            "session_id": session_id,
            "reason": "operator_hangup",
        }
        resp = await ac.post("/api/v2/telephony/hangup", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "HANGUP"

        # Check status reflects HANGUP
        status_resp = await ac.get(f"/api/v2/telephony/status/{session_id}")
        assert status_resp.status_code == 200
        assert status_resp.json()["call_status"] == "HANGUP"


@pytest.mark.asyncio
async def test_telephony_websocket(saved_call, cadet_auth_client):
    """Verifies WebSocket connection and messages for real-time telephony."""
    client = TestClient(app)
    session_id, _ = saved_call

    telephony_manager.set_state(session_id, {
        "call_status": "ANSWERED",
        "operator_ext": "1002",
    })

    with client.websocket_connect(f"/api/v2/telephony/ws/{session_id}") as ws:
        ws.send_json({"type": "auth", "token": cadet_auth_client.headers["Authorization"].removeprefix("Bearer ")})
        # Initial greeting / connection event
        init_data = ws.receive_json()
        assert init_data["type"] == "CONNECTED"
        assert init_data["session_id"] == session_id
        assert init_data["status"] == "ANSWERED"

        # Ping-pong test
        ws.send_json({"type": "ping"})
        pong_data = ws.receive_json()
        assert pong_data["type"] == "pong"

        # Get status test
        ws.send_json({"type": "get_status"})
        st_data = ws.receive_json()
        assert st_data["type"] == "STATUS"
        assert st_data["status"] == "ANSWERED"
