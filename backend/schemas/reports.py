"""Pydantic schemas for reports and evaluations."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CommunicationMetrics(BaseModel):
    greeting_success: bool = True
    filler_words: int = 0
    script_followed_pct: float = 100.0


class CardMetrics(BaseModel):
    address_correct: bool = True
    services_matched: bool = True
    over_dispatched_services: List[str] = Field(
        default_factory=list,
        description="Список служб, которые курсант вызвал ошибочно (гипер-диспетчеризация)",
    )
    missed_critical_factoids: List[str] = Field(
        default_factory=list,
        description="Список критичных фактоидов, которые заявил абонент, но курсант не занес в карточку",
    )


class SLAMetrics(BaseModel):
    sla_breached_count: int = 0
    time_to_first_dispatch_sec: int = Field(
        0,
        description="Время от начала звонка до первой отправки карточки (в секундах)",
    )


class ScoreDetails(BaseModel):
    penalty: int = 0
    penalties_list: List[str] = Field(default_factory=list)
    comm_score: int = 100
    card_score: int = 100
    sla_score: int = 100
    final_score: int = 100
    penalties: Dict[str, int] = Field(default_factory=dict)


class CadetEvaluationItem(BaseModel):
    session_id: Optional[str] = None
    cadet_id: Optional[str] = None
    cadet_name: str = "Курсант"
    ticket_id: Optional[str] = "Билет #1"
    comm_score: int = 100
    card_score: int = 100
    sla_score: int = 100
    final_score: int = 100
    penalty: int = 0
    time_to_first_dispatch_sec: int = 0
    over_dispatched_services: List[str] = Field(default_factory=list)
    missed_critical_factoids: List[str] = Field(default_factory=list)
    penalties_list: List[str] = Field(default_factory=list)
    comm_metrics: Optional[CommunicationMetrics] = None
    card_metrics: Optional[CardMetrics] = None
    sla_metrics: Optional[SLAMetrics] = None


class ReportGenerateRequest(BaseModel):
    group_id: Optional[str] = None
    session_ids: Optional[List[str]] = None
    custom_records: Optional[List[Dict[str, Any]]] = None


class ReportGenerateResponse(BaseModel):
    task_id: str


class ReportStatusResponse(BaseModel):
    task_id: str
    status: str
    file_path: Optional[str] = None
    error: Optional[str] = None
