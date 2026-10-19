from typing import Any, Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=1024)
    role: Optional[str] = Field(None, max_length=32)


class TwoFactorRequiredResponse(BaseModel):
    requires_2fa: bool = True
    user_id: str
    challenge_token: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    uri: str


class TwoFactorVerifyRequest(BaseModel):
    code: str


class Login2FARequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
    challenge_token: str = Field(min_length=32, max_length=128)
    user_id: Optional[str] = None
    username: Optional[str] = None


class TwoFactorStatusResponse(BaseModel):
    is_2fa_enabled: bool


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

