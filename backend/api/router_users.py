import secrets
import string
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, require_role
from backend.core.auth_sessions import revoke_all_user_sessions
from backend.core.security import check_teacher_user_management, hash_password
from backend.database import get_db
from backend.models.domain_01 import SecurityPolicy, StudentGroup, User, student_group_link
from backend.schemas.users import PasswordResetRequest, UserCreate, UserResponse, UserUpdate

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
async def get_users(
    role: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.upper() == "ADMIN":
        stmt = select(User)
        if role:
            stmt = stmt.where(User.role == role.upper())
        result = await db.execute(stmt)
        return result.scalars().all()

    allowed_roles = {"CADET", "STUDENT"}
    if role and role.upper() not in allowed_roles:
        return []

    groups_stmt = select(StudentGroup).where(StudentGroup.teacher_id == current_user.user_id)
    groups_res = await db.execute(groups_stmt)
    teacher_groups = groups_res.scalars().all()

    group_ids = [g.group_id for g in teacher_groups if g.group_id]
    cadet_ids = set()

    for g in teacher_groups:
        if g.cadet_ids and isinstance(g.cadet_ids, list):
            for cid in g.cadet_ids:
                if isinstance(cid, str):
                    cadet_ids.add(cid)
                elif isinstance(cid, dict) and "user_id" in cid:
                    cadet_ids.add(str(cid["user_id"]))
                elif cid is not None:
                    cadet_ids.add(str(cid))

    if group_ids:
        links_stmt = select(student_group_link.c.user_id).where(
            student_group_link.c.group_id.in_(group_ids)
        )
        links_res = await db.execute(links_stmt)
        for row in links_res.all():
            if row[0]:
                cadet_ids.add(str(row[0]))

    if not cadet_ids:
        return []

    stmt = select(User).where(User.user_id.in_(cadet_ids))
    if role:
        stmt = stmt.where(User.role == role.upper())
    else:
        stmt = stmt.where(User.role.in_(allowed_roles))

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

    security_changed = False

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.student_id is not None:
        user.student_id = user_in.student_id
    if user_in.role is not None:
        security_changed = security_changed or user_in.role != user.role
        user.role = user_in.role

    if user_in.password is not None:
        stmt_policy = select(SecurityPolicy).where(SecurityPolicy.key == 'MIN_PASSWORD_LENGTH')
        res_policy = await db.execute(stmt_policy)
        policy_min = res_policy.scalar_one_or_none()
        min_len = int(policy_min.value) if policy_min and policy_min.value.isdigit() else 8
        if len(user_in.password) < min_len:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Password must be at least {min_len} characters")

    if user_in.password is not None:
        user.password_hash = hash_password(user_in.password)
        user.password_changed_at = datetime.now(timezone.utc)
        user.failed_login_attempts = 0
        user.locked_until = None
    if user_in.is_active is not None:
        security_changed = security_changed or user_in.is_active != user.is_active
        user.is_active = user_in.is_active

    if security_changed:
        await revoke_all_user_sessions(db, user_id=user.user_id)
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
    await revoke_all_user_sessions(db, user_id=user.user_id)
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
    reset_in: Optional[PasswordResetRequest] = None,
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

    policy_min = await db.scalar(
        select(SecurityPolicy).where(SecurityPolicy.key == "MIN_PASSWORD_LENGTH")
    )
    min_len = int(policy_min.value) if policy_min and policy_min.value.isdigit() else 8

    has_custom_password = reset_in is not None and reset_in.password is not None
    requested_password = reset_in.password.strip() if has_custom_password else None
    password_was_generated = not has_custom_password
    if has_custom_password and len(requested_password) < min_len:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {min_len} characters",
        )

    if password_was_generated:
        alphabet = string.ascii_letters + string.digits
        new_password = "".join(
            secrets.choice(alphabet) for _ in range(max(min_len, 12))
        )
    else:
        new_password = requested_password

    user.password_hash = hash_password(new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    user.failed_login_attempts = 0
    user.locked_until = None
    revoke_sessions = bool(reset_in and reset_in.revoke_sessions)
    if revoke_sessions:
        await revoke_all_user_sessions(db, user_id=user.user_id)
    await db.commit()
    await db.refresh(user)

    return {
        "user_id": user.user_id,
        "username": user.username,
        "email": user.username,
        "fio": user.full_name or user.username,
        "new_password": new_password,
        "password_was_generated": password_was_generated,
        "sessions_revoked": revoke_sessions,
        "message": "Пароль успешно сброшен",
    }

