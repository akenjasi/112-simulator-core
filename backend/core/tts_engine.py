"""TTS Engine module for generating speech audio from text."""


async def generate_audio(text: str) -> bytes:
    """Generate audio bytes from the provided text.

    Mock implementation: returns fake audio bytes containing the encoded text.
    In production, this will make an async HTTP request via httpx.AsyncClient
    to an external TTS service/API.
    """
    return b"FAKE_AUDIO_DATA_" + text.encode("utf-8")
