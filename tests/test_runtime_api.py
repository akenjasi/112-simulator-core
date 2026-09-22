import pytest
from fastapi.testclient import TestClient
from backend.main import app
from unittest.mock import patch, AsyncMock

client = TestClient(app)

def test_api_process_turn():
    # Мокаем работу с БД, чтобы не усложнять тест
    with patch("backend.api.router_call.get_db") as mock_db, \
         patch("backend.core.intent_classifier.classify_intent", new_callable=AsyncMock) as mock_classify, \
         patch("backend.core.tts_engine.generate_audio", new_callable=AsyncMock) as mock_tts:
        
        from backend.schemas.bricks import Intent
        mock_classify.return_value = Intent.situation
        mock_tts.return_value = b"audio"
        
        response = client.post(
            "/api/v1/call/process_turn",
            json={
                "session_id": "sess-123",
                "operator_text": "Что случилось?"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "audio_url" in data or "text" in data
