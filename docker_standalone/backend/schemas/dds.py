"""Pydantic V2 schemas for DDS console and SLA actions."""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class DDSActionRequest(BaseModel):
    service_name: str
    status: str
    comment: str = ""
    user_name: str = "Диспетчер ДДС"


class DDSCardResponse(BaseModel):
    card_id: str
    session_id: Optional[str] = None
    scenario_id: Optional[str] = None
    operator_id: Optional[str] = None
    card_origin: str = "runtime"
    filled_data: dict[str, Any] = Field(default_factory=dict)
    assigned_services: dict[str, Any] = Field(default_factory=dict)
    status: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
