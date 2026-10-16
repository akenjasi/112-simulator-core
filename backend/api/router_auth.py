from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth_sessions import (
    create_user_session,
    revoke_all_user_sessions,
    revoke_session,
)
from backend.core.deps import bearer_scheme, get_current_user
from backend.core.security import create_access_token, decode_access_token, verify_password
from backend.database import get_db
from backend.models.domain_01 import SecurityPolicy, User, UserActionLog
from backend.core.ldap_adapter import authenticate_ldap
from backend.core.security import hash_password
import os
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

LOCKOUT_FAILURES = 5
LOCKOUT_MINUTES = 15


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _client_ip(request: Request) -> Optional[str]:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else None


def _add_auth_log(
    db: AsyncSession,
    *,
    request: Request,
    action: str,
    user: Optional[User],
    details: Optional[str] = None,
) -> None:
    db.add(
        UserActionLog(
            user_id=user.user_id if user else None,
            role=user.role if user else None,
            action=action,
            endpoint=request.url.path,
            target_entity="auth_session",
            ip_address=_client_ip(request),
            details=details,
        )
    )


async def _session_timeout_minutes(db: AsyncSession) -> int:
    policy = await db.scalar(
        select(SecurityPolicy).where(SecurityPolicy.key == "SESSION_TIMEOUT_MINUTES")
    )
    return int(policy.value) if policy and policy.value.isdigit() else 60


async def _issue_access_token(db: AsyncSession, request: Request, user: User) -> str:
    timeout_mins = await _session_timeout_minutes(db)
    expires_delta = timedelta(minutes=timeout_mins)
    expires_at = datetime.now(timezone.utc) + expires_delta
    session_id = await create_user_session(
        db,
        user_id=user.user_id,
        expires_at=expires_at,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    token = create_access_token(
        subject=user.user_id,
        role=user.role,
        expires_delta=expires_delta,
        token_id=session_id,
    )
    await db.commit()
    return token


def _token_response(user: User, access_token: str) -> TokenResponse:
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id,
        username=user.username,
        role=user.role,
        token=access_token,
        user={"username": user.username, "role": user.role, "user_id": user.user_id},
    )


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

    ldap_success = False
    ldap_enabled = os.getenv("LDAP_ENABLED", "False").lower() in ("true", "1", "yes")
    if ldap_enabled:
        ldap_success = authenticate_ldap(username, password)

    if ldap_success:
        stmt = select(User).where(User.username == username)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            # JIT Provisioning
            default_role = "CADET"
            if normalized_role:
                default_role = normalized_role
            user = User(
                username=username,
                password_hash=hash_password("ldap_provisioned_no_password"),
                role=default_role,
                is_active=True
            )
            db.add(user)
            await db.flush()
    else:
        user = await db.scalar(select(User).where(User.username == username))

        now = datetime.now(timezone.utc)
        if user and user.locked_until and _as_utc(user.locked_until) > now:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account is temporarily locked",
            )

        valid_role = not normalized_role or (user is not None and user.role == normalized_role)
        valid_credentials = bool(
            user
            and user.is_active
            and valid_role
            and verify_password(password, user.password_hash)
        )
        if not valid_credentials:
            if user:
                user.failed_login_attempts += 1
                if user.failed_login_attempts >= LOCKOUT_FAILURES:
                    user.failed_login_attempts = LOCKOUT_FAILURES
                    user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            _add_auth_log(
                db,
                request=request,
                action="LOGIN_FAILED",
                user=user,
                details="Invalid credentials",
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    now = datetime.now(timezone.utc)
    if user.locked_until and _as_utc(user.locked_until) > now:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is temporarily locked",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user.failed_login_attempts = 0
    user.locked_until = None

    # If 2FA is enabled globally or per-user, require TOTP verification
    stmt_2fa = select(SecurityPolicy).where(SecurityPolicy.key == 'REQUIRE_2FA_ALL')
    res_2fa = await db.execute(stmt_2fa)
    policy_2fa = res_2fa.scalar_one_or_none()
    require_2fa_all = policy_2fa and policy_2fa.value.lower() == 'true'

    if user.is_2fa_enabled or require_2fa_all:
        await db.commit()
        return TwoFactorRequiredResponse(
            requires_2fa=True,
            user_id=user.user_id,
        )

    user.last_login = now
    _add_auth_log(db, request=request, action="LOGIN", user=user)
    access_token = await _issue_access_token(db, request, user)
    return _token_response(user, access_token)


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

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.now(timezone.utc)
    _add_auth_log(db, request=request, action="LOGIN", user=user, details="2FA")
    access_token = await _issue_access_token(db, request, user)
    return _token_response(user, access_token)


@router.post("/api/auth/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_access_token(credentials.credentials) if credentials else None
    session_id = payload.get("jti") if payload else None
    if session_id:
        await revoke_session(db, session_id=session_id, user_id=current_user.user_id)
    _add_auth_log(db, request=request, action="LOGOUT", user=current_user)
    await db.commit()
    return {"status": "ok"}


@router.post("/api/auth/logout-all")
async def logout_all(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    revoked_count = await revoke_all_user_sessions(db, user_id=current_user.user_id)
    _add_auth_log(
        db,
        request=request,
        action="LOGOUT",
        user=current_user,
        details=f"Revoked {revoked_count} sessions",
    )
    await db.commit()
    return {"status": "ok", "revoked_sessions": revoked_count}


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
