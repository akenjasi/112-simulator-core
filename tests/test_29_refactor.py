import io
import pytest
from pydantic import ValidationError

from backend.schemas.domain_01 import (
    StudentCSVRow,
    SingleStudentAddRequest,
    Group as GroupSchema,
    GroupCreate,
    GroupResponse,
    StudentResponse,
)
from backend.models.domain_01 import StudentGroup, User
from backend.core.csv_parser import parse_students_csv, generate_csv_template
from backend.core.security import verify_password


def test_student_csv_row_and_single_add_schema():
    # 1. With middle_name
    row1 = StudentCSVRow(
        last_name="Иванов",
        first_name="Иван",
        middle_name="Иванович",
        email="ivanov@test.com",
    )
    assert row1.last_name == "Иванов"
    assert row1.first_name == "Иван"
    assert row1.middle_name == "Иванович"
    assert row1.email == "ivanov@test.com"

    # 2. Without middle_name
    row2 = StudentCSVRow(
        last_name="Петров",
        first_name="Петр",
        email="petrov@test.com",
    )
    assert row2.middle_name is None

    # 3. SingleStudentAddRequest
    req = SingleStudentAddRequest(
        last_name="Сидоров",
        first_name="Сидор",
        middle_name="Сидорович",
        email="sidorov@test.com",
    )
    assert req.middle_name == "Сидорович"


def test_csv_template_format():
    template = generate_csv_template()
    assert template.strip() == "last_name,first_name,middle_name,email"


def test_parse_students_csv_with_middle_name():
    csv_text = (
        "last_name,first_name,middle_name,email\n"
        "Иванов,Иван,Иванович,ivanov@test.com\n"
        "Петров,Петр,,petrov@test.com\n"
    )
    parsed = parse_students_csv(io.StringIO(csv_text))
    assert len(parsed) == 2
    assert parsed[0].last_name == "Иванов"
    assert parsed[0].first_name == "Иван"
    assert parsed[0].middle_name == "Иванович"
    assert parsed[0].email == "ivanov@test.com"

    assert parsed[1].last_name == "Петров"
    assert parsed[1].first_name == "Петр"
    assert parsed[1].middle_name is None
    assert parsed[1].email == "petrov@test.com"


def test_group_models_and_schemas_no_profile():
    # Schemas must not have profile field
    assert "profile" not in GroupSchema.model_fields
    assert "profile" not in GroupCreate.model_fields
    assert "profile" not in GroupResponse.model_fields

    group_schema = GroupCreate(group_name="Смена 1", department="Отделение связи")
    assert group_schema.group_name == "Смена 1"

    # Model must not have profile column
    group_model = StudentGroup(group_name="Смена 1", department="Отделение связи")
    assert not hasattr(group_model, "profile")
    assert group_model.group_name == "Смена 1"


@pytest.mark.asyncio
async def test_reset_user_password_endpoint(auth_client):
    from backend.database import AsyncSessionLocal
    from sqlalchemy import select

    # 1. Create a cadet
    async with AsyncSessionLocal() as session:
        cadet = User(
            username="reset_pwd_cadet@test.com",
            password_hash="old_hash",
            role="CADET",
            full_name="Тестов Тест Тестович",
        )
        session.add(cadet)
        await session.commit()
        await session.refresh(cadet)
        cadet_id = cadet.user_id

    # 2. Call reset-password
    res = await auth_client.post(f"/api/users/{cadet_id}/reset-password")
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == cadet_id
    assert "new_password" in data
    new_pwd = data["new_password"]
    assert len(new_pwd) == 5
    assert new_pwd.isdigit()

    # 3. Verify in DB
    async with AsyncSessionLocal() as session:
        u = await session.get(User, cadet_id)
        assert u is not None
        assert verify_password(new_pwd, u.password_hash)
        await session.delete(u)
        await session.commit()


@pytest.mark.asyncio
async def test_reset_group_passwords_endpoint(auth_client):
    from backend.database import AsyncSessionLocal

    # 1. Create group and add students
    res_grp = await auth_client.post("/api/admin/groups", json={
        "group_name": "Смена Альфа",
        "department": "Кафедра безопасности",
    })
    assert res_grp.status_code == 200
    group_id = res_grp.json()["group_id"]

    # Add 2 students
    await auth_client.post(f"/api/groups/{group_id}/students/single", json={
        "last_name": "Кузнецов",
        "first_name": "Алексей",
        "middle_name": "Сергеевич",
        "email": "kuznetsov@test.com",
    })
    await auth_client.post(f"/api/groups/{group_id}/students/single", json={
        "last_name": "Попов",
        "first_name": "Дмитрий",
        "middle_name": "Андреевич",
        "email": "popov@test.com",
    })

    # 2. Call reset-passwords for the group
    res_reset = await auth_client.post(f"/api/groups/{group_id}/reset-passwords")
    assert res_reset.status_code == 200
    reset_list = res_reset.json()
    assert isinstance(reset_list, list)
    assert len(reset_list) == 2

    for item in reset_list:
        assert "user_id" in item
        assert "fio" in item
        assert "email" in item
        assert "new_password" in item
        assert len(item["new_password"]) == 5
        assert item["new_password"].isdigit()

    # 3. Cleanup
    async with AsyncSessionLocal() as session:
        grp = await session.get(StudentGroup, group_id)
        if grp:
            await session.delete(grp)
        for item in reset_list:
            u = await session.get(User, item["user_id"])
            if u:
                await session.delete(u)
        await session.commit()
