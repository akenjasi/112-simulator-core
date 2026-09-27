import random
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, require_role
from backend.core.security import check_teacher_user_management, hash_password
from backend.database import get_db
from backend.models.domain_01 import SecurityPolicy
from sqlalchemy import select
from fastapi import HTTPException, status
from backend.models.domain_01 import User
from backend.schemas.users import UserCreate, UserResponse, UserUpdate

users_router = APIRouter(
    prefix="/api/admin/users",
    tags=["Admin Users"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
router = users_router

api_users_router = APIRouter(
    prefix="/api/users",
    tags=["Users"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)


users_me_router = APIRouter(
    tags=["User Profile"],
)


@users_me_router.get("/api/v1/users/me", response_model=UserResponse)
@users_me_router.get("/api/users/me", response_model=UserResponse, include_in_schema=False)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "CADET":
        if not current_user.full_name:
            current_user.full_name = "Иванов Иван Иванович"
        if not getattr(current_user, "student_id", None):
            current_user.student_id = "СМ1-12"
    return current_user


@users_router.get("", response_model=list[UserResponse])
@users_router.get("/", response_model=list[UserResponse], include_in_schema=False)
@api_users_router.get("", response_model=list[UserResponse])
@api_users_router.get("/", response_model=list[UserResponse], include_in_schema=False)
async def get_users(role: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role.upper())
    result = await db.execute(stmt)
    return result.scalars().all()


@users_router.post("", response_model=UserResponse)
@users_router.post("/", response_model=UserResponse, include_in_schema=False)
@api_users_router.post("", response_model=UserResponse)
@api_users_router.post("/", response_model=UserResponse, include_in_schema=False)
async def create_user(
    user_in: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_teacher_user_management(
        current_user_role=current_user.role,
        target_user_role=user_in.role,
    )

    user = User(
        username=user_in.username,
        password_hash=hash_password(user_in.password),
        role=user_in.role,
        full_name=user_in.full_name or ("Иванов Иван Иванович" if user_in.role == "CADET" else None),
        student_id=user_in.student_id or ("СМ1-12" if user_in.role == "CADET" else None),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@users_router.patch("/{user_id}", response_model=UserResponse)
@users_router.patch("/{user_id}/", response_model=UserResponse, include_in_schema=False)
@api_users_router.patch("/{user_id}", response_model=UserResponse)
@api_users_router.patch("/{user_id}/", response_model=UserResponse, include_in_schema=False)
async def update_user(
    user_id: str,
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    check_teacher_user_management(
        current_user_role=current_user.role,
        target_user_role=user.role,
        new_role=user_in.role,
    )

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.student_id is not None:
        user.student_id = user_in.student_id
    if user_in.role is not None:
        user.role = user_in.role

    if user_in.password:
        stmt_policy = select(SecurityPolicy).where(SecurityPolicy.key == 'MIN_PASSWORD_LENGTH')
        res_policy = await db.execute(stmt_policy)
        policy_min = res_policy.scalar_one_or_none()
        min_len = int(policy_min.value) if policy_min and policy_min.value.isdigit() else 8
        if len(user_in.password) < min_len:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Password must be at least {min_len} characters")

    if user_in.password is not None:
        user.password_hash = hash_password(user_in.password)
    if user_in.is_active is not None:
        user.is_active = user_in.is_active

    await db.commit()
    await db.refresh(user)
    return user


@users_router.delete("/{user_id}")
@users_router.delete("/{user_id}/", include_in_schema=False)
@api_users_router.delete("/{user_id}")
@api_users_router.delete("/{user_id}/", include_in_schema=False)
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    check_teacher_user_management(
        current_user_role=current_user.role,
        target_user_role=user.role,
    )

    # Soft delete: do not drop row to preserve foreign keys
    user.is_active = False
    await db.commit()

    return {"status": "ok", "user_id": user_id, "is_active": False}


@api_users_router.post("/{user_id}/reset-password")
@api_users_router.post("/{user_id}/reset-password/", include_in_schema=False)
@users_router.post("/{user_id}/reset-password")
@users_router.post("/{user_id}/reset-password/", include_in_schema=False)
async def reset_user_password(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = (await db.execute(select(User).where(User.username == user_id))).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )

    check_teacher_user_management(
        current_user_role=current_user.role,
        target_user_role=user.role,
    )

    new_password = str(random.randint(10000, 99999))
    user.password_hash = hash_password(new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    return {
        "user_id": user.user_id,
        "username": user.username,
        "email": user.username,
        "fio": user.full_name or user.username,
        "new_password": new_password,
        "message": "Пароль успешно сброшен",
    }

