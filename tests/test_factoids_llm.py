import pytest
from unittest.mock import patch, AsyncMock
from backend.schemas.factoids import FactoidGenerationRequest

from backend.core.factoids_llm import generate_factoids

@pytest.mark.asyncio
async def test_generate_factoids():
    request = FactoidGenerationRequest(
        plot="Пожар в квартире",
        street="Ленина",
        house="45",
        fio="Смирнова Анна",
        phone="89991112233"
    )
    
    # Мокаем асинхронную функцию вызова внешнего LLM API
    with patch("backend.core.factoids_llm.call_llm_api", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "SM1: У нас пожар!\nSM2: Горим!\nSD1: Много дыма\nSD2: Огонь везде!"
        
        response = await generate_factoids(request)
        
        # Проверяем, что возвращается гибкая Pydantic-схема (список объектов)
        assert len(response.factoids) == 4, "Должно быть сгенерировано 4 фактоида"
        assert response.factoids[0].marker == "SM1"
        assert response.factoids[0].text == "У нас пожар!"
        assert response.factoids[1].marker == "SM2"
