"""JWT + password hashing helpers.

Uses bcrypt directly (passlib 1.7.x is not compatible with bcrypt >= 4.x).
Uses python-jose for JWT signing/verification.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

# ─── Configuration ────────────────────────────────────────────────────────────
SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production-at-least-32-chars!!")
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))


# ─── Password hashing ─────────────────────────────────────────────────────────
def hash_password(plain_password: str) -> str:
    """Hash a plaintext password with bcrypt (cost factor 12)."""
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


# ─── JWT ──────────────────────────────────────────────────────────────────────
def create_access_token(
    subject: str,
    role: str,
    extra: Optional[dict] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token.

    Args:
        subject: user_id string (sub claim).
        role: user role (ADMIN / TEACHER / CADET).
        extra: additional fields to include in payload.
        expires_delta: custom token lifetime.
    """
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict = {
        "sub": subject,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token.

    Returns the payload dict, or None if the token is invalid/expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def check_teacher_user_management(
    current_user_role: str,
    target_user_role: Optional[str] = None,
    new_role: Optional[str] = None,
) -> None:
    """Validate that if current user is TEACHER, they can only operate on CADET accounts.

    Raises HTTP 403 Forbidden if a TEACHER attempts to create, update, or delete
    an ADMIN or TEACHER account, or assign a non-CADET role.
    """
    if current_user_role == "TEACHER":
        if target_user_role is not None and target_user_role != "CADET":
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teachers can only manage CADET accounts",
            )
        if new_role is not None and new_role != "CADET":
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teachers can only manage CADET accounts",
            )

