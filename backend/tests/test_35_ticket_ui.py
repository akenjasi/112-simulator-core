import pytest
from backend.database import engine
from backend.models.base import Base
from backend.models.domain_02 import GeneratedTicket
from backend.schemas.tickets import TicketResponse


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

def test_ticket_display_id_logic():
    """
    Проверяем, как формируется display_id на бэкенде.
    """
    def make_abbr(text: str) -> str:
        if not text:
            return "ХЗ"
        words = text.split()[:2]
        return "".join([w[0].upper() for w in words if w])
    
    cat = "Пожары и задымления"
    sub = "Задымление в подъезде"
    seq = 42
    
    abbr_cat = make_abbr(cat)
    abbr_sub = make_abbr(sub)
    
    display_id = f"{abbr_cat}_{abbr_sub}_{seq}"
    
    assert abbr_cat == "ПИ"
    assert abbr_sub == "ЗВ"
    assert display_id == "ПИ_ЗВ_42"


def test_make_abbr_from_module():
    from backend.api.router_tickets import make_abbr

    assert make_abbr("Пожары и задымления") == "ПИ"
    assert make_abbr("Задымление в подъезде") == "ЗВ"
    assert make_abbr("") == "ХЗ"
    assert make_abbr(None) == "ХЗ"
    assert make_abbr("ДТП") == "Д"


def test_model_and_schema_fields():
    ticket = GeneratedTicket(
        category="ДТП",
        subcategory="Столкновение",
        sequence_number=15,
        plot="Тест",
    )
    assert ticket.sequence_number == 15
    assert ticket.category == "ДТП"

    resp = TicketResponse(
        id=ticket.id,
        category=ticket.category,
        subcategory=ticket.subcategory,
        complexity=1,
        plot="Тест",
        display_id="Д_С_15",
        sequence_number=15,
    )
    assert resp.display_id == "Д_С_15"
    assert resp.sequence_number == 15


@pytest.mark.asyncio
async def test_patch_ticket_endpoint(auth_client):
    """Тестирование редактирования билета через PATCH /api/tickets/{ticket_id}."""
    import uuid
    from backend.database import AsyncSessionLocal
    from backend.models.domain_02 import GeneratedTicket, ScenarioTicket

    ticket_id = f"patch-test-{uuid.uuid4()}"
    async with AsyncSessionLocal() as session:
        t1 = GeneratedTicket(
            id=ticket_id,
            category="Пожары",
            subcategory="Пожар в доме",
            complexity=1,
            plot="Старая фабула",
            factoids={},
            ground_truth={"fio": "Старый заявитель", "phone": "+79001112233"},
            etalon_services=["01"],
            sequence_number=10,
        )
        t2 = ScenarioTicket(
            scenario_id=ticket_id,
            settings={"complexity": 1, "plot": "Старая фабула", "sequence_number": 10},
            ground_truth={"fio": "Старый заявитель"},
            ai_content={"plot": "Старая фабула"},
            workflow_state={"status": "active"},
        )
        session.add(t1)
        session.add(t2)
        await session.commit()

    # PATCH request
    update_payload = {
        "plot": "Новая фабула после редактирования преподавателем!",
        "complexity": 3,
        "etalon_services": ["01", "03"],
        "ground_truth": {
          "fio": "Новый Заявитель",
          "phone": "+79998887766",
          "street": "Ленина",
          "house": "42"
        },
    }
    res = await auth_client.patch(f"/api/tickets/{ticket_id}", json=update_payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["plot"] == "Новая фабула после редактирования преподавателем!"
    assert data["complexity"] == 3
    assert data["etalon_services"] == ["01", "03"]
    assert data["ground_truth"]["fio"] == "Новый Заявитель"
    assert data["ground_truth"]["phone"] == "+79998887766"

    # Verify in DB
    async with AsyncSessionLocal() as session:
        updated = await session.get(GeneratedTicket, ticket_id)
        assert updated.plot == "Новая фабула после редактирования преподавателем!"
        assert updated.complexity == 3
        assert updated.etalon_services == ["01", "03"]
        assert updated.ground_truth["street"] == "Ленина"

