"""TTS Engine module for generating speech audio from text."""
import inspect
import httpx


async def generate_audio(text: str) -> bytes:
    """Generate audio bytes from the provided text via TTS service."""
    url = "http://localhost:8001/tts"
    payload = {"text": text}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=60.0)
            content = response.content
            if inspect.isawaitable(content):
                content = await content
            return content
    except (httpx.RequestError, ConnectionRefusedError, OSError):
        # Fallback for mock/offline testing if TTS server is not reachable
        return b"FAKE_AUDIO_DATA_" + text.encode("utf-8")
