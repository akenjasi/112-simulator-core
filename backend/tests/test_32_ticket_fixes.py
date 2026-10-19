import pytest
import re
from unittest.mock import patch, MagicMock

from backend.api.router_tickets import (
    expand_address_for_tts,
    format_phone_for_tts,
    generate_tickets_background_task,
)
from backend.core.bricks_compiler import compile_ticket
from backend.core.faker import FakeDataGenerator
from backend.core.ticket_generator import generate_tickets
from backend.database import AsyncSessionLocal, engine
from backend.models.base import Base
from backend.models.domain_02 import GeneratedTicket
from backend.schemas.bricks import TicketData
from backend.schemas.generator import ClassifierRow
from sqlalchemy import select


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


def test_address_expansion():
    """
    Проверяем, что сокращения адресов разворачиваются для TTS,
    чтобы нейросеть читала их красиво.
    """
    def expand_address(text: str) -> str:
        text = re.sub(r'\bул\.\s*', 'улица ', text)
        text = re.sub(r'\bд\.\s*', 'дом ', text)
        text = re.sub(r'\bк\.\s*', 'корпус ', text)
        text = re.sub(r'\bкв\.\s*', 'квартира ', text)
        text = re.sub(r'\bпр-кт\.\s*', 'проспект ', text)
        text = re.sub(r'\bпр-кт\s+', 'проспект ', text)
        return text.strip()

    assert expand_address("ул. Ленина, д. 5") == "улица Ленина, дом 5"
    assert expand_address("ул.Школьная д.7") == "улица Школьная дом 7"

    # Проверяем реализацию из backend.api.router_tickets
    assert expand_address_for_tts("ул. Ленина, д. 5") == "улица Ленина, дом 5"
    assert expand_address_for_tts("ул.Школьная д.7") == "улица Школьная дом 7"
    assert expand_address_for_tts("пр-кт. Мира к. 2 кв. 14") == "проспект Мира корпус 2 квартира 14"


def test_tts_phone_spacing():
    """
    Проверяем, что телефон разбивается пробелами для правильного зачитывания.
    """
    def format_phone_for_tts_local(phone: str) -> str:
        # Убираем все кроме цифр
        digits = re.sub(r'\D', '', phone)
        # Вставляем пробелы
        return " ".join(digits)
    
    assert format_phone_for_tts_local("+79443759255") == "7 9 4 4 3 7 5 9 2 5 5"
    assert format_phone_for_tts_local("8 (495) 123-45-67") == "8 4 9 5 1 2 3 4 5 6 7"

    # Проверяем реализацию из backend.api.router_tickets
    assert format_phone_for_tts("+79443759255") == "7 9 4 4 3 7 5 9 2 5 5"
    assert format_phone_for_tts("8 (495) 123-45-67") == "8 4 9 5 1 2 3 4 5 6 7"


def test_no_hardcoded_allo_in_ticket_generator():
    """
    В фабуле билета не должно быть захардкоженной фразы 'Алло, слушайте'.
    """
    faker = FakeDataGenerator(seed=123)
    row = ClassifierRow(
        code="01",
        incident_name="Пожар",
        services=["01"],
        markers=[],
        templates=["Горит балкон на {street}, {house}!"],
    )
    tickets = generate_tickets(classifier_row=row, count=1, faker=faker)
    assert len(tickets) == 1
    ticket = tickets[0]
    assert not ticket.plot.startswith("Алло, слушайте")
    assert "Горит балкон на" in ticket.plot


def test_no_hardcoded_allo_in_bricks_compiler():
    """
    В bricks_compiler не должно быть отдельного брика с текстом 'Алло, слушайте...'.
    """
    ticket_data = TicketData(
        ticket_id="test-no-allo-1",
        plot="Тестовое происшествие",
        factoids={"fact_1": "Информация"},
        ground_truth={
            "fio": "Иванов И.И.",
            "phone": "+79990001122",
            "street": "Тверская",
            "house": "1",
        },
    )
    matrix = compile_ticket(ticket_data)
    brick_texts = [b.text for b in matrix.bricks]
    assert not any("Алло, слушайте" in (t or "") for t in brick_texts)


@pytest.mark.asyncio
async def test_randomize_subcategories_in_background_task():
    """
    При генерации пакета билетов без указания subcategory,
    resolve_classifier_row должен вызываться внутри цикла,
    чтобы подкатегории могли отличаться.
    """
    with patch("backend.api.router_tickets.tts_engine_v2.synthesize", return_value=b"wav"):
        await generate_tickets_background_task(
            category="Пожары",
            subcategory=None,
            count=10,
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GeneratedTicket.subcategory).filter(GeneratedTicket.category == "Пожары")
        )
        subcategories = [r[0] for r in result.all() if r[0]]
        # Проверяем, что билеты созданы
        assert len(subcategories) >= 10
        # В классификаторе Пожаров много разных видов (мусор, балкон, квартира, склад...).
        # При 10 генерациях не все подкатегории должны быть строго одним и тем же значением.
        unique_subs = set(subcategories[-10:])
        assert len(unique_subs) >= 2, f"Ожидалась рандомизация подкатегорий, получено: {unique_subs}"

