from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import backend.core.factoid_generator as factoid_generator
from backend.core.factoid_generator import stream_scenario_factoids
from backend.database import get_db
from backend.models.domain_02 import ScenarioTicket
from backend.schemas.scenarios import (
    ScenarioCompileResponse,
    ScenarioCreate,
    ScenarioGenerateResponse,
    ScenarioResponse,
)

scenarios_router = APIRouter(prefix="/api/admin/scenarios", tags=["Admin Scenarios"])
router = scenarios_router


@scenarios_router.get("", response_model=list[ScenarioResponse])
@scenarios_router.get("/", response_model=list[ScenarioResponse], include_in_schema=False)
async def list_scenarios(db: AsyncSession = Depends(get_db)):
    stmt = select(ScenarioTicket)
    result = await db.execute(stmt)
    return result.scalars().all()


@scenarios_router.post("", response_model=ScenarioResponse)
@scenarios_router.post("/", response_model=ScenarioResponse, include_in_schema=False)
async def create_scenario(scenario_in: ScenarioCreate, db: AsyncSession = Depends(get_db)):
    ticket = ScenarioTicket(settings=scenario_in.settings)
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@scenarios_router.post("/{scenario_id}/generate", response_model=ScenarioGenerateResponse)
@scenarios_router.post("/{scenario_id}/generate/", response_model=ScenarioGenerateResponse, include_in_schema=False)
async def generate_scenario(scenario_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ScenarioTicket).where(ScenarioTicket.scenario_id == scenario_id)
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario ticket not found",
        )
    return {"job_id": "mock_job_123"}


@scenarios_router.post("/{scenario_id}/compile", response_model=ScenarioCompileResponse)
@scenarios_router.post("/{scenario_id}/compile/", response_model=ScenarioCompileResponse, include_in_schema=False)
async def compile_scenario(scenario_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ScenarioTicket).where(ScenarioTicket.scenario_id == scenario_id)
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario ticket not found",
        )
    return {"success": True}


@scenarios_router.get("/{scenario_id}/events")
@scenarios_router.get("/{scenario_id}/events/", include_in_schema=False)
async def scenario_events(scenario_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ScenarioTicket).where(ScenarioTicket.scenario_id == scenario_id)
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario ticket not found",
        )

    def event_stream():
        try:
            yield from factoid_generator.stream_scenario_factoids(ticket.settings)
        except Exception as exc:
            yield f'event: status\ndata: {{"error": "{str(exc)}"}}\n\n'

    return StreamingResponse(event_stream(), media_type="text/event-stream")

