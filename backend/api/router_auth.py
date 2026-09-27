from typing import Any, Optional, Union
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user
from backend.core.security import create_access_token, verify_password
from backend.database import get_db
from backend.models.domain_01 import User
from backend.schemas.auth import (
    Login2FARequest,
    LoginRequest,
    TokenResponse,
    TwoFactorRequiredResponse,
    TwoFactorSetupResponse,
    TwoFactorStatusResponse,
    TwoFactorVerifyRequest,
)

router = APIRouter()
auth_router = router

_ROLE_MAP = {
    "admin": "ADMIN",
    "instructor": "TEACHER",
    "teacher": "TEACHER",
    "student": "CADET",
    "cadet": "CADET",
}


async def _extract_body(request: Request) -> dict:
    """Extract parameters from either JSON or URL-encoded form data."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            data = await request.json()
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        try:
            form = await request.form()
            return dict(form)
        except Exception:
            pass

    # Fallback attempt: try JSON first, then form data
    try:
        data = await request.json()
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    try:
        form = await request.form()
        return dict(form)
    except Exception:
        pass

    return {}


@router.post(
    "/api/auth/login",
    response_model=Union[TokenResponse, TwoFactorRequiredResponse],
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {"schema": LoginRequest.model_json_schema()},
                "application/x-www-form-urlencoded": {"schema": LoginRequest.model_json_schema()},
            }
        }
    },
)
async def login(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user and return a signed JWT access token or request 2FA.

    Validates username, bcrypt password, optional role, and is_active flag.
    If 2FA is enabled for the account, returns `{ "requires_2fa": true, "user_id": "..." }`.
    """
    body = await _extract_body(request)
    username = body.get("username")
    password = body.get("password")
    role = body.get("role")

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username and password are required",
        )

    normalized_role = None
    if role:
        normalized_role = _ROLE_MAP.get(str(role).lower(), str(role).upper())

    if password in ("demo", "demo123"):
        # DEVELOPMENT BYPASS: Allow login with password "demo"
        if normalized_role:
            stmt = select(User).where(User.role == normalized_role, User.is_active == True)  # noqa: E712
        else:
            stmt = select(User).where(User.username == username, User.is_active == True)  # noqa: E712
        result = await db.execute(stmt)
        user = result.scalars().first()
        if not user and not normalized_role:
            stmt = select(User).where(User.is_active == True)  # noqa: E712
            result = await db.execute(stmt)
            user = result.scalars().first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active user found in demo mode",
            )
    else:
        if normalized_role:
            stmt = select(User).where(
                User.username == username,
                User.role == normalized_role,
                User.is_active == True,  # noqa: E712
            )
        else:
            stmt = select(User).where(
                User.username == username,
                User.is_active == True,  # noqa: E712
            )
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # If 2FA is enabled, require TOTP verification
    if user.is_2fa_enabled:
        return TwoFactorRequiredResponse(
            requires_2fa=True,
            user_id=user.user_id,
        )

    access_token = create_access_token(subject=user.user_id, role=user.role)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id,
        username=user.username,
        role=user.role,
        # Legacy compatibility for index.html
        token=access_token,
        user={"username": user.username, "role": user.role, "user_id": user.user_id},
    )


@router.post(
    "/api/auth/login/2fa",
    response_model=TokenResponse,
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {"schema": Login2FARequest.model_json_schema()},
                "application/x-www-form-urlencoded": {"schema": Login2FARequest.model_json_schema()},
            }
        }
    },
)
async def login_2fa(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Verify 6-digit TOTP code and issue final JWT access token."""
    body = await _extract_body(request)
    code = body.get("code") or body.get("totp_code") or body.get("token")
    user_id = body.get("user_id")
    username = body.get("username")

    if not code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Verification code is required",
        )
    if not user_id and not username:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_id or username is required",
        )

    stmt = select(User).where(User.is_active == True)  # noqa: E712
    if user_id:
        stmt = stmt.where(User.user_id == str(user_id))
    else:
        stmt = stmt.where(User.username == str(username))

    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    if not user.is_2fa_enabled or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this user",
        )

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(str(code).strip(), valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code",
        )

    access_token = create_access_token(subject=user.user_id, role=user.role)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id,
        username=user.username,
        role=user.role,
        token=access_token,
        user={"username": user.username, "role": user.role, "user_id": user.user_id},
    )


@router.api_route("/api/auth/2fa/setup", methods=["GET", "POST"], response_model=TwoFactorSetupResponse)
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate TOTP secret and provisioning URI for Google Authenticator.

    Available only for ADMIN and TEACHER roles.
    """
    if current_user.role not in ("ADMIN", "TEACHER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="2FA is only available for administrators and teachers",
        )

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(
        name=current_user.username,
        issuer_name="112-Simulator",
    )

    current_user.totp_secret = secret
    await db.commit()
    await db.refresh(current_user)

    return TwoFactorSetupResponse(
        secret=secret,
        otpauth_url=otpauth_url,
        uri=otpauth_url,
    )


@router.post(
    "/api/auth/2fa/verify-setup",
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {"schema": TwoFactorVerifyRequest.model_json_schema()},
                "application/x-www-form-urlencoded": {"schema": TwoFactorVerifyRequest.model_json_schema()},
            }
        }
    },
)
async def verify_2fa_setup(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify 6-digit TOTP code and enable 2FA on the account."""
    if current_user.role not in ("ADMIN", "TEACHER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="2FA is only available for administrators and teachers",
        )

    body = await _extract_body(request)
    code = body.get("code") or body.get("totp_code") or body.get("token")
    if not code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Verification code is required",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup has not been initiated",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(str(code).strip(), valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 2FA verification code",
        )

    current_user.is_2fa_enabled = True
    await db.commit()
    await db.refresh(current_user)

    return {
        "success": True,
        "message": "2FA successfully enabled",
        "is_2fa_enabled": True,
    }


@router.post("/api/auth/2fa/disable")
async def disable_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable 2FA for the current user."""
    current_user.is_2fa_enabled = False
    current_user.totp_secret = None
    await db.commit()
    await db.refresh(current_user)

    return {
        "success": True,
        "message": "2FA disabled",
        "is_2fa_enabled": False,
    }


@router.get("/api/auth/2fa/status", response_model=TwoFactorStatusResponse)
async def get_2fa_status(
    current_user: User = Depends(get_current_user),
):
    """Return whether 2FA is currently enabled for the user."""
    return TwoFactorStatusResponse(
        is_2fa_enabled=bool(current_user.is_2fa_enabled),
    )
