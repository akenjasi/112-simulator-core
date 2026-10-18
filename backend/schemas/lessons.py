import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class LessonCreate(BaseModel):
    group_id: str = Field(..., description="ID учебной группы")
    cadet_id: Optional[str] = Field(None, description="ID конкретного курсанта для индивидуального назначения")
    student_id: Optional[str] = Field(None, description="ID конкретного курсанта (алиас для cadet_id)")
    ticket_id: Optional[str] = Field(None, description="ID подготовленного билета сценария")
    mode: str = Field("TRAINING", description="Режим занятия: TRAINING или EXAM")
    ticket_ids: Optional[List[str]] = Field(None, description="Упорядоченный набор билетов ДДС")
    target_role: Optional[str] = Field("DISPATCHER_DDS", description="Целевая роль (OPERATOR_112 или DISPATCHER_DDS)")
    categories: Optional[List[str]] = Field(default_factory=list, description="Список категорий происшествий")
    complexity: Optional[str] = Field("adaptive", description="Сложность (level_1, level_2, level_3, adaptive, mixed)")
    time_limit_seconds: Optional[int] = Field(30, description="Лимит времени на вызов в секундах")
    error_limit: Optional[int] = Field(None, description="Допустимое количество ошибок")

    @model_validator(mode="before")
    @classmethod
    def resolve_cadet_id_alias(cls, data: object) -> object:
        if isinstance(data, dict):
            data = dict(data)
            if "mode" not in data and "distribution_mode" in data:
                data["mode"] = data["distribution_mode"]
            if not data.get("cadet_id") and data.get("student_id"):
                data["cadet_id"] = data["student_id"]
        return data

    @field_validator("mode", mode="before")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        aliases = {"TRAINING": "TRAINING", "LIVE_STREAM": "TRAINING", "EXAM": "EXAM"}
        mode = aliases.get(str(value).strip().upper())
        if mode is None:
            raise ValueError("mode must be TRAINING or EXAM")
        return mode

    @field_validator("cadet_id")
    @classmethod
    def validate_cadet_id(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            return v if v else None
        return None

    @model_validator(mode="after")
    def validate_ticket_pool(self) -> "LessonCreate":
        if self.ticket_ids is not None:
            if self.target_role != "DISPATCHER_DDS":
                raise ValueError("ticket_ids is only supported for DDS lessons")
            if not self.ticket_ids or any(not value.strip() for value in self.ticket_ids):
                raise ValueError("ticket_ids must be a nonempty list of IDs")
            self.ticket_ids = [value.strip() for value in self.ticket_ids]
            if len(set(self.ticket_ids)) != len(self.ticket_ids):
                raise ValueError("ticket_ids must not contain duplicates")
            if self.ticket_id and self.ticket_ids != [self.ticket_id]:
                raise ValueError("Use either ticket_id or ticket_ids")
        return self

    @field_validator("group_id")
    @classmethod
    def validate_group_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("group_id cannot be empty")
        return v.strip()

    @field_validator("target_role")
    @classmethod
    def validate_target_role(cls, v: Optional[str]) -> str:
        if v is None:
            return "DISPATCHER_DDS"
        if v not in ("OPERATOR_112", "DISPATCHER_DDS"):
            raise ValueError("target_role must be 'OPERATOR_112' or 'DISPATCHER_DDS'")
        return v

    @field_validator("complexity")
    @classmethod
    def validate_complexity(cls, v: Optional[str]) -> str:
        if not v:
            return "adaptive"
        valid = {"level_1", "level_2", "level_3", "mixed", "adaptive", "basic", "medium", "advanced"}
        if v.lower() not in valid:
            raise ValueError(f"Invalid complexity '{v}'. Must be one of: {sorted(list(valid))}")
        return v.lower()

    @field_validator("time_limit_seconds")
    @classmethod
    def validate_time_limit(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("time_limit_seconds must be positive (> 0)")
        return v

    @field_validator("error_limit")
    @classmethod
    def validate_error_limit(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError("error_limit must be >= 0")
        return v


class LessonNotesUpdate(BaseModel):
    teacher_notes: str = Field(..., description="Заметки преподавателя к уроку")


class CadetTicketDetail(BaseModel):
    ticket_id: str
    title: str
    status: str = "passed"
    score: Optional[float] = None
    record_id: Optional[str] = None
    session_id: Optional[str] = None
    errors_count: int = 0
    errors: List[str] = Field(default_factory=list)
    completed_at: Optional[datetime.datetime] = None
    card_id: Optional[str] = None
    actions: List[dict] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CadetLessonStats(BaseModel):
    cadet_id: str
    cadet_name: str
    status: str = "WAITING"
    current_ticket: Optional[str] = None
    in_progress: int = 0
    passed: int = 0
    failed: int = 0
    progress: int = 0
    score: Optional[float] = None
    last_activity: Optional[str] = None
    session_id: Optional[str] = None
    tickets: List[CadetTicketDetail] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class LessonDetailResponse(BaseModel):
    id: str
    ticket_ids: List[str] = Field(default_factory=list)
    assignment_id: Optional[str] = None
    session_id: Optional[str] = None
    group_id: str
    cadet_id: Optional[str] = None
    group_name: Optional[str] = None
    teacher_id: Optional[str] = None
    target_role: str = "OPERATOR_112"
    mode: str = "TRAINING"
    status: str = "WAITING"
    categories: List[str] = Field(default_factory=list)
    complexity: Optional[str] = "level_1"
    time_limit_seconds: Optional[int] = 30
    error_limit: Optional[int] = None
    teacher_notes: Optional[str] = ""
    created_at: Optional[datetime.datetime] = None
    started_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None
    students: List[CadetLessonStats] = Field(default_factory=list)
    cadets: List[CadetLessonStats] = Field(default_factory=list)
    overall_progress: int = 0
    total_cadets: int = 0
    total_in_progress: int = 0
    total_passed: int = 0
    total_failed: int = 0

    @model_validator(mode="after")
    def populate_ids(self) -> "LessonDetailResponse":
        if not self.assignment_id:
            self.assignment_id = self.id
        if not self.session_id:
            self.session_id = self.id
        return self

    model_config = ConfigDict(from_attributes=True)


class LessonSummaryResponse(BaseModel):
    id: str
    group_id: str
    cadet_id: Optional[str] = None
    group_name: Optional[str] = None
    target_role: str = "OPERATOR_112"
    mode: str = "TRAINING"
    status: str = "WAITING"
    complexity: Optional[str] = None
    categories: List[str] = Field(default_factory=list)
    total_cadets: int = 0
    passed_count: int = 0
    failed_count: int = 0
    avg_score: Optional[float] = None
    teacher_notes: Optional[str] = ""
    created_at: Optional[datetime.datetime] = None
    started_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None
    students: List[CadetLessonStats] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
