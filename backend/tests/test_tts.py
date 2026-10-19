import httpx
import pytest
from unittest.mock import AsyncMock
from backend.core.tts_engine import generate_audio

@pytest.mark.asyncio
async def test_generate_audio_mock(monkeypatch):
    monkeypatch.setenv('LEGACY_TTS_URL', 'http://tts.test/synthesize')
    audio = b'RIFF-test-wave'
    post = AsyncMock(return_value=httpx.Response(200, content=audio, request=httpx.Request('POST', 'http://tts.test/synthesize')))
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    assert await generate_audio('Внимание, пожар!') == audio
    post.assert_awaited_once_with('http://tts.test/synthesize', json={'text': 'Внимание, пожар!'}, timeout=60.0)

@pytest.mark.asyncio
async def test_unconfigured_tts_is_explicit(monkeypatch):
    monkeypatch.delenv('LEGACY_TTS_URL', raising=False)
    with pytest.raises(RuntimeError, match='not configured'):
        await generate_audio('Пожар')

@pytest.mark.asyncio
async def test_unavailable_tts_is_explicit(monkeypatch):
    monkeypatch.setenv('LEGACY_TTS_URL', 'http://tts.test/synthesize')
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(side_effect=httpx.ConnectError('offline')))
    with pytest.raises(RuntimeError, match='unavailable'):
        await generate_audio('Пожар')
