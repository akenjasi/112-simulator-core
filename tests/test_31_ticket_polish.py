import pytest
from backend.core.faker import FakeDataGenerator
from backend.core.ticket_generator import generate_tickets
from backend.database import engine
from backend.models.base import Base
from backend.schemas.generator import ClassifierRow


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


def test_faker_gender():
    faker = FakeDataGenerator(seed=42)
    person = faker.generate_person()
    # Убеждаемся, что генератор возвращает пол
    assert hasattr(person, 'gender'), "У GeneratedPerson должно быть поле gender"
    assert person.gender in ["male", "female"]

def test_ticket_generator_plot_and_speaker():
    faker = FakeDataGenerator(seed=42)
    classifier_row = ClassifierRow(
        code="01",
        incident_name="Тест",
        templates=["Помогите, {role} на связи."]
    )
    tickets = generate_tickets(classifier_row, count=1, faker=faker)
    ticket = tickets[0]
    
    # 1. Проверяем, что в plot больше нет хардкода "Алло, слушайте... "
    assert not ticket.plot.startswith("Алло, слушайте"), "Фраза не должна быть захардкожена в тексте фабулы"
    assert "Помогите," in ticket.plot
    
    # 2. Проверяем, что speaker сохранился (например в ground_truth)
    assert "speaker" in ticket.ground_truth, "Поле speaker должно сохраняться в ground_truth"
    assert ticket.ground_truth["speaker"] in ["aidar", "eugene", "xenia", "baya"]


def test_tts_phone_number_formatting():
    from backend.api.router_tickets import format_phone_for_tts
    clean = format_phone_for_tts("+79443759255")
    assert clean == "7 9 4 4 3 7 5 9 2 5 5"


@pytest.mark.asyncio
async def test_ticket_delete_endpoint(auth_client):
    import uuid
    from backend.database import AsyncSessionLocal
    from backend.models.domain_02 import GeneratedTicket, ScenarioTicket

    ticket_id = f"del-test-{uuid.uuid4()}"
    async with AsyncSessionLocal() as session:
        t1 = GeneratedTicket(
            id=ticket_id,
            category="Пожары",
            subcategory="Пожар в доме",
            complexity=1,
            plot="Алло, слушайте... Горит дом",
            factoids={},
            ground_truth={"speaker": "xenia", "phone": "+79991234567"},
            etalon_services=["01"],
        )
        t2 = ScenarioTicket(
            scenario_id=ticket_id,
            settings={"complexity": 1},
            ground_truth={},
            ai_content={},
            workflow_state={"status": "active"},
        )
        session.add(t1)
        session.add(t2)
        await session.commit()

    # Verify delete
    res = await auth_client.delete(f"/api/tickets/{ticket_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"

    # Verify not found after deletion
    async with AsyncSessionLocal() as session:
        assert await session.get(GeneratedTicket, ticket_id) is None
        assert await session.get(ScenarioTicket, ticket_id) is None

    # Delete non-existent
    res_404 = await auth_client.delete(f"/api/tickets/{ticket_id}")
    assert res_404.status_code == 404


@pytest.mark.asyncio
async def test_ticket_audio_speaker_extracted(auth_client):
    import uuid
    from unittest.mock import patch
    from backend.database import AsyncSessionLocal
    from backend.models.domain_02 import GeneratedTicket

    ticket_id = f"audio-spk-{uuid.uuid4()}"
    async with AsyncSessionLocal() as session:
        t = GeneratedTicket(
            id=ticket_id,
            category="ДТП",
            subcategory="Авария",
            complexity=2,
            plot="Алло, слушайте... Авария на дороге",
            factoids={},
            ground_truth={"speaker": "xenia", "fio": "Анна Иванова", "phone": "+79991112233"},
            etalon_services=["01", "02"],
        )
        session.add(t)
        await session.commit()

    captured_speaker = []

    def fake_concatenate(texts, speaker="aidar", **kwargs):
        captured_speaker.append(speaker)
        return b"wav_data"

    with patch("backend.api.router_tickets.tts_engine_v2.concatenate_tts", side_effect=fake_concatenate):
        res = await auth_client.get(f"/api/tickets/{ticket_id}/audio")
        assert res.status_code == 200
        assert captured_speaker == ["xenia"]

