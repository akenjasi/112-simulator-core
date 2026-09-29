from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
from backend.models.domain_01 import ProfileType




class GroupCreate(BaseModel):
    model_config = {"extra": "ignore"}

    group_name: str
    department: Optional[str] = None


class GroupResponse(BaseModel):
    model_config = {"from_attributes": True, "extra": "ignore"}

    group_id: str
    group_name: str
    department: Optional[str] = None
    cadet_ids: list[str] = []
    student_count: int = 0


import re

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SingleStudentAddRequest(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    middle_name: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[str] = None
    id: Optional[str] = None
    username: Optional[str] = None




class StudentResponse(BaseModel):
    model_config = {"from_attributes": True, "extra": "ignore"}

    user_id: str
    id: Optional[str] = None
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str = "CADET"
    groups: list[str] = []
    is_active: bool = True
    created_at: Optional[str] = None

