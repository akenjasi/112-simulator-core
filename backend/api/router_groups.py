import io
import random
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.core.security import hash_password
from backend.database import get_db
from backend.models.domain_01 import StudentGroup, User
from backend.schemas.groups import (
    GroupCreate,
    GroupResponse,
    SingleStudentAddRequest,
    StudentResponse,
)
from backend.core.csv_parser import parse_students_csv, generate_csv_template

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

api_groups_router = APIRouter(
    prefix="/api/groups",
    tags=["Groups"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)

students_router = APIRouter(
    prefix="/api/students",
    tags=["Students"],
)

students_v1_router = APIRouter(
    prefix="/api/v1/students",
    tags=["Students v1"],
)


# ─── CSV Template ─────────────────────────────────────────────────────────────
@students_router.get("/csv-template")
@students_v1_router.get("/csv-template")
async def get_csv_template():
    """Returns an empty CSV template with standard headers."""
    content = generate_csv_template()
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="template_students.csv"'},
    )


# ─── All Students (Cadets) ───────────────────────────────────────────────────
@students_router.get("", response_model=list[StudentResponse])
@students_router.get("/", response_model=list[StudentResponse], include_in_schema=False)
@students_v1_router.get("", response_model=list[StudentResponse])
@students_v1_router.get("/", response_model=list[StudentResponse], include_in_schema=False)
async def list_all_students(
    role: Optional[str] = "CADET",
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.groups))
    if role:
        stmt = stmt.where(User.role == role)
    result = await db.execute(stmt)
    cadets = result.scalars().all()
    return [
        StudentResponse(
            user_id=s.user_id,
            id=s.user_id,
            username=s.username,
            email=s.username,
            full_name=s.full_name,
            role=s.role,
            groups=[g.group_name for g in s.groups],
            is_active=s.is_active,
            created_at=s.created_at.isoformat() if s.created_at else None,
        )
        for s in cadets
    ]


# ─── Groups List & Create ─────────────────────────────────────────────────────
@groups_router.get("", response_model=list[GroupResponse])
@groups_router.get("/", response_model=list[GroupResponse], include_in_schema=False)
@groups_v1_router.get("", response_model=list[GroupResponse])
@groups_v1_router.get("/", response_model=list[GroupResponse], include_in_schema=False)
@api_groups_router.get("", response_model=list[GroupResponse])
@api_groups_router.get("/", response_model=list[GroupResponse], include_in_schema=False)
async def list_groups(db: AsyncSession = Depends(get_db)):
    stmt = select(StudentGroup)
    result = await db.execute(stmt)
    return result.scalars().all()


@groups_router.post("", response_model=GroupResponse)
@groups_router.post("/", response_model=GroupResponse, include_in_schema=False)
@groups_v1_router.post("", response_model=GroupResponse)
@groups_v1_router.post("/", response_model=GroupResponse, include_in_schema=False)
@api_groups_router.post("", response_model=GroupResponse)
@api_groups_router.post("/", response_model=GroupResponse, include_in_schema=False)
async def create_group(group_in: GroupCreate, db: AsyncSession = Depends(get_db)):
    group = StudentGroup(
        group_name=group_in.group_name,
        department=group_in.department,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


# ─── Group Students List ──────────────────────────────────────────────────────
@api_groups_router.get("/{group_id}/students", response_model=list[StudentResponse])
@api_groups_router.get("/{group_id}/students/", response_model=list[StudentResponse], include_in_schema=False)
@groups_v1_router.get("/{group_id}/students", response_model=list[StudentResponse])
@groups_v1_router.get("/{group_id}/students/", response_model=list[StudentResponse], include_in_schema=False)
@groups_router.get("/{group_id}/students", response_model=list[StudentResponse])
@groups_router.get("/{group_id}/students/", response_model=list[StudentResponse], include_in_schema=False)
async def get_group_students(
    group_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(StudentGroup)
        .options(selectinload(StudentGroup.students))
        .where(StudentGroup.group_id == group_id)
    )
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    students = list(group.students)
    existing_ids = {s.user_id for s in students}
    missing_ids = [uid for uid in (group.cadet_ids or []) if uid not in existing_ids]
    if missing_ids:
        missing_res = await db.execute(select(User).where(User.user_id.in_(missing_ids)))
        missing_users = missing_res.scalars().all()
        for u in missing_users:
            if u not in group.students:
                group.students.append(u)
            students.append(u)
        await db.commit()

    return [
        StudentResponse(
            user_id=s.user_id,
            id=s.user_id,
            username=s.username,
            email=s.username,
            full_name=s.full_name,
            role=s.role,
            groups=[group.group_name],
            is_active=s.is_active,
            created_at=s.created_at.isoformat() if s.created_at else None,
        )
        for s in students
    ]


# ─── Add Single Student to Group ──────────────────────────────────────────────
@api_groups_router.post("/{group_id}/students/single")
@api_groups_router.post("/{group_id}/students/single/", include_in_schema=False)
@groups_v1_router.post("/{group_id}/students/single")
@groups_v1_router.post("/{group_id}/students/single/", include_in_schema=False)
@groups_router.post("/{group_id}/students/single")
@groups_router.post("/{group_id}/students/single/", include_in_schema=False)
async def add_single_student_to_group(
    group_id: str,
    student_in: SingleStudentAddRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(StudentGroup)
        .options(selectinload(StudentGroup.students))
        .where(StudentGroup.group_id == group_id)
    )
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    target_id = (student_in.user_id or student_in.id or "").strip()
    target_email = (str(student_in.email).strip() if student_in.email else (student_in.username or "").strip())

    user = None
    if target_id:
        user = await db.get(User, target_id)
        if not user:
            user_stmt = select(User).where(User.username == target_id)
            user = (await db.execute(user_stmt)).scalar_one_or_none()

    if not user and target_email:
        user_stmt = select(User).where(User.username == target_email)
        user = (await db.execute(user_stmt)).scalar_one_or_none()

    if not user:
        username = target_email or target_id
        if not username:
            raise HTTPException(status_code=400, detail="Не указан email или ID курсанта")

        full_name_parts = [p for p in [student_in.last_name, student_in.first_name, student_in.middle_name] if p and p.strip()]
        full_name = " ".join(full_name_parts) if full_name_parts else None

        user = User(
            username=username,
            password_hash=hash_password("cadet123"),
            role="CADET",
            full_name=full_name,
            group_ids=[group_id],
        )
        db.add(user)
        await db.flush()

    # Link user to group via M2M relationship
    if user not in group.students:
        group.students.append(user)

    # Sync cadet_ids
    cadet_ids = list(group.cadet_ids or [])
    if user.user_id not in cadet_ids:
        cadet_ids.append(user.user_id)
        group.cadet_ids = cadet_ids

    # Sync user.group_ids
    user_groups = list(user.group_ids or [])
    if group_id not in user_groups:
        user_groups.append(group_id)
        user.group_ids = user_groups

    await db.commit()
    await db.refresh(group)
    await db.refresh(user)

    return {
        "message": "Курсант успешно привязан к группе",
        "group_id": group_id,
        "user_id": user.user_id,
        "id": user.user_id,
        "username": user.username,
        "email": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "students_count": len(group.students),
    }


# ─── Remove Student from Group ────────────────────────────────────────────────
@api_groups_router.delete("/{group_id}/students/{user_id}")
@api_groups_router.delete("/{group_id}/students/{user_id}/", include_in_schema=False)
@groups_v1_router.delete("/{group_id}/students/{user_id}")
@groups_v1_router.delete("/{group_id}/students/{user_id}/", include_in_schema=False)
@groups_router.delete("/{group_id}/students/{user_id}")
@groups_router.delete("/{group_id}/students/{user_id}/", include_in_schema=False)
async def remove_student_from_group(
    group_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(StudentGroup)
        .options(selectinload(StudentGroup.students))
        .where(StudentGroup.group_id == group_id)
    )
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    user = await db.get(User, user_id)
    if not user:
        # Check by username if not found by primary key
        user_stmt = select(User).where(User.username == user_id)
        user = (await db.execute(user_stmt)).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Курсант не найден")

    if user in group.students:
        group.students.remove(user)

    cadet_ids = [uid for uid in (group.cadet_ids or []) if uid != user.user_id]
    group.cadet_ids = cadet_ids

    user_groups = [gid for gid in (user.group_ids or []) if gid != group_id]
    user.group_ids = user_groups

    await db.commit()
    return {"message": "Курсант удален из группы", "group_id": group_id, "user_id": user.user_id}


# ─── Upload Students CSV ──────────────────────────────────────────────────────
@groups_router.post("/{group_id}/students/csv")
@groups_v1_router.post("/{group_id}/students/csv")
@api_groups_router.post("/{group_id}/students/csv")
async def upload_students_csv(
    group_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(StudentGroup)
        .options(selectinload(StudentGroup.students))
        .where(StudentGroup.group_id == group_id)
    )
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
            name_parts = [p for p in [student.last_name, student.first_name, student.middle_name] if p and p.strip()]
            full_name = " ".join(name_parts) if name_parts else None
            user = User(
                username=student.email,
                password_hash=hash_password("cadet123"),
                role="CADET",
                full_name=full_name,
                group_ids=[group_id],
            )
            db.add(user)
            await db.flush()
        else:
            current_groups = list(user.group_ids or [])
            if group_id not in current_groups:
                current_groups.append(group_id)
                user.group_ids = current_groups

        if user not in group.students:
            group.students.append(user)

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


# ─── Reset Group Passwords ────────────────────────────────────────────────────
@api_groups_router.post("/{group_id}/reset-passwords")
@groups_v1_router.post("/{group_id}/reset-passwords")
@groups_router.post("/{group_id}/reset-passwords")
async def reset_group_passwords(
    group_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(StudentGroup)
        .options(selectinload(StudentGroup.students))
        .where(StudentGroup.group_id == group_id)
    )
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    students = list(group.students)
    existing_ids = {s.user_id for s in students}
    missing_ids = [uid for uid in (group.cadet_ids or []) if uid not in existing_ids]
    if missing_ids:
        missing_res = await db.execute(select(User).where(User.user_id.in_(missing_ids)))
        missing_users = missing_res.scalars().all()
        for u in missing_users:
            if u not in group.students:
                group.students.append(u)
            students.append(u)

    results = []
    for student in students:
        new_pin = str(random.randint(10000, 99999))
        student.password_hash = hash_password(new_pin)
        student.password_changed_at = datetime.now(timezone.utc)
        results.append({
            "user_id": student.user_id,
            "fio": student.full_name or student.username,
            "email": student.username,
            "new_password": new_pin,
        })

    await db.commit()
    return results

