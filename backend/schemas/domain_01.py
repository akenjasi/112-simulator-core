import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator
from backend.models.domain_01 import ProfileType

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class StudentCSVRow(BaseModel):
    first_name: str
    last_name: str
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not EMAIL_REGEX.match(v):
            raise ValueError(f"Invalid email address: {v}")
        return v


class Group(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    group_name: str
    profile: ProfileType
    group_id: Optional[str] = None
    department: Optional[str] = None
    teacher_id: Optional[str] = None
    cadet_ids: list[str] = []
    is_active: bool = True


# Aliases and related group schemas
StudentGroup = Group


class GroupCreate(BaseModel):
    group_name: str
    profile: ProfileType
    department: Optional[str] = None


class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    group_id: str
    group_name: str
    profile: ProfileType
    department: Optional[str] = None
    cadet_ids: list[str] = []
    is_active: bool = True
