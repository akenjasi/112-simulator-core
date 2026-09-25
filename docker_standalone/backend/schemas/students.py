from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class CompetenceMatrixItem(BaseModel):
    category: str
    score: float

    model_config = ConfigDict(from_attributes=True)


class TopErrorItem(BaseModel):
    text: str
    frequency_percent: int
    is_fatal: bool = False

    model_config = ConfigDict(from_attributes=True)


class StudentStatsResponse(BaseModel):
    average_score: float = 0.0
    average_score_week: float = 0.0
    average_score_month: float = 0.0
    average_score_all_time: float = 0.0
    average_scores: Dict[str, float] = Field(default_factory=dict)
    lessons_completed: int = 0
    competence_matrix: List[CompetenceMatrixItem] = Field(default_factory=list)
    top_errors: List[TopErrorItem] = Field(default_factory=list)

    cards_solved: int = 0
    average_score_7_days: float = 0.0
    score_trend: float = 0.0
    average_processing_time_seconds: int = 0
    time_trend: int = 0
    service_accuracy_percent: float = 0.0
    student_id: Optional[str] = "СМ1-12"
    full_name: Optional[str] = "Иванов Иван Иванович"

    model_config = ConfigDict(from_attributes=True)


class StudentLessonHistoryTicket(BaseModel):
    ticket_id: str
    title: str
    category: Optional[str] = None
    status: str = "passed"
    score: Optional[float] = None
    errors_count: int = 0
    errors: List[str] = Field(default_factory=list)
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class StudentLessonHistoryItem(BaseModel):
    session_id: str
    lesson_id: Optional[str] = None
    assignment_id: Optional[str] = None
    title: str = "Урок"
    target_role: str = "OPERATOR_112"
    session_type: str = "CALL_SIMULATION"
    status: str = "COMPLETED"
    score: Optional[float] = None
    date: Optional[str] = None
    created_at: Optional[datetime] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    tickets: List[StudentLessonHistoryTicket] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class DemoSessionRequest(BaseModel):
    target_role: Optional[str] = Field("OPERATOR_112", description="Целевая роль (OPERATOR_112 или DISPATCHER_DDS)")


class DemoSessionResponse(BaseModel):
    session_id: str
    ticket_id: str
    role: str
    redirect_url: str

    model_config = ConfigDict(from_attributes=True)
