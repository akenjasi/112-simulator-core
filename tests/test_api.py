import pytest
from fastapi.testclient import TestClient

# Импортируем приложение после того, как агент его создаст
from backend.main import app

client = TestClient(app)

def test_healthcheck():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

from unittest.mock import patch, AsyncMock

@patch("backend.core.factoids_llm.call_llm_api", new_callable=AsyncMock)
def test_api_generate_factoids(mock_call_llm):
    mock_call_llm.return_value = "SM1: Тест\nSM2: Тест\nSD1: Тест\nSD2: Тест"
    response = client.post(
        "/api/v1/scenario/generate_factoids",
        json={
            "plot": "Пожар на кухне",
            "street": "Ленина"
        }
    )
    assert response.status_code == 200, "Эндпоинт должен вернуть 200 OK"
    data = response.json()
    assert "factoids" in data, "Ответ должен соответствовать FactoidsResponse"
    assert len(data["factoids"]) == 4

def test_api_compile_ticket():
    response = client.post(
        "/api/v1/scenario/compile_ticket",
        json={
            "ticket_id": "test-123",
            "plot": "Пожар",
            "factoids": {"SM1": "Текст"},
            "ground_truth": {}
        }
    )
    assert response.status_code == 200, "Эндпоинт должен вернуть 200 OK"
    data = response.json()
    assert "ticket_uuid" in data
    assert "bricks" in data, "Ответ должен содержать массив bricks"
