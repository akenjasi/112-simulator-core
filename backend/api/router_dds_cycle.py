"""API router for DDS Lesson Cycle (A-06).

Endpoints:
- GET  /api/dds/tickets                  — catalog of suitable prepared tickets (TEACHER/ADMIN)
- GET  /api/dds/assignments              — own assigned DDS sessions (CADET/ADMIN)
- GET  /api/dds/sessions/{session_id}    — session state (CADET owner, TEACHER owner, ADMIN)
- POST /api/dds/sessions/{session_id}/actions — record action (CADET owner, ADMIN)
- POST /api/dds/sessions/{session_id}/finish  — complete session (CADET owner, ADMIN)
"""

from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, require_role
from backend.core.dds_cycle import (
    apply_dds_action,
    extract_dds_ticket_metadata,
    finish_dds_session,
    get_dds_session_state,
    is_suitable_dds_ticket,
    list_cadet_dds_assignments,
    matches_dds_ticket_filters,
)
from backend.database import get_db
from backend.models.domain_01 import User
from backend.models.domain_02 import ScenarioTicket
from backend.schemas.dds_cycle import (
    DDSActionPayload,
    DDSFinishPayload,
    DDSSessionStateResponse,
    DDSTicketSummary,
)

router_dds_cycle = APIRouter(
    prefix="/api/dds",
    tags=["DDS Lesson Cycle"],
)


@router_dds_cycle.get(
    "/tickets",
    response_model=List[DDSTicketSummary],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
@router_dds_cycle.get(
    "/tickets/",
    response_model=List[DDSTicketSummary],
    include_in_schema=False,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def get_prepared_dds_tickets(
    category: Optional[str] = Query(None, description="Категория происшествия"),
    subcategory: Optional[str] = Query(None, description="Подкатегория происшествия"),
    complexity: Optional[int] = Query(None, ge=1, le=3, description="Уровень сложности (1-3)"),
    db: AsyncSession = Depends(get_db),
) -> List[DDSTicketSummary]:
    """Return prepared scenario tickets suitable for DDS dispatch lessons without exposing etalons."""
    stmt = (
        select(ScenarioTicket)
        .where(
            (ScenarioTicket.is_deleted == False) | (ScenarioTicket.is_deleted.is_(None))  # noqa: E712
        )
        .order_by(ScenarioTicket.created_at.desc())
    )
    tickets = (await db.scalars(stmt)).all()

    suitable: List[DDSTicketSummary] = []
    for t in tickets:
        if is_suitable_dds_ticket(t):
            if matches_dds_ticket_filters(
                t, category=category, subcategory=subcategory, complexity=complexity
            ):
                cat, subcat, comp, title = extract_dds_ticket_metadata(t)
                suitable.append(
                    DDSTicketSummary(
                        ticket_id=t.scenario_id,
                        title=title,
                        category=cat,
                        subcategory=subcat,
                        complexity=comp,
                    )
                )
    return suitable


@router_dds_cycle.get(
    "/assignments",
    response_model=List[DDSSessionStateResponse],
)
@router_dds_cycle.get(
    "/assignments/",
    response_model=List[DDSSessionStateResponse],
    include_in_schema=False,
)
async def get_cadet_assignments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[DDSSessionStateResponse]:
    """Return assigned DDS sessions for the logged-in CADET (or ADMIN)."""
    items = await list_cadet_dds_assignments(current_user=current_user, db=db)
    return [DDSSessionStateResponse.model_validate(it) for it in items]


@router_dds_cycle.get(
    "/sessions/{session_id}",
    response_model=DDSSessionStateResponse,
)
@router_dds_cycle.get(
    "/sessions/{session_id}/",
    response_model=DDSSessionStateResponse,
    include_in_schema=False,
)
async def get_session_state_endpoint(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DDSSessionStateResponse:
    """Retrieve full session state for CADET owner, TEACHER owner, or ADMIN."""
    state = await get_dds_session_state(session_id=session_id, current_user=current_user, db=db)
    return DDSSessionStateResponse.model_validate(state)


@router_dds_cycle.post(
    "/sessions/{session_id}/actions",
    response_model=DDSSessionStateResponse,
)
@router_dds_cycle.post(
    "/sessions/{session_id}/actions/",
    response_model=DDSSessionStateResponse,
    include_in_schema=False,
)
async def post_session_action_endpoint(
    session_id: str,
    payload: DDSActionPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DDSSessionStateResponse:
    """Submit an action on a cadet's assigned DDS session."""
    state = await apply_dds_action(
        session_id=session_id,
        payload=payload,
        current_user=current_user,
        db=db,
    )
    return DDSSessionStateResponse.model_validate(state)


@router_dds_cycle.post(
    "/sessions/{session_id}/finish",
    response_model=DDSSessionStateResponse,
)
@router_dds_cycle.post(
    "/sessions/{session_id}/finish/",
    response_model=DDSSessionStateResponse,
    include_in_schema=False,
)
async def finish_session_endpoint(
    session_id: str,
    payload: DDSFinishPayload = Body(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DDSSessionStateResponse:
    """Finish a cadet's assigned DDS session atomically."""
    state = await finish_dds_session(
        session_id=session_id,
        current_user=current_user,
        db=db,
    )
    return DDSSessionStateResponse.model_validate(state)
