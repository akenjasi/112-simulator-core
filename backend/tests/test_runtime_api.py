import base64
from unittest.mock import AsyncMock
import pytest
from backend.database import AsyncSessionLocal
from backend.models.domain_03 import SessionStateModel
from backend.schemas.bricks import Intent

@pytest.mark.asyncio
async def test_api_process_turn(saved_call, cadet_auth_client, monkeypatch):
    session_id, _ = saved_call
    classify = AsyncMock(return_value=Intent.situation)
    audio = b'RIFF-test-wave'
    tts = AsyncMock(return_value=audio)
    monkeypatch.setattr('backend.api.router_call.classify_intent', classify)
    monkeypatch.setattr('backend.api.router_call.generate_audio', tts)
    response = await cadet_auth_client.post('/api/v1/call/process_turn', json={
        'session_id': session_id, 'operator_text': 'Что случилось?',
    })
    assert response.status_code == 200, response.text
    assert response.json()['text'] == 'У нас сильное задымление и пожар, срочно приезжайте!'
    assert response.json()['audio_url'] == 'data:audio/wav;base64,' + base64.b64encode(audio).decode()
    classify.assert_awaited_once_with('Что случилось?')
    tts.assert_awaited_once_with(response.json()['text'])
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        state = await db.scalar(select(SessionStateModel).where(SessionStateModel.session_id == session_id))
        assert state is not None
        assert 'situation' in state.asked_intents
