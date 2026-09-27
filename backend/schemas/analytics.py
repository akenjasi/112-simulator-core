"""Pydantic schemas for Aggregated Analytics API."""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, RootModel


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


class CadetAnalyticsSummary(BaseModel):
    cadet_id: str
    cadet_name: str
    success_rate: float
    records: List[RecordSummary] = Field(default_factory=list)


class SessionAnalyticsResponse(BaseModel):
    session_id: str
    title: str
    created_at: Optional[str] = None
    cadets: List[CadetAnalyticsSummary] = Field(default_factory=list)


class RecordDetailResponse(BaseModel):
    record_id: str
    cadet_id: Optional[str] = None
    cadet_name: Optional[str] = None
    ticket_id: Optional[str] = None
    title: Optional[str] = None
    status: str
    score: Optional[float] = None
    is_appealed: bool = False
    teacher_comment: Optional[str] = None
    etalon: Dict[str, Any] = Field(default_factory=dict)
    student_answer: Dict[str, Any] = Field(default_factory=dict)
    error_details: Any = Field(default_factory=list)


class DailyDynamicsPoint(BaseModel):
    """Daily aggregated score point for dynamics chart."""
    date: str = Field(..., description="Дата (YYYY-MM-DD)")
    avg_score: float = Field(..., description="Средний балл за день")
    total_sessions: int = Field(default=0, description="Всего сессий за день")
    passed_count: int = Field(default=0, description="Успешно пройденных сессий")
    failed_count: int = Field(default=0, description="Не пройденных сессий")
    pass_rate: float = Field(default=0.0, description="Процент успешных с первой попытки (%)")


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


