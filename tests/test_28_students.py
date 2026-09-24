import pytest
from pydantic import BaseModel, EmailStr, ValidationError

# --- Схемы (Expected to be implemented by worker) ---
class SingleStudentAddRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr

class StudentGroupResponse(BaseModel):
    id: int
    group_name: str
    profile: str
    students_count: int

# --- Тесты логики схем ---
def test_single_student_add_schema_valid():
    req = SingleStudentAddRequest(
        first_name="Иван",
        last_name="Иванов",
        email="ivan@test.com"
    )
    assert req.first_name == "Иван"
    assert req.email == "ivan@test.com"

def test_single_student_add_schema_invalid_email():
    with pytest.raises(ValidationError):
        SingleStudentAddRequest(
            first_name="Иван",
            last_name="Иванов",
            email="invalid_email"
        )

# --- Тест генерации шаблона CSV (Pure Function) ---
from backend.core.csv_parser import generate_csv_template


def test_csv_template_generation():
    template = generate_csv_template()
    assert "first_name" in template
    assert "last_name" in template
    assert "middle_name" in template
    assert "email" in template
    assert len(template.strip().split(",")) == 4

# --- Тест бизнес-логики: Связь Многие-ко-Многим (Мокирование) ---
class MockUser:
    def __init__(self, id, email):
        self.id = id
        self.email = email
        self.groups = []

class MockGroup:
    def __init__(self, id, name):
        self.id = id
        self.name = name
        self.students = []

def assign_student_to_group(student: MockUser, group: MockGroup):
    if student not in group.students:
        group.students.append(student)
    if group not in student.groups:
        student.groups.append(group)

def test_many_to_many_logic():
    student1 = MockUser(id=1, email="student1@test.com")
    group_112 = MockGroup(id=10, name="Группа 112")
    group_dds = MockGroup(id=20, name="Группа ДДС")
    
    # Студент зачисляется в первую группу
    assign_student_to_group(student1, group_112)
    assert len(student1.groups) == 1
    assert len(group_112.students) == 1
    
    # Студент зачисляется во вторую группу (история сохраняется, он теперь в двух группах)
    assign_student_to_group(student1, group_dds)
    assert len(student1.groups) == 2
    assert len(group_dds.students) == 1
    
    # Проверка на дубликаты (идемпотентность)
    assign_student_to_group(student1, group_112)
    assert len(student1.groups) == 2 # Количество не должно увеличиться


# --- Интеграционные тесты БД (Many-to-Many через student_group_link) ---
@pytest.mark.asyncio
async def test_db_many_to_many_student_group_relationship():
    from backend.database import AsyncSessionLocal, engine
    from backend.models.base import Base
    from backend.models.domain_01 import User, StudentGroup, ProfileType
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        cadet = User(username="cadet_m2m@test.com", password_hash="hash", role="CADET", full_name="Тест Курсант")
        grp1 = StudentGroup(group_name="Группа 112-Тест", profile=ProfileType.OPERATOR_112)
        grp2 = StudentGroup(group_name="Группа ДДС-Тест", profile=ProfileType.DISPATCHER_DDS)

        session.add_all([cadet, grp1, grp2])
        grp1.students.append(cadet)
        grp2.students.append(cadet)
        await session.commit()

        # Load user with groups
        res_u = await session.execute(
            select(User).options(selectinload(User.groups)).where(User.username == "cadet_m2m@test.com")
        )
        loaded_cadet = res_u.scalar_one()
        assert len(loaded_cadet.groups) == 2
        group_names = {g.group_name for g in loaded_cadet.groups}
        assert "Группа 112-Тест" in group_names
        assert "Группа ДДС-Тест" in group_names

        # Load grp1 with students
        res_g = await session.execute(
            select(StudentGroup).options(selectinload(StudentGroup.students)).where(StudentGroup.group_name == "Группа 112-Тест")
        )
        loaded_grp1 = res_g.scalar_one()
        assert len(loaded_grp1.students) == 1
        assert loaded_grp1.students[0].username == "cadet_m2m@test.com"

        # Cleanup
        await session.delete(loaded_grp1)
        res_g2 = await session.execute(select(StudentGroup).where(StudentGroup.group_name == "Группа ДДС-Тест"))
        loaded_grp2 = res_g2.scalar_one_or_none()
        if loaded_grp2:
            await session.delete(loaded_grp2)
        await session.delete(loaded_cadet)
        await session.commit()


# --- Интеграционные тесты API ---
@pytest.mark.asyncio
async def test_api_students_csv_template(auth_client):
    res = await auth_client.get("/api/students/csv-template")
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("content-type", "")
    lines = res.text.strip().split("\n")
    assert lines[0].strip() == "last_name,first_name,middle_name,email"


@pytest.mark.asyncio
async def test_api_single_student_and_group_students(auth_client):
    from backend.database import AsyncSessionLocal
    from backend.models.domain_01 import StudentGroup, User
    from sqlalchemy import select

    # 1. Create a group
    res_grp = await auth_client.post("/api/admin/groups", json={
        "group_name": "API Группа 112",
        "profile": "OPERATOR_112",
    })
    assert res_grp.status_code == 200
    group_id = res_grp.json()["group_id"]

    # 2. Add single new student by email
    res_add = await auth_client.post(f"/api/groups/{group_id}/students/single", json={
        "first_name": "Сергей",
        "last_name": "Смирнов",
        "email": "smirnov@test.local",
    })
    assert res_add.status_code == 200
    added_data = res_add.json()
    assert added_data["email"] == "smirnov@test.local"
    assert added_data["full_name"] == "Смирнов Сергей"
    user_id = added_data["user_id"]

    # 3. Get group students
    res_list = await auth_client.get(f"/api/groups/{group_id}/students")
    assert res_list.status_code == 200
    students = res_list.json()
    assert any(s["user_id"] == user_id for s in students)

    # 4. Add the same student to a second group (DISPATCHER_DDS)
    res_grp2 = await auth_client.post("/api/admin/groups", json={
        "group_name": "API Группа ДДС",
        "profile": "DISPATCHER_DDS",
    })
    group2_id = res_grp2.json()["group_id"]

    res_add2 = await auth_client.post(f"/api/groups/{group2_id}/students/single", json={
        "user_id": user_id,
    })
    assert res_add2.status_code == 200

    # Verify student is in both groups
    res_list2 = await auth_client.get(f"/api/groups/{group2_id}/students")
    assert any(s["user_id"] == user_id for s in res_list2.json())

    # 5. Remove student from first group
    res_del = await auth_client.delete(f"/api/groups/{group_id}/students/{user_id}")
    assert res_del.status_code == 200

    # Verify student removed from group 1 but still in group 2
    res_list1_after = await auth_client.get(f"/api/groups/{group_id}/students")
    assert not any(s["user_id"] == user_id for s in res_list1_after.json())

    res_list2_after = await auth_client.get(f"/api/groups/{group2_id}/students")
    assert any(s["user_id"] == user_id for s in res_list2_after.json())

    # Cleanup test records
    async with AsyncSessionLocal() as session:
        for gid in [group_id, group2_id]:
            g = await session.get(StudentGroup, gid)
            if g:
                await session.delete(g)
        u = await session.get(User, user_id)
        if u:
            await session.delete(u)
        await session.commit()


