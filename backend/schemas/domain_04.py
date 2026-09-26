from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TicketEvaluationRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    etalon_services: List[str]
    etalon_fields: Dict[str, Any]
    student_services: List[str]
    student_fields: Dict[str, Any]
    error_limit: int = 0


class TicketEvaluationResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_passed: bool
    errors_count: int
    error_details: Dict[str, Any] = Field(default_factory=dict)


class TicketResultUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_passed: bool
    teacher_comment: Optional[str] = None


class TicketResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    result_id: str
    ticket_id: Optional[str] = None
    session_id: Optional[str] = None
    is_passed: bool
    errors_count: int
    error_details: Dict[str, Any] = Field(default_factory=dict)
    is_appealed: bool = False
    teacher_comment: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class IncidentCardSubmit(BaseModel):
    ticket_id: str
    time_taken_seconds: int
    caller_name: str
    caller_status: str
    address_string: str
    incident_description: str
    assigned_services: List[str]
    is_refusal_03: bool = False


class EvaluationResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    evaluation_id: str
    scores: dict
    metrics: dict
    errors_list: List[str]

