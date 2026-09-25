import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.domain_02 import GeneratedTicket

@pytest.mark.asyncio
async def test_get_ticket_counts(async_client: AsyncClient, db_session: AsyncSession):
    """
    Тест проверяет эндпоинт GET /api/v1/tickets/counts.
    Должен возвращать количество сгенерированных билетов, сгруппированных по категориям и подкатегориям.
    """
    # 1. Подготавливаем данные в БД
    t1 = GeneratedTicket(
        category="ДТП",
        subcategory="С пострадавшими",
        complexity=1,
        plot="test1",
    )
    t2 = GeneratedTicket(
        category="ДТП",
        subcategory="С пострадавшими",
        complexity=2,
        plot="test2",
    )
    t3 = GeneratedTicket(
        category="ДТП",
        subcategory="Без пострадавших",
        complexity=1,
        plot="test3",
    )
    t4 = GeneratedTicket(
        category="Пожары",
        subcategory="В здании",
        complexity=3,
        plot="test4",
    )
    
    db_session.add_all([t1, t2, t3, t4])
    await db_session.commit()

    # 2. Выполняем запрос
    response = await async_client.get("/api/v1/tickets/counts")
    assert response.status_code == 200
    
    data = response.json()
    assert isinstance(data, list)
    
    # 3. Проверяем структуру и подсчеты
    dtp = next((item for item in data if item["category"] == "ДТП"), None)
    assert dtp is not None, "Категория ДТП должна присутствовать"
    assert dtp["total"] == 3
    assert dtp["subcategories"].get("С пострадавшими") == 2
    assert dtp["subcategories"].get("Без пострадавших") == 1
    
    fires = next((item for item in data if item["category"] == "Пожары"), None)
    assert fires is not None, "Категория Пожары должна присутствовать"
    assert fires["total"] == 1
    assert fires["subcategories"].get("В здании") == 1
