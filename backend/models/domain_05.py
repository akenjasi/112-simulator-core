import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    JSON,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.models.base import Base

# domain_01 and domain_02 models are imported via base.py registry before domain_05.
# No stub Tables needed.


class BricksMatrixRef(Base):
    __tablename__ = "bricks_matrix_refs"

    ticket_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("scenario_tickets.scenario_id"),
        primary_key=True,
    )
    bricks_file: Mapped[str] = mapped_column(String, nullable=False)
    total_bricks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tts_compiled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    compiled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("total_bricks", 0)
        kwargs.setdefault("tts_compiled", False)
        super().__init__(**kwargs)


class ImportJob(Base):
    __tablename__ = "import_jobs"

    job_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    imported_by: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    imported_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("job_id", str(uuid.uuid4()))
        kwargs.setdefault("imported_count", 0)
        kwargs.setdefault("failed_count", 0)
        if "errors" not in kwargs:
            kwargs["errors"] = []
        if "created_at" not in kwargs:
            kwargs["created_at"] = datetime.now(timezone.utc)
        super().__init__(**kwargs)


# Table creation is handled by the lifespan hook in main.py (async, correct).
# Do NOT call Base.metadata.create_all() here — it blocks the async event loop.
