import uuid
from unittest.mock import patch
import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.models.base import Base
from backend.models.domain_02 import GeneratedTicket
from backend.schemas.domain_02 import (
    TicketFilter,
    TicketFilterParams,
    TicketGenerateRequest,
)


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


def test_ticket_generate_request_limits():
    # Правильный запрос (по умолчанию 10)
    req = TicketGenerateRequest(category="ДТП")
    assert req.count == 10

    # Максимум 20
    req_max = TicketGenerateRequest(category="Пожары", count=20)
    assert req_max.count == 20

    # Ошибка: больше 20
    with pytest.raises(ValidationError):
        TicketGenerateRequest(category="ДТП", count=21)

    # Ошибка: меньше 1
    with pytest.raises(ValidationError):
        TicketGenerateRequest(category="ДТП", count=0)


def test_ticket_filters():
    # Проверяем фильтры для роутера GET /tickets
    filters = TicketFilter(category="ДТП", complexity=3)
    assert filters.category == "ДТП"
    assert filters.complexity == 3

    with pytest.raises(ValidationError):
        TicketFilter(complexity=4)  # Только 1, 2, 3

    with pytest.raises(ValidationError):
        TicketFilter(complexity=0)


# --- Тест мока компилятора TTS ---
class MockTTS:
    def __init__(self):
        self.cached_files = []

    def synthesize(self, text: str):
        # Имитируем кэширование
        filename = f"{hash(text)}.wav"
        self.cached_files.append(filename)
        return filename


def test_background_tts_caching():
    # Имитация работы BackgroundTask для кеширования кирпичиков
    tts = MockTTS()
    factoids = {
        "greeting": "Алло!",
        "situation_1": "У нас пожар",
        "address": "Ленина 1",
    }

    for key, text in factoids.items():
        tts.synthesize(text)

    assert len(tts.cached_files) == 3


@pytest.mark.asyncio
async def test_generated_ticket_model_db():
    ticket_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as session:
        ticket = GeneratedTicket(
            id=ticket_id,
            category="Пожары",
            subcategory="Пожар в квартире",
            complexity=2,
            plot="Горит балкон на 5 этаже",
            factoids={"situation_1": "Горит балкон"},
            ground_truth={"fio": "Иванов Иван", "street": "Ленина", "house": "10"},
            etalon_services=["01", "03"],
        )
        session.add(ticket)
        await session.commit()

    async with AsyncSessionLocal() as session:
        fetched = await session.get(GeneratedTicket, ticket_id)
        assert fetched is not None
        assert fetched.category == "Пожары"
        assert fetched.subcategory == "Пожар в квартире"
        assert fetched.complexity == 2
        assert fetched.plot == "Горит балкон на 5 этаже"
        assert fetched.factoids == {"situation_1": "Горит балкон"}
        assert fetched.etalon_services == ["01", "03"]
        assert fetched.created_at is not None

        await session.delete(fetched)
        await session.commit()


@pytest.mark.asyncio
async def test_api_tickets_generate_and_get(auth_client):
    synthesized_texts = []

    def fake_synthesize(text: str, *args, **kwargs):
        synthesized_texts.append(text)
        return b"fake_wav_bytes"

    with patch("backend.api.router_tickets.tts_engine_v2.synthesize", side_effect=fake_synthesize):
        # 1. POST /api/tickets/generate (должен немедленно ответить 202 Accepted)
        res_post = await auth_client.post(
            "/api/tickets/generate",
            json={"category": "ДТП", "subcategory": "Лобовое", "count": 2},
        )
        assert res_post.status_code == 202
        data_post = res_post.json()
        assert data_post["message"] == "Генерация начата"

        # BackgroundTasks runs after response
        assert len(synthesized_texts) > 0

    # 2. GET /api/tickets
    res_get = await auth_client.get("/api/tickets")
    assert res_get.status_code == 200
    tickets = res_get.json()
    assert isinstance(tickets, list)
    assert len(tickets) >= 2

    # 3. GET /api/tickets с фильтром по category
    res_filtered = await auth_client.get("/api/tickets?category=ДТП")
    assert res_filtered.status_code == 200
    filtered_tickets = res_filtered.json()
    assert all(t["category"] == "ДТП" for t in filtered_tickets)

    # 4. GET /api/tickets с фильтром по subcategory
    res_sub = await auth_client.get("/api/tickets?subcategory=Лобовое")
    assert res_sub.status_code == 200
    sub_tickets = res_sub.json()
    assert all(t["subcategory"] == "Лобовое" for t in sub_tickets)

    # 5. Проверка валидации query параметров (complexity > 3 -> 422)
    res_invalid = await auth_client.get("/api/tickets?complexity=4")
    assert res_invalid.status_code == 422


@pytest.mark.asyncio
async def test_api_tickets_unauthenticated_and_v1_endpoints():
    synthesized_texts = []

    def fake_synthesize(text: str, *args, **kwargs):
        synthesized_texts.append(text)
        return b"fake_wav_bytes"

    async with AsyncClient(app=app, base_url="http://test") as client:
        with patch("backend.api.router_tickets.tts_engine_v2.synthesize", side_effect=fake_synthesize):
            res_v1_gen = await client.post(
                "/api/v1/tickets/generate",
                json={"category": "Пожары и задымления", "count": 1},
            )
            assert res_v1_gen.status_code == 202
            assert res_v1_gen.json()["message"] == "Генерация начата"

        res_v1_get = await client.get("/api/v1/tickets")
        assert res_v1_get.status_code == 200
        tickets = res_v1_get.json()
        assert len(tickets) >= 1


@pytest.mark.asyncio
async def test_api_tickets_status_endpoint(auth_client):
    res = await auth_client.get("/api/tickets/status")
    assert res.status_code == 200
    data = res.json()
    assert "is_generating" in data
    assert "remaining_tickets" in data
    assert isinstance(data["is_generating"], bool)
    assert isinstance(data["remaining_tickets"], int)


@pytest.mark.asyncio
async def test_api_tickets_approve_removed_and_status_is_active(auth_client):
    # 1. POST /api/tickets/approve must return 404 (endpoint removed)
    res_approve = await auth_client.post("/api/tickets/approve")
    assert res_approve.status_code in (404, 405)

    res_v1_approve = await auth_client.post("/api/v1/tickets/approve")
    assert res_v1_approve.status_code in (404, 405)

    # 2. Tickets list returns status="active"
    res_get = await auth_client.get("/api/tickets")
    assert res_get.status_code == 200
    tickets = res_get.json()
    if tickets:
        assert all(t.get("status") == "active" for t in tickets)


@pytest.mark.asyncio
async def test_api_tickets_audio_endpoint(auth_client):
    ticket_id = f"test-audio-{uuid.uuid4()}"
    async with AsyncSessionLocal() as session:
        ticket = GeneratedTicket(
            id=ticket_id,
            category="Пожары",
            subcategory="Пожар на складе",
            complexity=2,
            plot="Алло, слушайте... Горит склад на улице Ленина",
            factoids={},
            ground_truth={"fio": "Петров Петр", "phone": "+79998887766", "street": "Ленина", "house": "15"},
            etalon_services=["01"],
        )
        session.add(ticket)
        await session.commit()

    captured_texts = []

    def fake_concatenate_tts(texts: list, *args, **kwargs):
        captured_texts.extend(texts)
        return b"fake_audio_wav_bytes"

    with patch("backend.api.router_tickets.tts_engine_v2.concatenate_tts", side_effect=fake_concatenate_tts):
        # 1. GET /api/tickets/{ticket_id}/audio
        res = await auth_client.get(f"/api/tickets/{ticket_id}/audio")
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("audio/wav")
        assert res.content == b"fake_audio_wav_bytes"

        # Check extracted texts:
        # 1) plot: "Алло, слушайте... Горит склад на улице Ленина"
        # 2) ground_truth.fio: "Петров Петр"
        # 3) ground_truth.phone: "+79998887766"
        # 4) ground_truth.street + ground_truth.house: "Ленина 15"
        assert "Алло, слушайте... Горит склад на улице Ленина" in captured_texts
        assert "Петров Петр" in captured_texts
        assert "номер 7 9 9 9 8 8 8 7 7 6 6" in captured_texts
        assert "Ленина 15" in captured_texts

        # 2. Check /api/v1/tickets/{ticket_id}/audio as well
        res_v1 = await auth_client.get(f"/api/v1/tickets/{ticket_id}/audio")
        assert res_v1.status_code == 200
        assert res_v1.content == b"fake_audio_wav_bytes"

        # 3. Check 404 for non-existent ticket
        res_404 = await auth_client.get("/api/tickets/non-existent-ticket-id/audio")
        assert res_404.status_code == 404


