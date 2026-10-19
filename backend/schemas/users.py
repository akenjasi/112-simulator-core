from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class PasswordFields(BaseModel):
    @field_validator("password", check_fields=False)
    @classmethod
    def bcrypt_length(cls, value):
        if value is not None and len(value.encode("utf-8")) > 72:
            raise ValueError("Password must fit within 72 UTF-8 bytes")
        return value


class UserCreate(PasswordFields):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=8)
    role: Literal["ADMIN", "TEACHER", "CADET"]
    full_name: Optional[str] = None
    student_id: Optional[str] = None


class UserUpdate(PasswordFields):
    full_name: Optional[str] = None
    role: Optional[Literal["ADMIN", "TEACHER", "CADET"]] = None
    password: Optional[str] = None
    student_id: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordResetRequest(PasswordFields):
    password: Optional[str] = None
    revoke_sessions: bool = False


class UserResponse(BaseModel):
    user_id: str
    username: str
    role: str
    full_name: Optional[str] = None
    student_id: Optional[str] = None
    is_active: bool = True
    is_2fa_enabled: bool = False

    model_config = {"from_attributes": True}

