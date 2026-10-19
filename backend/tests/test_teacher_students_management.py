import io
import uuid
import pytest
from httpx import AsyncClient

from backend.core.security import create_access_token, hash_password, verify_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import StudentGroup, User


async def _create_user(role: str, username: str | None = None, full_name: str | None = None, password: str = "pass_123") -> tuple[User, dict[str, str]]:
    async with AsyncSessionLocal() as db:
        user = User(
            username=username or f"{role.lower()}_{uuid.uuid4().hex[:8]}@test.local",
            password_hash=hash_password(password),
            role=role,
            full_name=full_name or f"Test {role}",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_access_token(subject=user.user_id, role=user.role)
        return user, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_teacher_can_see_all_cadets_including_unassigned():
    teacher, teacher_headers = await _create_user("TEACHER")
    cadet_in_group, _ = await _create_user("CADET")
    cadet_unassigned, _ = await _create_user("CADET")
    student_role_user, _ = await _create_user("STUDENT")
    admin, _ = await _create_user("ADMIN")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
            cadet_ids=[cadet_in_group.user_id],
        )
        db.add(group)
        await db.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get("/api/v1/students", headers=teacher_headers)
        assert res.status_code == 200
        students = res.json()
        ids = {s["user_id"] for s in students}

        # Teacher sees all cadets and students, including unassigned
        assert cadet_in_group.user_id in ids
        assert cadet_unassigned.user_id in ids
        assert student_role_user.user_id in ids
        assert admin.user_id not in ids

        # Verify only safe fields are returned
        for s in students:
            assert "password_hash" not in s
            assert "totp_secret" not in s
            assert "failed_login_attempts" not in s
            assert "locked_until" not in s
            assert "user_id" in s
            assert "username" in s
            assert "role" in s


@pytest.mark.asyncio
async def test_single_student_unknown_user_id_returns_404():
    teacher, teacher_headers = await _create_user("TEACHER")
    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
        )
        db.add(group)
        await db.commit()
        group_id = group.group_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/groups/{group_id}/students/single",
            headers=teacher_headers,
            json={"user_id": "non-existent-user-id"},
        )
        assert res.status_code == 404
        assert "не найден" in res.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_teacher_cannot_create_user_via_single_endpoint():
    teacher, teacher_headers = await _create_user("TEACHER")
    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
        )
        db.add(group)
        await db.commit()
        group_id = group.group_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/groups/{group_id}/students/single",
            headers=teacher_headers,
            json={
                "email": "new_student_who_doesnt_exist@test.local",
                "first_name": "Новый",
                "last_name": "Ученик",
            },
        )
        assert res.status_code == 404


@pytest.mark.asyncio
async def test_link_student_to_group_and_idempotency():
    teacher, teacher_headers = await _create_user("TEACHER")
    cadet, _ = await _create_user("CADET")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
        )
        db.add(group)
        await db.commit()
        group_id = group.group_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        # 1. Link student
        res1 = await client.post(
            f"/api/v1/groups/{group_id}/students/link",
            headers=teacher_headers,
            json={"user_id": cadet.user_id},
        )
        assert res1.status_code == 200

        # 2. Idempotent re-link
        res2 = await client.post(
            f"/api/v1/groups/{group_id}/students/link",
            headers=teacher_headers,
            json={"user_id": cadet.user_id},
        )
        assert res2.status_code == 200

        # 3. Verify in group students
        res_list = await client.get(f"/api/v1/groups/{group_id}/students", headers=teacher_headers)
        assert res_list.status_code == 200
        student_ids = [s["user_id"] for s in res_list.json()]
        assert student_ids.count(cadet.user_id) == 1


@pytest.mark.asyncio
async def test_bulk_link_students():
    teacher, teacher_headers = await _create_user("TEACHER")
    cadet1, _ = await _create_user("CADET")
    cadet2, _ = await _create_user("CADET")
    admin_user, _ = await _create_user("ADMIN")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
            cadet_ids=[cadet1.user_id],
        )
        c1 = await db.get(User, cadet1.user_id)
        group.students.append(c1)
        db.add(group)
        await db.commit()
        group_id = group.group_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/groups/{group_id}/students/bulk-link",
            headers=teacher_headers,
            json={"user_ids": [cadet1.user_id, cadet2.user_id, admin_user.user_id, "unknown-id"]},
        )
        assert res.status_code == 200
        details = res.json()
        assert len(details) == 4

        status_by_id = {d["user_id"]: d["status"] for d in details}
        assert status_by_id[cadet1.user_id] == "already_in_group"
        assert status_by_id[cadet2.user_id] == "success"
        assert status_by_id[admin_user.user_id] == "error"
        assert status_by_id["unknown-id"] == "error"


@pytest.mark.asyncio
async def test_delete_student_from_group_preserves_user_record():
    teacher, teacher_headers = await _create_user("TEACHER")
    cadet, _ = await _create_user("CADET")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
            cadet_ids=[cadet.user_id],
        )
        c_user = await db.get(User, cadet.user_id)
        group.students.append(c_user)
        c_user.group_ids = [group.group_id]
        db.add(group)
        await db.commit()
        group_id = group.group_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        del_res = await client.delete(
            f"/api/v1/groups/{group_id}/students/{cadet.user_id}",
            headers=teacher_headers,
        )
        assert del_res.status_code == 200

    # Verify user still exists in DB and is active
    async with AsyncSessionLocal() as db:
        u = await db.get(User, cadet.user_id)
        assert u is not None
        assert u.is_active is True
        assert group_id not in (u.group_ids or [])
        grp = await db.get(StudentGroup, group_id)
        assert cadet.user_id not in (grp.cadet_ids or [])
        assert all(s.user_id != cadet.user_id for s in grp.students)


@pytest.mark.asyncio
async def test_teacher_forbidden_to_reset_passwords():
    teacher, teacher_headers = await _create_user("TEACHER")
    cadet, _ = await _create_user("CADET")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
            cadet_ids=[cadet.user_id],
        )
        db.add(group)
        await db.commit()
        group_id = group.group_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        # 1. Reset group passwords forbidden for teacher
        res_grp = await client.post(
            f"/api/groups/{group_id}/reset-passwords",
            headers=teacher_headers,
        )
        assert res_grp.status_code == 403

        # 2. Reset single user password forbidden for teacher
        res_user = await client.post(
            f"/api/users/{cadet.user_id}/reset-password",
            headers=teacher_headers,
        )
        assert res_user.status_code == 403
        assert "Преподавателям запрещен сброс паролей учеников" in res_user.json().get("detail", "")


@pytest.mark.asyncio
async def test_csv_upload_does_not_change_existing_user_password():
    teacher, teacher_headers = await _create_user("TEACHER")
    known_password = "my_custom_secret_password"
    existing_cadet, _ = await _create_user(
        "CADET",
        username="existing_student@test.local",
        password=known_password,
    )

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"test-grp-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
        )
        db.add(group)
        await db.commit()
        group_id = group.group_id

    csv_content = "last_name,first_name,middle_name,email\nПетров,Петр,,existing_student@test.local\n"
    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/groups/{group_id}/students/csv",
            headers=teacher_headers,
            files={"file": ("students.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        )
        assert res.status_code == 200

    # Verify password was NOT changed to cadet123
    async with AsyncSessionLocal() as db:
        u = await db.get(User, existing_cadet.user_id)
        assert verify_password(known_password, u.password_hash)
        assert not verify_password("cadet123", u.password_hash)
