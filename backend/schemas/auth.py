from typing import Any, Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str
    role: Optional[str] = None


class TwoFactorRequiredResponse(BaseModel):
    requires_2fa: bool = True
    user_id: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    uri: str


class TwoFactorVerifyRequest(BaseModel):
    code: str


class Login2FARequest(BaseModel):
    code: str
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

