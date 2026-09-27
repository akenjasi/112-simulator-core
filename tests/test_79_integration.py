import pytest
from httpx import AsyncClient
from backend.main import app
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_spo112_gateway_export(monkeypatch):
    """
    Test that the SPO-112 export gateway endpoint exists and attempts to format
    and send the incident card to an external system (mocked).
    """
    from backend.core.spo_gateway import spo_gateway
    mock_export = AsyncMock(return_value=True)
    monkeypatch.setattr(spo_gateway, "export_card", mock_export)
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/integration/spo112/export/card-123",
            json={"card_data": {"address": "Test Ave 1", "description": "Fire"}}
        )
    
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    mock_export.assert_called_once_with({"address": "Test Ave 1", "description": "Fire"})

@pytest.mark.asyncio
async def test_asterisk_ari_adapter(monkeypatch):
    """
    Test that the telephony router uses the real Asterisk client interface 
    instead of just returning static mock responses.
    """
    from backend.core.telephony_adapter import telephony_adapter
    mock_originate = AsyncMock(return_value="mock_ari_call_id")
    monkeypatch.setattr(telephony_adapter, "originate_call", mock_originate)
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v2/telephony/start_call",
            json={
                "ticket_id": "test-ticket-456",
                "operator_ext": "1002"
            }
        )
        
    assert response.status_code == 200
    data = response.json()
    assert data["call_id"] == "mock_ari_call_id"
    mock_originate.assert_called_once_with(endpoint="1002", extension="test-ticket-456")
