import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlalchemy import (
    Table,
    Column,
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
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from backend.models.base import Base


class ProfileType(str, Enum):
    OPERATOR_112 = "OPERATOR_112"
    DISPATCHER_DDS = "DISPATCHER_DDS"


# expire_on_commit=False is already configured on AsyncSessionLocal in database.py.

student_group_link = Table(
    "student_group_link",
    Base.metadata,
    Column("user_id", String, ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
    Column("group_id", String, ForeignKey("student_groups.group_id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('ADMIN', 'TEACHER', 'CADET', 'STUDENT')", name="role_check"),
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
    student_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="СМ1-12")
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
    totp_secret: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    groups: Mapped[list["StudentGroup"]] = relationship(
        "StudentGroup",
        secondary=student_group_link,
        back_populates="students",
        lazy="selectin",
    )

    @property
    def id(self) -> str:
        return self.user_id

    @id.setter
    def id(self, value: str):
        self.user_id = value

    def __init__(self, **kwargs):
        if "id" in kwargs and "user_id" not in kwargs:
            kwargs["user_id"] = kwargs.pop("id")
        kwargs.setdefault("user_id", str(uuid.uuid4()))
        kwargs.setdefault("group_ids", [])
        kwargs.setdefault("failed_login_attempts", 0)
        kwargs.setdefault("is_active", True)
        kwargs.setdefault("totp_secret", None)
        kwargs.setdefault("is_2fa_enabled", False)
        if kwargs.get("role") == "CADET":
            kwargs.setdefault("full_name", "Иванов Иван Иванович")
            kwargs.setdefault("student_id", "СМ1-12")
        super().__init__(**kwargs)


class StudentGroup(Base):
    __tablename__ = "student_groups"

    group_id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    group_name: Mapped[str] = mapped_column(String, nullable=False)
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

    students: Mapped[list["User"]] = relationship(
        "User",
        secondary=student_group_link,
        back_populates="groups",
        lazy="selectin",
    )

    @property
    def id(self) -> str:
        return self.group_id

    @id.setter
    def id(self, value: str):
        self.group_id = value

    @property
    def name(self) -> str:
        return self.group_name

    @name.setter
    def name(self, value: str):
        self.group_name = value

    @property
    def cadets(self) -> list["User"]:
        return self.students

    @property
    def student_count(self) -> int:
        uids = set(self.cadet_ids or [])
        if "students" in self.__dict__ and self.students:
            uids.update(u.user_id for u in self.students if getattr(u, "user_id", None))
        return len(uids)

    def __init__(self, **kwargs):
        if "id" in kwargs and "group_id" not in kwargs:
            kwargs["group_id"] = kwargs.pop("id")
        if "name" in kwargs and "group_name" not in kwargs:
            kwargs["group_name"] = kwargs.pop("name")
        kwargs.pop("profile", None)
        kwargs.pop("specialization", None)
        kwargs.setdefault("group_id", str(uuid.uuid4()))
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
    action_type = synonym("action")
    endpoint: Mapped[Optional[str]] = mapped_column(String, nullable=True)
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
        if "action_type" in kwargs and "action" not in kwargs:
            kwargs["action"] = kwargs.pop("action_type")
        kwargs.setdefault("log_id", str(uuid.uuid4()))
        super().__init__(**kwargs)


# Re-exports
def __getattr__(name):
    if name in ("AIStudentAdvice", "AIGroupAdvice"):
        from backend.models.domain_03 import AIStudentAdvice, AIGroupAdvice
        return globals().setdefault(name, locals()[name])
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

class SecurityPolicy(Base):
    __tablename__ = "security_policies"

    key: Mapped[str] = mapped_column(String, primary_key=True, unique=True, nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

class SystemErrorLog(Base):
    __tablename__ = "system_error_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    error_message: Mapped[str] = mapped_column(String, nullable=False)
    traceback: Mapped[str] = mapped_column(String, nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", str(uuid.uuid4()))
        super().__init__(**kwargs)
