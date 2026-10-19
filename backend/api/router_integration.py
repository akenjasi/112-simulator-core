from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from backend.core.spo_gateway import spo_gateway
from backend.core.deps import require_role, get_current_user
from backend.core.access import require_card
from backend.database import get_db
from backend.models.domain_01 import User
from backend.models.domain_04 import IncidentCard
from sqlalchemy.ext.asyncio import AsyncSession

router_integration = APIRouter(
    prefix="/api/integration",
    tags=["Integration"],
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)

class ExportCardRequest(BaseModel):
    card_data: Dict[str, Any]

@router_integration.post("/spo112/export/{card_id}")
async def export_incident_card(card_id: str, request: ExportCardRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Export incident card to external SPO-112 system.
    """
    # Assuming card_data is provided in the request or fetched from DB using card_id
    card = await require_card(db, user, await db.get(IncidentCard, card_id))
    success = await spo_gateway.export_card(card.filled_data or {})
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to export card to SPO-112")
        
    return {"status": "success", "card_id": card_id, "message": "Card successfully exported to SPO-112"}
