import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.base import Base
from backend.database import engine

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_scenario_ticket_creation():
    from backend.models.domain_02 import ScenarioTicket
    
    ticket = ScenarioTicket()
    
    assert ticket.scenario_id is not None
    assert len(ticket.scenario_id) == 36
    
    from backend.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        session.add(ticket)
        await session.commit()
        await session.refresh(ticket)

        # Test default JSON values
        assert isinstance(ticket.workflow_state, dict)
        assert ticket.workflow_state == {}
        assert isinstance(ticket.settings, dict)
        assert ticket.settings == {}
        assert isinstance(ticket.ground_truth, dict)
        assert ticket.ground_truth == {}
        assert isinstance(ticket.ai_content, dict)
        assert ticket.ai_content == {}
        assert isinstance(ticket.reference_material_ids, list)
        assert ticket.reference_material_ids == []
        assert isinstance(ticket.version_history, list)
        assert ticket.version_history == []

