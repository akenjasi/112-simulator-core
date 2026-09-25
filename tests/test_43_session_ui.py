import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_groups_returns_student_count(auth_client: AsyncClient, db_session):
    """
    Тест проверяет, что эндпоинт получения групп возвращает student_count.
    """
    # 1. Создание группы без курсантов
    create_res = await auth_client.post("/api/v1/groups", json={
        "group_name": "ИБ-22",
        "department": "Информационная безопасность"
    })
    assert create_res.status_code == 200
    group_data = create_res.json()
    group_id = group_data["group_id"]
    assert group_data.get("student_count") == 0

    # 2. Проверка списка групп: у пустой группы student_count == 0
    list_res = await auth_client.get("/api/v1/groups")
    assert list_res.status_code == 200
    groups = list_res.json()
    target_group = next((g for g in groups if g["group_id"] == group_id), None)
    assert target_group is not None
    assert "student_count" in target_group
    assert isinstance(target_group["student_count"], int)
    assert target_group["student_count"] == 0

    # 3. Добавление курсанта в группу
    student_res = await auth_client.post(f"/api/v1/groups/{group_id}/students/single", json={
        "first_name": "Алексей",
        "last_name": "Смирнов",
        "email": "smirnov@test.local",
    })
    assert student_res.status_code == 200

    # 4. Проверка списка групп: теперь student_count == 1
    list_res2 = await auth_client.get("/api/v1/groups")
    assert list_res2.status_code == 200
    groups2 = list_res2.json()
    target_group2 = next((g for g in groups2 if g["group_id"] == group_id), None)
    assert target_group2 is not None
    assert target_group2["student_count"] == 1
