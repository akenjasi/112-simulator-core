import pytest
from backend.schemas.bricks import Intent
from backend.core.intent_classifier import classify_intent

@pytest.mark.asyncio
async def test_classify_intent_mock():
    assert await classify_intent("какой у вас адрес?") == Intent.address
    assert await classify_intent("есть ли пострадавшие?") == Intent.victims
    assert await classify_intent("что у вас случилось?") == Intent.situation
