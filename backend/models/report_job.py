"""Durable single-process report queue. Legacy DDS rows remain untouched."""
from datetime import datetime, timezone
import uuid

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


def utcnow():
    return datetime.now(timezone.utc)


class ReportJob(Base):
    __tablename__ = "report_jobs"

    job_id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scope_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    lesson_id: Mapped[str | None] = mapped_column(String, index=True, unique=True)
    owner_id: Mapped[str | None] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    waiting_reason: Mapped[str | None] = mapped_column(String)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    snapshot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    snapshot: Mapped[dict | None] = mapped_column(JSON)
    report_text: Mapped[str | None] = mapped_column(Text)
    model_used: Mapped[str | None] = mapped_column(String)
    error_code: Mapped[str | None] = mapped_column(String)
    error_message: Mapped[str | None] = mapped_column(Text)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def __init__(self, **kwargs):
        # Existing DDS integrations can construct a lesson job with its old name.
        kwargs.setdefault("kind", "lesson")
        if kwargs.get("lesson_id"):
            kwargs.setdefault("scope_key", "lesson:" + kwargs["lesson_id"])
        kwargs.setdefault("job_id", str(uuid.uuid4()))
        kwargs.setdefault("status", "pending")
        kwargs.setdefault("attempt", 1)
        kwargs.setdefault("retry_count", 0)
        super().__init__(**kwargs)


class ReportSchedulerState(Base):
    __tablename__ = "report_scheduler_state"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    enabled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
