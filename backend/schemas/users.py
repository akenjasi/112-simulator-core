from typing import Optional
from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    full_name: Optional[str] = None
    student_id: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    student_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    user_id: str
    username: str
    role: str
    full_name: Optional[str] = None
    student_id: Optional[str] = None
    is_active: bool = True
    is_2fa_enabled: bool = False

    model_config = {"from_attributes": True}

