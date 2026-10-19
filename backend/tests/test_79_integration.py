"""Adapter boundary contracts; these tests do not claim a real PBX/SPO stand."""
import pytest
from unittest.mock import AsyncMock
from backend.database import AsyncSessionLocal
from backend.models.domain_04 import IncidentCard

@pytest.mark.asyncio
async def test_spo112_gateway_export(monkeypatch, saved_call, cadet_auth_client):
    session_id, _ = saved_call
    stored = {'address': 'Test Ave 1', 'description': 'Fire'}
    async with AsyncSessionLocal() as db:
        card = IncidentCard(session_id=session_id, card_origin="runtime", filled_data=stored)
        db.add(card)
        await db.commit()
        card_id = card.card_id
    export = AsyncMock(return_value=True)
    monkeypatch.setattr('backend.core.spo_gateway.spo_gateway.export_card', export)
    response = await cadet_auth_client.post(f'/api/integration/spo112/export/{card_id}',
        json={'card_data': {'address': 'spoofed request address'}})
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'success'
    export.assert_awaited_once_with(stored)
    export.return_value = False
    failed = await cadet_auth_client.post(f'/api/integration/spo112/export/{card_id}', json={'card_data': {}})
    assert failed.status_code == 500

@pytest.mark.asyncio
async def test_asterisk_ari_adapter(monkeypatch, saved_call, cadet_auth_client):
    """A configured PBX must not report a fake successful physical call."""
    from backend.core.telephony_adapter import telephony_adapter
    session_id, ticket_id = saved_call
    originate = AsyncMock()
    monkeypatch.setattr(telephony_adapter, 'originate_call', originate)
    monkeypatch.setattr(telephony_adapter, 'enabled', 'true')
    response = await cadet_auth_client.post('/api/v2/telephony/start_call', json={
        'ticket_id': ticket_id, 'session_id': session_id, 'operator_ext': '1002',
    })
    assert response.status_code == 501
    assert 'Real PBX channel lifecycle is not implemented' in response.json()['detail']
    originate.assert_not_called()
