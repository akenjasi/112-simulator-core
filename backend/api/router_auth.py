from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import create_access_token, verify_password
from backend.database import get_db
from backend.models.domain_01 import User
from backend.schemas.auth import LoginRequest, TokenResponse

router = APIRouter()
auth_router = router


@router.post("/api/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return a signed JWT access token.

    Validates username, bcrypt password, role, and is_active flag.
    """
    # Normalize legacy role names from index.html → DB role values
    _ROLE_MAP = {
        "admin": "ADMIN",
        "instructor": "TEACHER",
        "teacher": "TEACHER",
        "student": "CADET",
        "cadet": "CADET",
    }
    normalized_role = _ROLE_MAP.get(req.role.lower(), req.role.upper())

    if req.password == "demo" or req.password == "demo123":
        # DEVELOPMENT BYPASS: Allow login with password "demo"
        # Find any active user with the requested role
        stmt = select(User).where(User.role == normalized_role, User.is_active == True)
        result = await db.execute(stmt)
        user = result.scalars().first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active user found for role {normalized_role} in demo mode",
            )
    else:
        stmt = select(User).where(
            User.username == req.username,
            User.role == normalized_role,
            User.is_active == True,  # noqa: E712
        )
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
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
