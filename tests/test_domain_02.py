import pytest
import uuid
from sqlalchemy import select
from backend.models.domain_02 import ScenarioTicket

pytestmark = pytest.mark.asyncio

async def test_scenario_ticket_json_defaults(db_session):
    ticket = ScenarioTicket()
    db_session.add(ticket)
    await db_session.flush()

    assert ticket.workflow_state == {}
    assert ticket.settings == {}
    assert ticket.ground_truth == {}
    assert ticket.ai_content == {}
    assert ticket.reference_material_ids == []
    assert ticket.version_history == []

async def test_scenario_ticket_uuid_generation():
    ticket = ScenarioTicket()
    # UUID should be generated before flush
    assert ticket.scenario_id is not None
    assert isinstance(ticket.scenario_id, (uuid.UUID, str))
    if isinstance(ticket.scenario_id, str):
        uuid.UUID(ticket.scenario_id)

async def test_scenario_ticket_heavy_json(db_session):
    heavy_dict = {"a": "b" * 1000, "nested": {"c": [1, 2, 3]}}
    ticket = ScenarioTicket(
        workflow_state=heavy_dict,
        settings=heavy_dict,
        ground_truth=heavy_dict,
        ai_content=heavy_dict,
        reference_material_ids=["uuid1", "uuid2"],
        version_history=[heavy_dict]
    )
    db_session.add(ticket)
    await db_session.commit()

    result = await db_session.execute(select(ScenarioTicket).where(ScenarioTicket.scenario_id == ticket.scenario_id))
    fetched = result.scalar_one()

    assert fetched.workflow_state == heavy_dict
    assert fetched.settings == heavy_dict
    assert fetched.ground_truth == heavy_dict
    assert fetched.ai_content == heavy_dict
    assert fetched.reference_material_ids == ["uuid1", "uuid2"]
    assert fetched.version_history == [heavy_dict]
