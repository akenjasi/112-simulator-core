"""Focused regressions for student catalog, CSV linking, and stored file paths."""
import io
import uuid

import pytest
from sqlalchemy import select
from httpx import AsyncClient
from sqlalchemy import select

from backend.core.security import create_access_token, hash_password, verify_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import StudentGroup, User
from backend.models.domain_03 import KnowledgeFile


async def _user(role: str, *, active: bool = True):
    async with AsyncSessionLocal() as db:
        user = User(
            username=f"review_{role.lower()}_{uuid.uuid4().hex[:10]}@test.local",
            password_hash=hash_password("original_password"),
            role=role,
            is_active=active,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_access_token(subject=user.user_id, role=role)
        return user, {"Authorization": f"Bearer {token}"}


async def _group(teacher: User):
    async with AsyncSessionLocal() as db:
        group = StudentGroup(group_name=f"review-{uuid.uuid4().hex[:8]}", teacher_id=teacher.user_id)
        db.add(group)
        await db.commit()
        await db.refresh(group)
        return group.group_id


@pytest.mark.asyncio
async def test_student_catalog_is_global_active_only_and_rejects_role_injection():
    _, headers = await _user("TEACHER")
    active, _ = await _user("CADET")
    inactive, _ = await _user("CADET", active=False)
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/students", headers=headers)
        injected = await client.get("/api/v1/students?role=ADMIN", headers=headers)
    assert response.status_code == 200
    ids = {entry["user_id"] for entry in response.json()}
    assert active.user_id in ids
    assert inactive.user_id not in ids
    assert injected.status_code == 200 and injected.json() == []


@pytest.mark.asyncio
async def test_teacher_csv_cannot_create_users_or_link_non_cadets():
    teacher, headers = await _user("TEACHER")
    admin, _ = await _user("ADMIN")
    group_id = await _group(teacher)
    content = f"last_name,first_name,email\nNew,User,new_{uuid.uuid4().hex[:8]}@test.local\n"
    async with AsyncClient(app=app, base_url="http://test") as client:
        missing = await client.post(
            f"/api/v1/groups/{group_id}/students/csv", headers=headers,
            files={"file": ("students.csv", io.BytesIO(content.encode()), "text/csv")},
        )
        wrong_role = await client.post(
            f"/api/v1/groups/{group_id}/students/csv", headers=headers,
            files={"file": ("students.csv", io.BytesIO(
                f"last_name,first_name,email\nAdmin,User,{admin.username}\n".encode()
            ), "text/csv")},
        )
    assert missing.status_code == 404
    assert wrong_role.status_code == 400
    async with AsyncSessionLocal() as db:
        assert await db.get(User, admin.user_id) is not None
        assert (await db.get(StudentGroup, group_id)).cadet_ids in (None, [])


@pytest.mark.asyncio
async def test_admin_single_unknown_email_does_not_create_account():
    admin, headers = await _user("ADMIN")
    group_id = await _group(admin)
    unknown_email = f"unknown_{uuid.uuid4().hex[:10]}@test.local"
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            f"/api/groups/{group_id}/students/single", headers=headers,
            json={"email": unknown_email, "first_name": "New", "last_name": "Cadet"},
        )
    assert response.status_code == 404
    async with AsyncSessionLocal() as db:
        assert (await db.execute(select(User).where(User.username == unknown_email))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_inactive_cadet_cannot_be_linked_to_group():
    teacher, headers = await _user("TEACHER")
    inactive, _ = await _user("CADET", active=False)
    group_id = await _group(teacher)
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/groups/{group_id}/students/link", headers=headers,
            json={"user_id": inactive.user_id},
        )
    assert response.status_code == 404
    async with AsyncSessionLocal() as db:
        group = await db.get(StudentGroup, group_id)
        assert inactive.user_id not in (group.cadet_ids or [])


@pytest.mark.asyncio
async def test_admin_csv_import_preserves_existing_password():
    admin, headers = await _user("ADMIN")
    cadet, _ = await _user("CADET")
    group_id = await _group(admin)
    csv = f"last_name,first_name,email\nExisting,Cadet,{cadet.username}\n"
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            f"/api/admin/groups/{group_id}/students/csv", headers=headers,
            files={"file": ("students.csv", io.BytesIO(csv.encode()), "text/csv")},
        )
    assert response.status_code == 200, response.text
    async with AsyncSessionLocal() as db:
        persisted = await db.get(User, cadet.user_id)
        assert verify_password("original_password", persisted.password_hash)
        assert not verify_password("cadet123", persisted.password_hash)


@pytest.mark.asyncio
async def test_group_read_repairs_legacy_membership_without_exposing_other_roles():
    teacher, headers = await _user("TEACHER")
    cadet, _ = await _user("CADET")
    admin, _ = await _user("ADMIN")
    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"legacy-{uuid.uuid4().hex[:8]}", teacher_id=teacher.user_id,
            cadet_ids=[cadet.user_id, admin.user_id],
        )
        db.add(group)
        await db.commit()
        await db.refresh(group)
        group_id = group.group_id
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(f"/api/v1/groups/{group_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["cadet_ids"] == [cadet.user_id]
    async with AsyncSessionLocal() as db:
        linked = await db.get(User, cadet.user_id)
        normalized = await db.get(StudentGroup, group_id)
        assert group_id in (linked.group_ids or [])
        assert normalized.cadet_ids == [cadet.user_id]


@pytest.mark.asyncio
async def test_knowledge_download_rejects_database_path_traversal():
    teacher, headers = await _user("TEACHER")
    async with AsyncSessionLocal() as db:
        record = KnowledgeFile(
            name="outside.pdf", file_path="../../etc/passwd", size_bytes=1,
            content_type="application/pdf", uploaded_by=teacher.user_id,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        file_id = record.file_id
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(f"/api/v1/knowledge/files/{file_id}/download", headers=headers)
    assert response.status_code == 404
