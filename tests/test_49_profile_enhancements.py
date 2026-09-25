import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_enhanced_student_stats(cadet_auth_client: AsyncClient):
    """
    Проверка расширенного эндпоинта статистики студента GET /api/v1/students/me/stats.
    Ожидаются новые поля: cards_solved, average_score_7_days, score_trend,
    average_processing_time_seconds, time_trend, service_accuracy_percent, 
    а также новый формат top_errors с is_fatal.
    """
    response = await cadet_auth_client.get("/api/v1/students/me/stats?role=OPERATOR_112")
    # Если данные не подгружены, может вернуть 200 с нулями или заглушками
    assert response.status_code == 200
    
    data = response.json()
    assert "cards_solved" in data
    assert "average_score_7_days" in data
    assert "score_trend" in data
    assert "average_processing_time_seconds" in data
    assert "time_trend" in data
    assert "service_accuracy_percent" in data
    assert "top_errors" in data
    
    errors = data["top_errors"]
    assert isinstance(errors, list)
    if len(errors) > 0:
        error = errors[0]
        assert "text" in error
        assert "frequency_percent" in error
        assert "is_fatal" in error
