"""Pydantic schemas for Aggregated Analytics API."""

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, RootModel, field_validator, model_validator


class HeatmapResponse(RootModel[Dict[str, Dict[str, int]]]):
    """Response schema for error heatmap: {category: {error_name: count}}."""

    root: Dict[str, Dict[str, int]] = Field(default_factory=dict)

    def __getitem__(self, key: str) -> Dict[str, int]:
        return self.root[key]

    def __iter__(self):
        return iter(self.root)

    def __len__(self) -> int:
        return len(self.root)

    def get(self, key: str, default: Any = None) -> Any:
        return self.root.get(key, default)

    def items(self):
        return self.root.items()

    def keys(self):
        return self.root.keys()

    def values(self):
        return self.root.values()


class TrendPoint(BaseModel):
    """Trend data point for a specific date."""

    user_score: Optional[Union[int, float]] = Field(
        default=None,
        description="Средний балл целевого курсанта за этот день",
    )
    group_avg: Optional[Union[int, float]] = Field(
        default=None,
        description="Средний балл группы за этот день",
    )


class TrendResponse(RootModel[Dict[str, TrendPoint]]):
    """Response schema for cadet progress trends: {date: TrendPoint}."""

    root: Dict[str, TrendPoint] = Field(default_factory=dict)

    def __getitem__(self, key: str) -> TrendPoint:
        return self.root[key]

    def __iter__(self):
        return iter(self.root)

    def __len__(self) -> int:
        return len(self.root)

    def get(self, key: str, default: Any = None) -> Any:
        return self.root.get(key, default)

    def items(self):
        return self.root.items()

    def keys(self):
        return self.root.keys()

    def values(self):
        return self.root.values()


class LeaderboardItem(BaseModel):
    """Individual cadet entry in leaderboard."""

    cadet_name: str = Field(..., description="Имя курсанта")
    metric_value: float = Field(..., description="Среднее значение запрашиваемой метрики")
    value: Optional[float] = Field(
        default=None,
        description="Синоним metric_value для совместимости",
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Уникальный идентификатор курсанта",
    )

    def model_post_init(self, __context: Any) -> None:
        if self.value is None:
            self.value = self.metric_value

    @property
    def score(self) -> float:
        return self.metric_value


class LeaderboardResponse(RootModel[List[LeaderboardItem]]):
    """Response schema for group leaderboard (Top 10 cadets)."""

    root: List[LeaderboardItem] = Field(default_factory=list)

    def __iter__(self):
        return iter(self.root)

    def __getitem__(self, item):
        return self.root[item]

    def __len__(self) -> int:
        return len(self.root)


class RecordAppealRequest(BaseModel):
    status: str = Field(default="passed", description="Новый статус оценки")
    comment: Optional[str] = Field(default=None, description="Комментарий преподавателя")


class RecordSummary(BaseModel):
    record_id: str
    ticket_id: Optional[str] = None
    title: Optional[str] = None
    status: str
    score: Optional[float] = None
    is_appealed: bool = False
    errors_count: Optional[int] = 0
    teacher_comment: Optional[str] = None
    evaluation_source: Optional[str] = None


class CadetAnalyticsSummary(BaseModel):
    cadet_id: str
    cadet_name: str
    success_rate: Optional[float] = None
    records: List[RecordSummary] = Field(default_factory=list)


class SessionAnalyticsResponse(BaseModel):
    session_id: str
    title: str
    status: Optional[str] = None
    created_at: Optional[str] = None
    cadets: List[CadetAnalyticsSummary] = Field(default_factory=list)


from backend.schemas.domain_02 import DDSEtalon


class DDSActionItem(BaseModel):
    request_id: Optional[str] = None
    kind: Optional[str] = None
    service_name: Optional[str] = None
    actor_id: Optional[str] = None
    at: Optional[str] = None
    seconds_from_start: Optional[int] = None
    status: Optional[str] = None
    comment: Optional[str] = None
    order_number: Optional[str] = None
    who_accepted: Optional[str] = None
    summary: Optional[str] = None


class IncidentContext(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    caller_name: Optional[str] = None
    caller_phone: Optional[str] = None
    caller_role: Optional[str] = None
    signs: Dict[str, str] = Field(default_factory=dict)
    assigned_service: Optional[str] = None


class CriteriaDecision(BaseModel):
    expected_decision: Optional[str] = None
    rationale: Optional[str] = None
    alternatives: Optional[str] = None
    actual_decision: Optional[str] = None
    actual_service: Optional[str] = None
    actual_comment: Optional[str] = None
    actual_at: Optional[str] = None


class CriteriaTimeliness(BaseModel):
    normative_seconds: Optional[int] = 30
    actual_seconds: Optional[int] = None
    directed_at: Optional[str] = None
    confirmed_at: Optional[str] = None
    is_recorded: bool = False
    note: Optional[str] = None


class CriteriaProgression(BaseModel):
    expected_stages: List[str] = Field(default_factory=list)
    expected_result: Optional[str] = None
    actual_stages: List[Dict[str, Any]] = Field(default_factory=list)
    final_status: Optional[str] = None


class CriteriaComment(BaseModel):
    required_points: List[str] = Field(default_factory=list)
    sample_comment: Optional[str] = None
    actual_comments: List[str] = Field(default_factory=list)
    actual_messages: List[Dict[str, Any]] = Field(default_factory=list)


class DDSCriteriaComparison(BaseModel):
    decision: CriteriaDecision = Field(default_factory=CriteriaDecision)
    timeliness: CriteriaTimeliness = Field(default_factory=CriteriaTimeliness)
    progression: CriteriaProgression = Field(default_factory=CriteriaProgression)
    comment: CriteriaComment = Field(default_factory=CriteriaComment)
    has_dds_etalon: bool = False
    has_cadet_actions: bool = False


class RecordDetailResponse(BaseModel):
    record_id: str
    session_id: Optional[str] = None
    cadet_id: Optional[str] = None
    cadet_name: Optional[str] = None
    ticket_id: Optional[str] = None
    title: Optional[str] = None
    status: str
    score: Optional[float] = None
    automatic_score: Optional[float] = None
    expert_score: Optional[float] = None
    is_appealed: bool = False
    teacher_comment: Optional[str] = None
    evaluation_source: Optional[str] = None
    expert_modified_at: Optional[str] = None
    expert_modified_by: Optional[str] = None
    etalon: Dict[str, Any] = Field(default_factory=dict)
    student_answer: Dict[str, Any] = Field(default_factory=dict)
    error_details: Any = Field(default_factory=list)
    snapshot_missing: bool = False

    # Rich DDS evaluation context
    incident_context: Optional[IncidentContext] = None
    dds_etalon: Optional[DDSEtalon] = None
    cadet_actions: List[DDSActionItem] = Field(default_factory=list)
    dds_comparison: Optional[DDSCriteriaComparison] = None
    has_dds_etalon: bool = False



class DailyDynamicsPoint(BaseModel):
    """Daily aggregated score point for dynamics chart."""
    date: str = Field(..., description="Дата (YYYY-MM-DD)")
    avg_score: Optional[float] = Field(default=None, description="Средний балл по оценённым попыткам за день (null если нет оценок)")
    total_sessions: int = Field(default=0, description="Всего сессий/попыток за день")
    graded_count: int = Field(default=0, description="Количество фактически оценённых попыток")
    pending_count: int = Field(default=0, description="Количество активных или неоценённых попыток")
    passed_count: int = Field(default=0, description="Успешно сданных оценённых попыток")
    failed_count: int = Field(default=0, description="Несданных оценённых попыток")
    pass_rate: Optional[float] = Field(default=None, description="Процент успешных сдач от оценённых попыток (%) или null")


class AnalyticsOverviewResponse(BaseModel):
    """Overall summary statistics for teacher dashboard header metrics."""
    total_sessions: int = Field(default=0, description="Всего сессий за выбранный период")
    total_attempts: int = Field(default=0, description="Всего попыток (билетов) за выбранный период")
    graded_attempts: int = Field(default=0, description="Количество фактически оценённых попыток")
    pending_attempts: int = Field(default=0, description="Количество неоценённых или активных попыток")
    avg_score: Optional[float] = Field(default=None, description="Средний балл по фактически оценённым попыткам (null если нет оценок)")
    passed_count: int = Field(default=0, description="Количество успешно сданных попыток")
    failed_count: int = Field(default=0, description="Количество несданных оценённых попыток")
    pass_rate: Optional[float] = Field(default=None, description="Доля успешных сдач от оценённых попыток в % (null если нет оценок)")
    total_errors: int = Field(default=0, description="Общее число зафиксированных ошибок")
    active_cadets_count: int = Field(default=0, description="Количество уникальных курсантов в выборке")
    trend_direction: Optional[str] = Field(default=None, description="Направление тренда ('positive', 'negative', 'stable' или null)")
    daily_dynamics: List[DailyDynamicsPoint] = Field(default_factory=list, description="Посуточная динамика за период")


class GroupComparisonItem(BaseModel):
    """Summary of group performance for bar chart comparison."""
    group_id: str
    group_name: str
    student_count: int = 0
    avg_score: float = 0.0
    pass_rate: float = 0.0
    total_sessions: int = 0
    total_errors: int = 0


class ErrorTypeInfo(BaseModel):
    """Metadata describing an error type."""
    key: str
    label: str
    category: str  # "communication", "card", "sla", etc.
    severity: Optional[str] = "medium"


class EntityErrorInfo(BaseModel):
    """Frequency counts of errors for a student or group."""
    id: str
    name: str
    group_name: Optional[str] = None
    error_counts: Dict[str, int] = Field(default_factory=dict)
    total_errors: int = 0


class ErrorHeatmapResponse(BaseModel):
    """Structured response for 2D error frequency matrix / heatmap."""
    error_types: List[ErrorTypeInfo] = Field(default_factory=list)
    entities: List[EntityErrorInfo] = Field(default_factory=list)
    totals_by_error: Dict[str, int] = Field(default_factory=dict)


class GradeOverrideRequest(BaseModel):
    score: float = Field(..., ge=0.0, le=100.0, description="Новая оценка от 0 до 100")
    reason: str = Field(..., min_length=1, description="Обязательная причина пересмотра оценки")
    comment: Optional[str] = Field(default=None, description="Дополнительный комментарий преподавателя")

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        if not isinstance(v, str) or not v.strip():
            raise ValueError("Причина пересмотра оценки не может быть пустой")
        return v.strip()


class RecordGradeOverrideRequest(GradeOverrideRequest):
    score: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    status: Optional[Literal["passed", "failed"]] = None

    @model_validator(mode="after")
    def require_grade_change(self):
        if self.score is None and self.status is None:
            raise ValueError("Укажите балл или зачёт/незачёт")
        return self


class GradeOverrideResponse(BaseModel):
    status: str = "ok"
    session_id: Optional[str] = None
    record_id: Optional[str] = None
    old_score: Optional[float] = None
    new_score: Optional[float] = None
    reason: str
    teacher_id: Optional[str] = None
    updated_at: str


