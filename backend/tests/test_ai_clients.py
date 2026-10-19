import pytest
from unittest.mock import patch, AsyncMock
from backend.core.factoids_llm import call_llm_api
from backend.core.intent_classifier import classify_intent
from backend.schemas.bricks import Intent

@pytest.mark.asyncio
async def test_call_llm_api():
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "choices": [{"message": {"content": "SM1: Тест"}}]
        }
        
        result = await call_llm_api("Сгенерируй фактоиды")
        assert "SM1: Тест" in result

@pytest.mark.asyncio
async def test_classify_intent():
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "choices": [{"message": {"content": "address"}}]
        }
        
        result = await classify_intent("какой адрес?")
        assert result == Intent.address
