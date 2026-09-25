import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Integer,
    String,
    Boolean,
    DateTime,
    JSON,
    ForeignKey,
    CheckConstraint,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.models.base import Base


class SessionStateModel(Base):
    __tablename__ = "session_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, nullable=False)
    panic_level: Mapped[int] = mapped_column(Integer, default=0)
    asked_intents: Mapped[str] = mapped_column(String, default="")


# Table creation is handled by the lifespan hook in main.py (async, correct).
# Do NOT call Base.metadata.create_all() here — it blocks the async event loop.


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint(
            "session_type IN ('CALL_SIMULATION', 'CARD_ACTIONS')",
            name="assignment_session_type_check",
        ),
        CheckConstraint(
            "mode IN ('TRAINING', 'EXAM')",
            name="assignment_mode_check",
        ),
        CheckConstraint(
            "status IN ('WAITING', 'ACTIVE', 'COMPLETED')",
            name="assignment_status_check",
        ),
        CheckConstraint(
            "target_role IN ('OPERATOR_112', 'DISPATCHER_DDS')",
            name="assignment_target_role_check",
        ),
    )

    assignment_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    scenario_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("scenario_tickets.scenario_id"),
        nullable=True,
    )
    card_pool_ids: Mapped[list] = mapped_column(JSON, default=list)
    session_type: Mapped[str] = mapped_column(String, default="CALL_SIMULATION", nullable=False)
    card_pool_source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mode: Mapped[str] = mapped_column(String, default="TRAINING", nullable=False)
    status: Mapped[str] = mapped_column(String, default="WAITING", nullable=False)
    target_role: Mapped[str] = mapped_column(String, default="OPERATOR_112", nullable=False)
    group_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("student_groups.group_id"),
        nullable=True,
    )
    cadet_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    assigned_by: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    available_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    categories: Mapped[list] = mapped_column(JSON, default=list)
    complexity: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="adaptive")
    error_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    time_limit_seconds: Mapped[Optional[int]] = mapped_column(Integer, default=30, nullable=True)
    teacher_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    @property
    def id(self) -> str:
        return self.assignment_id

    @id.setter
    def id(self, value: str):
        self.assignment_id = value

    def __init__(self, **kwargs):
        if "id" in kwargs and "assignment_id" not in kwargs:
            kwargs["assignment_id"] = kwargs.pop("id")
        kwargs.setdefault("assignment_id", str(uuid.uuid4()))
        if "card_pool_ids" not in kwargs:
            kwargs["card_pool_ids"] = []
        if "mode" not in kwargs:
            kwargs["mode"] = "TRAINING"
        if "is_active" not in kwargs:
            kwargs["is_active"] = True
        if "status" not in kwargs:
            kwargs["status"] = "WAITING"
        if "target_role" not in kwargs:
            kwargs["target_role"] = "OPERATOR_112"
        if "session_type" not in kwargs:
            if kwargs.get("target_role") == "DISPATCHER_DDS":
                kwargs["session_type"] = "CARD_ACTIONS"
            else:
                kwargs["session_type"] = "CALL_SIMULATION"
        if "categories" not in kwargs:
            kwargs["categories"] = []
        if "time_limit_seconds" not in kwargs:
            kwargs["time_limit_seconds"] = 30
        if "teacher_notes" not in kwargs:
            kwargs["teacher_notes"] = ""
        super().__init__(**kwargs)


Lesson = Assignment


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    session_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    session_type: Mapped[str] = mapped_column(String, nullable=False)
    assignment_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("assignments.assignment_id"),
        nullable=True,
    )
    cadet_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String, default="INITIALIZED", nullable=False)
    browser_call: Mapped[dict] = mapped_column(JSON, default=dict)
    dynamic_state: Mapped[dict] = mapped_column(JSON, default=dict)
    dialogue_log: Mapped[list] = mapped_column(JSON, default=list)
    offline_buffer: Mapped[list] = mapped_column(JSON, default=list)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    categories: Mapped[list] = mapped_column(JSON, default=list)
    complexity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    error_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    time_limit_seconds: Mapped[Optional[int]] = mapped_column(Integer, default=30, nullable=True)

    @property
    def lesson_id(self) -> Optional[str]:
        return self.assignment_id

    @lesson_id.setter
    def lesson_id(self, value: Optional[str]):
        self.assignment_id = value

    def __init__(self, **kwargs):
        if "lesson_id" in kwargs and "assignment_id" not in kwargs:
            kwargs["assignment_id"] = kwargs.pop("lesson_id")
        kwargs.setdefault("session_id", str(uuid.uuid4()))
        if "browser_call" not in kwargs:
            kwargs["browser_call"] = {}
        if "dynamic_state" not in kwargs:
            kwargs["dynamic_state"] = {}
        if "dialogue_log" not in kwargs:
            kwargs["dialogue_log"] = []
        if "offline_buffer" not in kwargs:
            kwargs["offline_buffer"] = []
        if "categories" not in kwargs:
            kwargs["categories"] = []
        if "time_limit_seconds" not in kwargs:
            kwargs["time_limit_seconds"] = 30
        super().__init__(**kwargs)


TrainingSession = ExamSession


class CardActionSession(Base):
    __tablename__ = "card_action_sessions"

    session_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    assignment_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("assignments.assignment_id"),
        nullable=True,
    )
    cadet_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String, default="INITIALIZED", nullable=False)
    card_queue: Mapped[list] = mapped_column(JSON, default=list)
    card_results: Mapped[dict] = mapped_column(JSON, default=dict)
    offline_buffer: Mapped[list] = mapped_column(JSON, default=list)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("session_id", str(uuid.uuid4()))
        if "card_queue" not in kwargs:
            kwargs["card_queue"] = []
        if "card_results" not in kwargs:
            kwargs["card_results"] = {}
        if "offline_buffer" not in kwargs:
            kwargs["offline_buffer"] = []
        super().__init__(**kwargs)


class ReferenceMaterial(Base):
    __tablename__ = "reference_materials"

    material_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    content_html: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __init__(self, **kwargs):
        kwargs.setdefault("material_id", str(uuid.uuid4()))
        if "tags" not in kwargs:
            kwargs["tags"] = []
        if "is_active" not in kwargs:
            kwargs["is_active"] = True
        super().__init__(**kwargs)


class KnowledgeFile(Base):
    __tablename__ = "knowledge_files"

    file_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content_type: Mapped[str] = mapped_column(String, default="application/octet-stream", nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    uploaded_by: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("file_id", str(uuid.uuid4()))
        super().__init__(**kwargs)

