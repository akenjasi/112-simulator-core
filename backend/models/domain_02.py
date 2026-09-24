import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Integer,
    String,
    Text,
    DateTime,
    JSON,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.models.base import Base


class GeneratedTicket(Base):
    __tablename__ = "generated_tickets"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    category: Mapped[str] = mapped_column(String, nullable=False)
    subcategory: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    complexity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    plot: Mapped[str] = mapped_column(Text, nullable=False, default="")
    factoids: Mapped[dict] = mapped_column(JSON, default=dict)
    ground_truth: Mapped[dict] = mapped_column(JSON, default=dict)
    etalon_services: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    sequence_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    def __init__(self, **kwargs):
        if "id" in kwargs and kwargs["id"] is not None:
            kwargs["id"] = str(kwargs["id"])
        else:
            kwargs.setdefault("id", str(uuid.uuid4()))
        if "factoids" not in kwargs:
            kwargs["factoids"] = {}
        if "ground_truth" not in kwargs:
            kwargs["ground_truth"] = {}
        if "etalon_services" not in kwargs:
            kwargs["etalon_services"] = []
        super().__init__(**kwargs)


class ScenarioTicketModel(Base):
    __tablename__ = "scenario_ticket_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_uuid: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default=lambda: str(uuid.uuid4()),
    )
    matrix_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ScenarioTicket(Base):
    __tablename__ = "scenario_tickets"

    scenario_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    workflow_state: Mapped[dict] = mapped_column(JSON, default=dict)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    ground_truth: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_content: Mapped[dict] = mapped_column(JSON, default=dict)
    reference_material_ids: Mapped[list] = mapped_column(JSON, default=list)
    version_history: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("scenario_id", str(uuid.uuid4()))
        if "workflow_state" not in kwargs:
            kwargs["workflow_state"] = {}
        if "settings" not in kwargs:
            kwargs["settings"] = {}
        if "ground_truth" not in kwargs:
            kwargs["ground_truth"] = {}
        if "ai_content" not in kwargs:
            kwargs["ai_content"] = {}
        if "reference_material_ids" not in kwargs:
            kwargs["reference_material_ids"] = []
        if "version_history" not in kwargs:
            kwargs["version_history"] = []
        super().__init__(**kwargs)
