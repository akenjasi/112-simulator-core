import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    JSON,
    ForeignKey,
    CheckConstraint,
    Enum as SQLEnum,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.models.base import Base


class ProfileType(str, Enum):
    OPERATOR_112 = "OPERATOR_112"
    DISPATCHER_DDS = "DISPATCHER_DDS"


# expire_on_commit=False is already configured on AsyncSessionLocal in database.py.


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('ADMIN', 'TEACHER', 'CADET')", name="role_check"),
    )

    user_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    specialization: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    group_ids: Mapped[list] = mapped_column(JSON, default=list)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __init__(self, **kwargs):
        kwargs.setdefault("user_id", str(uuid.uuid4()))
        kwargs.setdefault("group_ids", [])
        kwargs.setdefault("failed_login_attempts", 0)
        kwargs.setdefault("is_active", True)
        super().__init__(**kwargs)


class StudentGroup(Base):
    __tablename__ = "student_groups"

    group_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    group_name: Mapped[str] = mapped_column(String, nullable=False)
    profile: Mapped[ProfileType] = mapped_column(
        SQLEnum(ProfileType, native_enum=False),
        nullable=False,
        default=ProfileType.OPERATOR_112,
    )
    department: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    teacher_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    cadet_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __init__(self, **kwargs):
        kwargs.setdefault("group_id", str(uuid.uuid4()))
        kwargs.setdefault("profile", ProfileType.OPERATOR_112)
        if isinstance(kwargs.get("profile"), str):
            kwargs["profile"] = ProfileType(kwargs["profile"])
        kwargs.setdefault("cadet_ids", [])
        kwargs.setdefault("is_active", True)
        super().__init__(**kwargs)


Group = StudentGroup


class UserActionLog(Base):
    __tablename__ = "user_action_log"

    log_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.user_id"),
        nullable=True,
    )
    role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    target_entity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    details: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("log_id", str(uuid.uuid4()))
        super().__init__(**kwargs)
