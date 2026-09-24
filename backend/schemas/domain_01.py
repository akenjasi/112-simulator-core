import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator
from backend.models.domain_01 import ProfileType

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class StudentCSVRow(BaseModel):
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not EMAIL_REGEX.match(v):
            raise ValueError(f"Invalid email address: {v}")
        return v


class Group(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    group_name: str
    group_id: Optional[str] = None
    department: Optional[str] = None
    teacher_id: Optional[str] = None
    cadet_ids: list[str] = []
    is_active: bool = True


# Aliases and related group schemas
StudentGroup = Group


class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    group_name: str
    department: Optional[str] = None


class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    group_id: str
    group_name: str
    department: Optional[str] = None
    cadet_ids: list[str] = []
    is_active: bool = True


class SingleStudentAddRequest(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    middle_name: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[str] = None
    id: Optional[str] = None
    username: Optional[str] = None


class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    user_id: str
    id: Optional[str] = None
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str = "CADET"
    groups: list[str] = []
    is_active: bool = True
    created_at: Optional[str] = None

