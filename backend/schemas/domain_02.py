"""Pydantic schemas for Domain 02 (Tickets)."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class TicketGenerateRequest(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    count: int = Field(default=10, ge=1, le=20, description="От 1 до 20 билетов за раз")


class TicketFilterParams(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    complexity: Optional[int] = Field(None, ge=1, le=3)


TicketFilter = TicketFilterParams


class DDSEtalon(BaseModel):
    service_name: Optional[str] = Field(default=None, description="Служба/роль в рамках данного задания")
    expected_decision: Optional[str] = Field(default=None, description="Ожидаемое решение (например, 'Принять' или 'Не принята')")
    decision_rationale: Optional[str] = Field(default=None, description="Обоснование решения")
    decision_alternatives: Optional[str] = Field(default=None, description="Допустимые альтернативы")
    expected_stages: List[str] = Field(default_factory=list, description="Необходимые этапы реагирования")
    expected_result: Optional[str] = Field(default=None, description="Ожидаемый результат реагирования")
    required_comment_points: List[str] = Field(default_factory=list, description="Существенные сведения для комментария/сообщения")
    sample_comment: Optional[str] = Field(default=None, description="Пример формулировки (необязательный)")
    confirmation_time_limit_seconds: Optional[int] = Field(default=None, description="Норматив подтверждения карточки (сек)")

    @field_validator("confirmation_time_limit_seconds", mode="before")
    @classmethod
    def validate_confirmation_limit(cls, v: Any) -> Optional[int]:
        if v is None:
            return None
        if isinstance(v, bool) or not isinstance(v, int):
            raise ValueError("Confirmation time limit must be an integer, not boolean or float")
        if v <= 0:
            raise ValueError("Confirmation time limit must be positive")
        return v

    model_config = ConfigDict(extra="ignore")


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
    dds_etalon: Optional[DDSEtalon] = None

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

class TicketUpdate(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    complexity: Optional[int] = None
    plot: Optional[str] = None
    factoids: Optional[Dict[str, Any]] = None
    ground_truth: Optional[Dict[str, Any]] = None
    etalon_services: Optional[List[str]] = None
    dds_etalon: Optional[DDSEtalon] = None

