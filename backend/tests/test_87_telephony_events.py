"""Simulation can consume an answer event; it cannot claim physical origination."""
import pytest
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_telephony_real_event_handling(saved_call, cadet_auth_client, monkeypatch):
    from backend.api.router_telephony import telephony_adapter
    session_id, ticket_id = saved_call
    wait = AsyncMock(return_value=True)
    originate = AsyncMock()
    monkeypatch.setattr(telephony_adapter, 'enabled', 'false')
    monkeypatch.setattr(telephony_adapter, 'connected', True)
    monkeypatch.setattr(telephony_adapter, 'wait_for_answer', wait)
    monkeypatch.setattr(telephony_adapter, 'originate_call', originate)
    response = await cadet_auth_client.post('/api/v2/telephony/start_call', json={
        'ticket_id': ticket_id, 'session_id': session_id, 'operator_ext': '1002',
    })
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'ANSWERED'
    assert response.json()['mode'] == 'simulation'
    wait.assert_awaited_once_with('1002', timeout=30.0)
    originate.assert_not_called()
