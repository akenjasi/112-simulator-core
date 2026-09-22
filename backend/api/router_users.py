from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import hash_password
from backend.database import get_db
from backend.models.domain_01 import User
from backend.schemas.users import UserCreate, UserResponse

users_router = APIRouter(prefix="/api/admin/users", tags=["Admin Users"])


@users_router.get("", response_model=list[UserResponse])
@users_router.get("/", response_model=list[UserResponse], include_in_schema=False)
async def get_users(db: AsyncSession = Depends(get_db)):
    stmt = select(User)
    result = await db.execute(stmt)
    return result.scalars().all()


@users_router.post("", response_model=UserResponse)
@users_router.post("/", response_model=UserResponse, include_in_schema=False)
async def create_user(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    user = User(
        username=user_in.username,
        password_hash=hash_password(user_in.password),  # bcrypt hash
        role=user_in.role,
        full_name=user_in.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
