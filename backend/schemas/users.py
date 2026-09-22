from typing import Optional
from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    user_id: str
    username: str
    role: str
    full_name: Optional[str] = None

    model_config = {"from_attributes": True}
