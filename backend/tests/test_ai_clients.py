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
async def test_classify_intent(monkeypatch):
    from unittest.mock import Mock
    import backend.core.intent_classifier as classifier
    model = Mock()
    model.predict.return_value = {'label_id': 1, 'confidence': 0.95}
    monkeypatch.setattr(classifier, 'get_classifier', lambda: model)
    result = await classify_intent("какой адрес?")
    assert result == Intent.address
    model.predict.assert_called_once_with("какой адрес?")
