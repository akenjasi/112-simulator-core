"""TTS Engine module for generating speech audio from text."""
import inspect
import httpx


async def generate_audio(text: str) -> bytes:
    """Generate audio bytes from the provided text via TTS service."""
    import os
    url = os.getenv("LEGACY_TTS_URL")
    if not url:
        raise RuntimeError("Legacy TTS service is not configured")
    payload = {"text": text}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=60.0)
            response.raise_for_status()
            content = response.content
            if inspect.isawaitable(content):
                content = await content
            return content
    except (httpx.RequestError, ConnectionRefusedError, OSError):
        # Fallback for mock/offline testing if TTS server is not reachable
        raise RuntimeError("Legacy TTS service is unavailable") from None
