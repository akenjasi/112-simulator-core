from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.database import get_db
from backend.models.domain_01 import StudentGroup
from backend.schemas.groups import GroupCreate, GroupResponse

groups_router = APIRouter(
    prefix="/api/admin/groups",
    tags=["Admin Groups"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
router = groups_router


@groups_router.get("", response_model=list[GroupResponse])
@groups_router.get("/", response_model=list[GroupResponse], include_in_schema=False)
async def list_groups(db: AsyncSession = Depends(get_db)):
    stmt = select(StudentGroup)
    result = await db.execute(stmt)
    return result.scalars().all()


@groups_router.post("", response_model=GroupResponse)
@groups_router.post("/", response_model=GroupResponse, include_in_schema=False)
async def create_group(group_in: GroupCreate, db: AsyncSession = Depends(get_db)):
    group = StudentGroup(
        group_name=group_in.group_name,
        department=group_in.department,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group
