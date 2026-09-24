import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String,
    Boolean,
    Integer,
    DateTime,
    JSON,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.models.base import Base

# domain_03 models are imported via base.py registry before domain_04.
# No stub Tables needed.


class IncidentCard(Base):
    __tablename__ = "incident_cards"

    card_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    session_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("exam_sessions.session_id"),
        nullable=True,
    )
    scenario_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("scenario_tickets.scenario_id"),
        nullable=True,
    )
    operator_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    card_origin: Mapped[str] = mapped_column(String, nullable=False)
    filled_data: Mapped[dict] = mapped_column(JSON, default=dict)
    assigned_services: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("card_id", str(uuid.uuid4()))
        if "filled_data" not in kwargs:
            kwargs["filled_data"] = {}
        if "assigned_services" not in kwargs:
            kwargs["assigned_services"] = {}
        if "status" not in kwargs:
            kwargs["status"] = "open"
        super().__init__(**kwargs)


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    evaluation_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    card_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("incident_cards.card_id"),
        nullable=False,
    )
    session_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("exam_sessions.session_id"),
        nullable=True,
    )
    scores: Mapped[dict] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    grammar: Mapped[dict] = mapped_column(JSON, default=dict)
    errors_list: Mapped[list] = mapped_column(JSON, default=list)
    expert_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    teacher_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_appealed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expert_modified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    expert_modified_by: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("evaluation_id", str(uuid.uuid4()))
        if "scores" not in kwargs:
            kwargs["scores"] = {}
        if "metrics" not in kwargs:
            kwargs["metrics"] = {}
        if "grammar" not in kwargs:
            kwargs["grammar"] = {}
        if "errors_list" not in kwargs:
            kwargs["errors_list"] = []
        if "is_appealed" not in kwargs:
            kwargs["is_appealed"] = False
        super().__init__(**kwargs)


class TicketResult(Base):
    __tablename__ = "ticket_results"

    result_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    ticket_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("exam_sessions.session_id"),
        nullable=True,
    )
    is_passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    errors_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_details: Mapped[dict] = mapped_column(JSON, default=dict)
    is_appealed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    teacher_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("result_id", str(uuid.uuid4()))
        if "error_details" not in kwargs:
            kwargs["error_details"] = {}
        if "is_passed" not in kwargs:
            kwargs["is_passed"] = False
        if "errors_count" not in kwargs:
            kwargs["errors_count"] = 0
        if "is_appealed" not in kwargs:
            kwargs["is_appealed"] = False
        super().__init__(**kwargs)


class SessionReport(Base):
    __tablename__ = "session_reports"

    report_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    assignment_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("assignments.assignment_id"),
        nullable=True,
    )
    group_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("student_groups.group_id"),
        nullable=True,
    )
    teacher_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=False,
    )
    session_type: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    per_cadet: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_insights: Mapped[dict] = mapped_column(JSON, default=dict)
    export_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    is_attestation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("report_id", str(uuid.uuid4()))
        if "summary" not in kwargs:
            kwargs["summary"] = {}
        if "per_cadet" not in kwargs:
            kwargs["per_cadet"] = {}
        if "ai_insights" not in kwargs:
            kwargs["ai_insights"] = {}
        if "export_meta" not in kwargs:
            kwargs["export_meta"] = {}
        if "is_attestation" not in kwargs:
            kwargs["is_attestation"] = False
        super().__init__(**kwargs)


# Table creation is handled by the lifespan hook in main.py (async, correct).
# Do NOT call Base.metadata.create_all() here — it blocks the async event loop.
