import io
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.database import get_db
from backend.models.domain_01 import StudentGroup, User
from backend.schemas.groups import GroupCreate, GroupResponse
from backend.core.csv_parser import parse_students_csv

groups_router = APIRouter(
    prefix="/api/admin/groups",
    tags=["Admin Groups"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
router = groups_router

groups_v1_router = APIRouter(
    prefix="/api/v1/groups",
    tags=["Groups v1"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)


@groups_router.get("", response_model=list[GroupResponse])
@groups_router.get("/", response_model=list[GroupResponse], include_in_schema=False)
@groups_v1_router.get("", response_model=list[GroupResponse])
@groups_v1_router.get("/", response_model=list[GroupResponse], include_in_schema=False)
async def list_groups(db: AsyncSession = Depends(get_db)):
    stmt = select(StudentGroup)
    result = await db.execute(stmt)
    return result.scalars().all()


@groups_router.post("", response_model=GroupResponse)
@groups_router.post("/", response_model=GroupResponse, include_in_schema=False)
@groups_v1_router.post("", response_model=GroupResponse)
@groups_v1_router.post("/", response_model=GroupResponse, include_in_schema=False)
async def create_group(group_in: GroupCreate, db: AsyncSession = Depends(get_db)):
    group = StudentGroup(
        group_name=group_in.group_name,
        department=group_in.department,
        profile=group_in.profile,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@groups_router.post("/{group_id}/students/csv")
@groups_v1_router.post("/{group_id}/students/csv")
async def upload_students_csv(
    group_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(StudentGroup).where(StudentGroup.group_id == group_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")
    try:
        students = parse_students_csv(io.StringIO(text))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cadet_ids = list(group.cadet_ids or [])
    for student in students:
        user_stmt = select(User).where(User.username == student.email)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        if not user:
            user = User(
                username=student.email,
                password_hash="mock_hash",
                role="CADET",
                full_name=f"{student.last_name} {student.first_name}",
                group_ids=[group_id],
            )
            db.add(user)
            await db.flush()
        else:
            current_groups = list(user.group_ids or [])
            if group_id not in current_groups:
                current_groups.append(group_id)
                user.group_ids = current_groups

        if user.user_id not in cadet_ids:
            cadet_ids.append(user.user_id)

    group.cadet_ids = cadet_ids
    await db.commit()
    await db.refresh(group)
    return {
        "message": "Students imported successfully",
        "count": len(students),
        "group_id": group_id,
        "cadet_ids": group.cadet_ids,
    }
