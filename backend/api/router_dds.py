"""API router for DDS console and SLA actions."""

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.sla_monitor import calculate_sla_status, update_service_status
from backend.database import get_db
from backend.models.domain_04 import IncidentCard
from backend.schemas.dds import DDSActionRequest, DDSCardResponse

router_dds = APIRouter(prefix="/api/dds", tags=["DDS"])
router = router_dds

TERMINAL_STATUSES = {
    "Работы завершены",
    "Не принята",
    "Отказ от выполнения работ",
    "Отказ",
    "Завершена",
    "Завершение работ без бригады",
}


def _normalize_assigned_services(
    raw_services: Any, default_time: datetime
) -> Dict[str, Any]:
    """Normalize assigned_services to a standard dictionary format."""
    if isinstance(raw_services, dict):
        return raw_services
    if isinstance(raw_services, list):
        return {
            svc: {
                "status": "Добавлена",
                "dispatched_at": default_time.isoformat(),
                "is_overdue": False,
                "history": [],
            }
            for svc in raw_services
            if isinstance(svc, str)
        }
    return {}


@router_dds.get("", response_model=List[DDSCardResponse])
@router_dds.get("/", response_model=List[DDSCardResponse], include_in_schema=False)
@router_dds.get("/cards", response_model=List[DDSCardResponse])
@router_dds.get("/cards/", response_model=List[DDSCardResponse], include_in_schema=False)
async def get_dds_cards(
    db: AsyncSession = Depends(get_db),
) -> List[DDSCardResponse]:
    """Get active incident cards not yet marked as 'Отработана' with calculated SLA status."""
    stmt = select(IncidentCard).where(IncidentCard.status != "Отработана")
    result = await db.execute(stmt)
    cards = result.scalars().all()

    now = datetime.now(timezone.utc)
    card_responses: List[DDSCardResponse] = []

    for card in cards:
        services = _normalize_assigned_services(
            card.assigned_services, card.created_at or now
        )
        updated_services = calculate_sla_status(services, now)

        card_responses.append(
            DDSCardResponse(
                card_id=card.card_id,
                session_id=card.session_id,
                scenario_id=card.scenario_id,
                operator_id=card.operator_id,
                card_origin=card.card_origin or "runtime",
                filled_data=card.filled_data or {},
                assigned_services=updated_services,
                status=card.status,
                created_at=card.created_at,
            )
        )

    return card_responses


@router_dds.post(
    "/cards/{card_id}/action",
    response_model=DDSCardResponse,
)
@router_dds.post(
    "/cards/{card_id}/action/",
    response_model=DDSCardResponse,
    include_in_schema=False,
)
async def perform_card_action(
    card_id: str,
    req: DDSActionRequest,
    db: AsyncSession = Depends(get_db),
) -> IncidentCard:
    """Execute an action on an assigned service in the incident card."""
    stmt = select(IncidentCard).where(IncidentCard.card_id == card_id)
    result = await db.execute(stmt)
    card = result.scalar_one_or_none()

    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"IncidentCard with id '{card_id}' not found",
        )

    now = datetime.now(timezone.utc)
    services = _normalize_assigned_services(
        card.assigned_services, card.created_at or now
    )

    updated_services = update_service_status(
        services=services,
        service_name=req.service_name,
        new_status=req.status,
        comment=req.comment,
        current_time=now,
    )

    card.assigned_services = updated_services
    flag_modified(card, "assigned_services")

    if req.status in ["Работы завершены", "Не принята"]:
        all_finished = True
        for svc_data in updated_services.values():
            if isinstance(svc_data, dict):
                st = svc_data.get("status")
                if st not in TERMINAL_STATUSES:
                    all_finished = False
                    break
            else:
                all_finished = False
                break

        if all_finished and updated_services:
            card.status = "Отработана"

    await db.commit()
    await db.refresh(card)

    return card
