from pydantic import BaseModel
from typing import Any


class LoginRequest(BaseModel):
    username: str
    password: str
    role: str


class TokenResponse(BaseModel):
    # Modern JWT fields (for React / new integrations)
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    role: str
    # Legacy compatibility fields (for existing index.html frontend)
    token: str        # = access_token (alias for old frontend)
    user: dict        # {"username": ..., "role": ...}
