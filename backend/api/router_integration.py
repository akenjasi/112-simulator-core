from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from backend.core.spo_gateway import spo_gateway

router_integration = APIRouter(
    prefix="/api/integration",
    tags=["Integration"],
)

class ExportCardRequest(BaseModel):
    card_data: Dict[str, Any]

@router_integration.post("/spo112/export/{card_id}")
async def export_incident_card(card_id: str, request: ExportCardRequest):
    """
    Export incident card to external SPO-112 system.
    """
    # Assuming card_data is provided in the request or fetched from DB using card_id
    success = await spo_gateway.export_card(request.card_data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to export card to SPO-112")
        
    return {"status": "success", "card_id": card_id, "message": "Card successfully exported to SPO-112"}
