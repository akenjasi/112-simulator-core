import pytest
from backend.core.tts_engine import generate_audio

@pytest.mark.asyncio
async def test_generate_audio_mock():
    text = "Внимание, пожар!"
    audio_bytes = await generate_audio(text)
    
    assert isinstance(audio_bytes, bytes), "Функция должна возвращать байты"
    assert len(audio_bytes) > 0, "Байты не должны быть пустыми"
    assert text.encode("utf-8") in audio_bytes, "Тестовая заглушка должна содержать текст"
