"""Accounts are independent of membership; teachers can own multiple groups."""

import uuid

import pytest
from httpx import AsyncClient

from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import User
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["CADET", "TEACHER", "ADMIN"])
async def test_admin_creates_account_without_group_or_fake_student_number(auth_client, role):
    response = await auth_client.post("/api/admin/users", json={
        "username": f"account_{uuid.uuid4().hex}",
        "password": "test_pass_123",
        "role": role,
    })
    assert response.status_code == 200, response.text
    assert response.json()["student_id"] is None
    async with AsyncSessionLocal() as db:
        user = await db.get(User, response.json()["user_id"])
        assert user.group_ids == []
        assert user.groups == []


@pytest.mark.asyncio
async def test_student_number_does_not_assign_group(auth_client):
    response = await auth_client.post("/api/admin/users", json={
        "username": f"number_{uuid.uuid4().hex}",
        "password": "test_pass_123",
        "role": "CADET",
        "student_id": "DOC-123",
    })
    assert response.status_code == 200, response.text
    assert response.json()["student_id"] == "DOC-123"
    async with AsyncSessionLocal() as db:
        user = await db.get(User, response.json()["user_id"])
        assert user.groups == []


@pytest.mark.asyncio
async def test_teacher_manages_two_groups_and_links_existing_cadet(auth_client):
    teacher, _, headers = await create_user_and_token("TEACHER")
    _, _, other_headers = await create_user_and_token("TEACHER")
    cadet = await auth_client.post("/api/admin/users", json={
        "username": f"ungrouped_{uuid.uuid4().hex}",
        "password": "test_pass_123",
        "role": "CADET",
    })
    assert cadet.status_code == 200, cadet.text
    cadet_id = cadet.json()["user_id"]
    async with AsyncClient(app=app, base_url="http://test", headers=headers) as client:
        group_ids = set()
        for index in range(2):
            created = await client.post("/api/v1/groups", json={"group_name": f"Поток {index}"})
            assert created.status_code == 200, created.text
            assert created.json()["teacher_id"] == teacher.user_id
            gid = created.json()["group_id"]
            group_ids.add(gid)
            linked = await client.post(f"/api/v1/groups/{gid}/students/link", json={"user_id": cadet_id})
            assert linked.status_code == 200, linked.text
        listed = await client.get("/api/v1/groups")
        assert group_ids <= {g["group_id"] for g in listed.json()}
        for gid in group_ids:
            students = await client.get(f"/api/v1/groups/{gid}/students")
            assert cadet_id in {s["user_id"] for s in students.json()}
    async with AsyncClient(app=app, base_url="http://test", headers=other_headers) as client:
        listed = await client.get("/api/v1/groups")
        assert group_ids.isdisjoint({g["group_id"] for g in listed.json()})
        denied = await client.get(f"/api/v1/groups/{next(iter(group_ids))}/students")
        assert denied.status_code == 403
