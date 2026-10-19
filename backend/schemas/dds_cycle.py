"""Pydantic V2 schemas for DDS Lesson Cycle (A-06)."""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ALLOWED_DDS_STATUSES = {
    "Принята",
    "Не принята",
    "В пути",
    "Прибыли",
    "Работы завершены",
    "Отказ от выполнения работ",
    "Отказ",
    "Завершена",
    "Завершение работ без бригады",
    "Добавлена",
    "Получена службой",
    "В обработке",
    "Направлена",
    "Начало реагирования",
    "Прибытие",
    "Проведение работ",
}


class DDSPhonesData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    aon: str = ""
    provided: str = ""
    onSite: str = ""


class DDSIncidentData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    number: str = ""
    savedAt: str = ""
    operator: str = ""


class DDSCallerData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = ""
    role: str = ""
    address: str = ""


class DDSStatusesData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    injured: str = "нет"
    ambulanceRefusal: str = "нет"
    blocked: str = "нет"


class DDSEmergencyData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    cs: bool = False
    cp: bool = False


class DDSClassificationData(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    section: str = ""
    title: str = ""
    class_: str = Field("", alias="class")
    visClass: str = ""


class DDSServiceHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: Optional[str] = None
    comment: Optional[str] = None
    order_number: Optional[str] = None
    who_accepted: Optional[str] = None
    summary: Optional[str] = None
    actor_id: Optional[str] = None
    at: Optional[str] = None
    time: Optional[str] = None


class DDSServiceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = ""
    name: str = Field(..., min_length=1)
    time: str = ""
    status: str = "Получена службой"
    isRejected: bool = False
    history: List[DDSServiceHistoryItem] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Service name cannot be empty")
        return v.strip()


class DispatcherData(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    connection: str = "Установлено"
    phones: DDSPhonesData = Field(default_factory=DDSPhonesData)
    incident: DDSIncidentData = Field(default_factory=DDSIncidentData)
    caller: DDSCallerData = Field(default_factory=DDSCallerData)
    description: str = Field(...)
    statuses: DDSStatusesData = Field(default_factory=DDSStatusesData)
    emergency: DDSEmergencyData = Field(default_factory=DDSEmergencyData)
    classification: DDSClassificationData = Field(default_factory=DDSClassificationData)
    services: List[DDSServiceItem] = Field(..., min_length=1)

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("description cannot be empty")
        return v.strip()

    @field_validator("services")
    @classmethod
    def validate_services(cls, v: List[DDSServiceItem]) -> List[DDSServiceItem]:
        if not v or len(v) == 0:
            raise ValueError("At least one service is required")
        names = set()
        for s in v:
            if s.name in names:
                raise ValueError(f"Duplicate service name: {s.name}")
            names.add(s.name)
        return v


DDSIncomingCard = DispatcherData


class DDSTicketSummary(BaseModel):
    ticket_id: str
    title: str
    category: Optional[str] = None
    subcategory: Optional[str] = None
    complexity: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class DDSActionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(..., min_length=1, max_length=128)
    card_id: Optional[str] = Field(None, min_length=1)
    kind: Literal["status", "dispatch"]
    service_name: str = Field(..., min_length=1, max_length=255)
    status: Optional[str] = Field(None, max_length=128)
    comment: Optional[str] = Field(None, max_length=1000)
    order_number: Optional[str] = Field(None, max_length=128)
    who_accepted: Optional[str] = Field(None, max_length=255)
    summary: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def validate_kind_fields(self) -> "DDSActionPayload":
        if self.kind == "status":
            if not self.status or not self.status.strip():
                raise ValueError("status is required for status action")
            status_clean = self.status.strip()
            if status_clean not in ALLOWED_DDS_STATUSES:
                raise ValueError(f"Invalid DDS status: {status_clean}")
            self.status = status_clean
        elif self.kind == "dispatch":
            if not self.who_accepted or not self.who_accepted.strip():
                raise ValueError("who_accepted is required and cannot be empty for dispatch")
            if not self.summary or not self.summary.strip():
                raise ValueError("summary is required and cannot be empty for dispatch")
            self.who_accepted = self.who_accepted.strip()
            self.summary = self.summary.strip()
        return self


class DDSFinishPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DDSCompletePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(..., min_length=1, max_length=128)


class DDSTrainingStartPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(..., min_length=1, max_length=128)
    ticket_ids: List[str] = Field(..., min_length=1)

    @field_validator("ticket_ids")
    @classmethod
    def validate_pool(cls, values: List[str]) -> List[str]:
        clean = [value.strip() for value in values]
        if any(not value for value in clean) or len(set(clean)) != len(clean):
            raise ValueError("Expected nonempty unique ticket IDs")
        return clean


class DDSSessionStateResponse(BaseModel):
    session_id: str
    lesson_id: str
    ticket_id: Optional[str] = None
    card_id: Optional[str] = None
    session_status: str
    lesson_status: str
    started_at: Optional[str] = None
    incoming_card: Dict[str, Any] = Field(default_factory=dict)
    actions: List[Dict[str, Any]] = Field(default_factory=list)
    allowed_service_statuses: Dict[str, List[str]] = Field(default_factory=dict)
    submitted_at: Optional[str] = None
    score: Optional[float] = None
    received_at: Optional[str] = None
    card_submitted_at: Optional[str] = None
    current_index: int = 0
    total_cards: int = 1
    completed_cards: int = 0
    can_complete: bool = False
    completion_blockers: List[Dict[str, str]] = Field(default_factory=list)
    cards: List[Dict[str, Any]] = Field(default_factory=list)
    readonly: bool = False
    exercise: Optional[Dict[str, Any]] = None
    criteria: List[Dict[str, Any]] = Field(default_factory=list)
    last_attempt: Optional[Dict[str, Any]] = None
    stopped_at: Optional[str] = None
    stop_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
