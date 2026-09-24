"""Pydantic schemas for Domain 02 (Tickets)."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TicketGenerateRequest(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    count: int = Field(default=10, ge=1, le=20, description="От 1 до 20 билетов за раз")


class TicketFilterParams(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    complexity: Optional[int] = Field(None, ge=1, le=3)


TicketFilter = TicketFilterParams


class TicketResponse(BaseModel):
    id: str
    ticket_id: Optional[str] = None
    display_id: Optional[str] = None
    sequence_number: Optional[int] = None
    category: str
    subcategory: Optional[str] = None
    complexity: int
    plot: str
    factoids: Dict[str, Any] = Field(default_factory=dict)
    ground_truth: Dict[str, Any] = Field(default_factory=dict)
    etalon_services: List[str] = Field(default_factory=list)
    status: str = "active"
    created_at: Optional[datetime] = None

    def model_post_init(self, __context: Any) -> None:
        if not self.ticket_id:
            self.ticket_id = self.id

    model_config = ConfigDict(from_attributes=True)


GeneratedTicketResponse = TicketResponse


class TicketGenerateAcceptedResponse(BaseModel):
    message: str = "Генерация начата"


class TicketStatusResponse(BaseModel):
    is_generating: bool = False
    remaining_tickets: int = 0
