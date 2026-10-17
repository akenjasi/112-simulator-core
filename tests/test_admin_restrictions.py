import uuid

import pytest
from httpx import AsyncClient

from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import SecurityPolicy, StudentGroup, User, UserActionLog, student_group_link
from sqlalchemy import insert, select
from backend.models.domain_02 import GeneratedTicket
from backend.models.domain_03 import KnowledgeFile


async def _create_user(role: str, username: str | None = None) -> tuple[User, dict[str, str]]:
    async with AsyncSessionLocal() as db:
        user = User(
            username=username or f"{role.lower()}_{uuid.uuid4().hex}",
            password_hash=hash_password("test_password_123"),
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_access_token(subject=user.user_id, role=user.role)
        return user, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_cannot_mutate_scenarios_lessons_sessions_or_grades():
    _, admin_headers = await _create_user("ADMIN")

    async with AsyncClient(app=app, base_url="http://test") as client:
        responses = [
            await client.post(
                "/api/admin/scenarios",
                headers=admin_headers,
                json={"settings": {}},
            ),
            await client.post(
                "/api/admin/assignments",
                headers=admin_headers,
                json={
                    "scenario_id": "scenario-test",
                    "session_type": "CALL_SIMULATION",
                    "assigned_by": "admin",
                },
            ),
            await client.post(
                "/api/v1/lessons",
                headers=admin_headers,
                json={"group_id": "group-test", "target_role": "DISPATCHER_DDS"},
            ),
            await client.patch(
                "/api/analytics/records/result-test/appeal",
                headers=admin_headers,
                json={"status": "passed", "comment": "admin must not change grades"},
            ),
            await client.post(
                "/api/v2/sessions/demo-session/message",
                headers=admin_headers,
                json={"message": "admin must not join the lesson"},
            ),
        ]

    assert [response.status_code for response in responses] == [403, 403, 403, 403, 403]


@pytest.mark.asyncio
async def test_admin_and_anonymous_users_cannot_modify_or_delete_learning_materials():
    _, admin_headers = await _create_user("ADMIN")

    async with AsyncClient(app=app, base_url="http://test") as client:
        admin_ticket_update = await client.patch(
            "/api/tickets/ticket-test",
            headers=admin_headers,
            json={"plot": "admin must not edit tickets"},
        )
        admin_ticket_delete = await client.delete(
            "/api/tickets/ticket-test",
            headers=admin_headers,
        )
        admin_knowledge_delete = await client.delete(
            "/api/v1/knowledge/files/file-test",
            headers=admin_headers,
        )
        anonymous_ticket_delete = await client.delete("/api/tickets/ticket-test")
        anonymous_knowledge_delete = await client.delete(
            "/api/v1/knowledge/files/file-test"
        )

    assert admin_ticket_update.status_code == 403
    assert admin_ticket_delete.status_code == 403
    assert admin_knowledge_delete.status_code == 403
    assert anonymous_ticket_delete.status_code == 401
    assert anonymous_knowledge_delete.status_code == 401


@pytest.mark.asyncio
async def test_only_admin_can_change_known_security_policies_with_valid_values(monkeypatch):
    admin, admin_headers = await _create_user("ADMIN")
    monkeypatch.setenv("SECURITY_POLICY_ADMIN_USERNAMES", admin.username)
    _, teacher_headers = await _create_user("TEACHER")

    async with AsyncClient(app=app, base_url="http://test") as client:
        teacher_response = await client.put(
            "/api/admin/security-policies",
            headers=teacher_headers,
            json={"policies": [{"key": "SESSION_TIMEOUT_MINUTES", "value": "30"}]},
        )
        unknown_policy = await client.put(
            "/api/admin/security-policies",
            headers=admin_headers,
            json={"policies": [{"key": "UNREVIEWED_ROOT_SWITCH", "value": "true"}]},
        )
        invalid_password_policy = await client.put(
            "/api/admin/security-policies",
            headers=admin_headers,
            json={"policies": [{"key": "MIN_PASSWORD_LENGTH", "value": "2"}]},
        )
        valid_policy = await client.put(
            "/api/admin/security-policies",
            headers=admin_headers,
            json={"policies": [{"key": "SESSION_TIMEOUT_MINUTES", "value": "30"}]},
        )

    assert teacher_response.status_code == 403
    assert unknown_policy.status_code == 400
    assert invalid_password_policy.status_code == 400
    assert valid_policy.status_code == 200


@pytest.mark.asyncio
async def test_teacher_user_listing_is_limited_to_cadets_in_owned_groups():
    teacher, teacher_headers = await _create_user("TEACHER")
    other_teacher, _ = await _create_user("TEACHER")
    assigned_cadet, _ = await _create_user("CADET")
    unassigned_cadet, _ = await _create_user("CADET")
    admin, _ = await _create_user("ADMIN")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"owned-{uuid.uuid4().hex}",
            teacher_id=teacher.user_id,
            cadet_ids=[assigned_cadet.user_id],
        )
        db.add(group)
        await db.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/users", headers=teacher_headers)

    assert response.status_code == 200
    returned_ids = {item["user_id"] for item in response.json()}
    assert assigned_cadet.user_id in returned_ids
    assert unassigned_cadet.user_id not in returned_ids
    assert other_teacher.user_id not in returned_ids
    assert admin.user_id not in returned_ids
    for item in response.json():
        assert "password_hash" not in item
        assert "totp_secret" not in item
        assert "failed_login_attempts" not in item
        assert "locked_until" not in item


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", [
    ("POST", "/api/v1/lessons/missing/start"),
    ("POST", "/api/v1/lessons/missing/stop"),
    ("PATCH", "/api/v1/lessons/missing/notes"),
    ("POST", "/api/v1/sessions"),
    ("POST", "/api/v1/sessions/demo"),
    ("POST", "/api/v1/sessions/missing/evaluate"),
    ("PATCH", "/api/v2/ticket-results/missing/appeal"),
    ("PATCH", "/api/v2/tickets/missing/appeal"),
    ("POST", "/api/v1/call/process_turn"),
    ("POST", "/api/dds/action"),
    ("POST", "/api/v1/scenario/compile_ticket"),
    ("POST", "/api/v2/telephony/start_call"),
    ("POST", "/api/v2/telephony/hangup"),
    ("POST", "/api/v2/telephony/play_audio"),
    ("POST", "/api/tickets/generate"),
    ("POST", "/api/tickets/import/upload"),
    ("POST", "/api/tickets/missing/refine"),
    ("POST", "/api/v1/knowledge/files"),
    ("GET", "/api/v1/lessons"),
    ("GET", "/api/v1/lessons/missing"),
    ("GET", "/api/v2/sessions/missing"),
    ("GET", "/api/analytics/records/missing"),
    ("GET", "/api/v1/analytics/sessions/missing"),
    ("GET", "/api/analytics/leaderboard"),
    ("POST", "/api/reports/generate"),
    ("GET", "/api/ai-analytics/student/missing"),
])
async def test_admin_cannot_bypass_educational_restrictions(method, path):
    _, headers = await _create_user("ADMIN")
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.request(method, path, headers=headers, json={})
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_security_permissions_partial_update_and_audit(monkeypatch):
    owner, owner_headers = await _create_user("ADMIN")
    _, ordinary_headers = await _create_user("ADMIN")
    monkeypatch.setenv("SECURITY_POLICY_ADMIN_USERNAMES", owner.username)
    async with AsyncClient(app=app, base_url="http://test") as client:
        denied = await client.put("/api/admin/security-policies", headers=ordinary_headers,
                                  json={"policies": [{"key": "MIN_PASSWORD_LENGTH", "value": "10"}]})
        feature = await client.put("/api/admin/security-policies", headers=ordinary_headers,
                                   json={"policies": [{"key": "ENABLE_OPERATOR_112_FOR_LESSONS", "value": "true"}]})
        saved = await client.put("/api/admin/security-policies", headers=owner_headers,
                                 json={"policies": [{"key": "MIN_PASSWORD_LENGTH", "value": "10"}]})
        invalid_batch = await client.put("/api/admin/security-policies", headers=owner_headers,
                                         json={"policies": [{"key": "MIN_PASSWORD_LENGTH", "value": "12"},
                                                            {"key": "REQUIRE_2FA_ALL", "value": "maybe"}]})
    assert denied.status_code == 403
    assert feature.status_code == saved.status_code == 200
    assert invalid_batch.status_code == 400
    async with AsyncSessionLocal() as db:
        assert (await db.get(SecurityPolicy, "MIN_PASSWORD_LENGTH")).value == "10"
        logs = (await db.execute(select(UserActionLog).where(
            UserActionLog.user_id == owner.user_id,
            UserActionLog.action == "SECURITY_POLICY_UPDATED",
        ))).scalars().all()
        assert logs


@pytest.mark.asyncio
async def test_teacher_lists_linked_students_and_admin_retains_account_management():
    teacher, headers = await _create_user("TEACHER")
    student, _ = await _create_user("STUDENT")
    admin, admin_headers = await _create_user("ADMIN")
    async with AsyncSessionLocal() as db:
        group = StudentGroup(group_name="linked students", teacher_id=teacher.user_id)
        db.add(group)
        await db.flush()
        await db.execute(insert(student_group_link).values(user_id=student.user_id, group_id=group.group_id))
        await db.commit()
    async with AsyncClient(app=app, base_url="http://test") as client:
        own = await client.get("/api/users?role=STUDENT", headers=headers)
        legacy = await client.get("/api/v1/students?role=STUDENT", headers=headers)
        anonymous = await client.get("/api/students")
        forbidden_role = await client.get("/api/users?role=ADMIN", headers=headers)
        all_users = await client.get("/api/users", headers=admin_headers)
    assert {user["user_id"] for user in own.json()} == {student.user_id}
    assert {user["user_id"] for user in legacy.json()} == {student.user_id}
    assert anonymous.status_code == 401
    assert forbidden_role.json() == []
    assert admin.user_id in {user["user_id"] for user in all_users.json()}


@pytest.mark.asyncio
async def test_admin_cannot_destroy_materials_and_user_removal_preserves_record():
    _, headers = await _create_user("ADMIN")
    cadet, _ = await _create_user("CADET")
    async with AsyncSessionLocal() as db:
        ticket = GeneratedTicket(id=str(uuid.uuid4()), category="ДТП", complexity=1, plot="Учебный билет")
        file = KnowledgeFile(name="regulations.pdf", file_path="uploads/missing.pdf",
                             size_bytes=100, content_type="application/pdf")
        db.add_all([ticket, file])
        await db.commit()
        ticket_id, file_id = ticket.id, file.file_id
    async with AsyncClient(app=app, base_url="http://test") as client:
        assert (await client.delete(f"/api/tickets/{ticket_id}", headers=headers)).status_code == 403
        assert (await client.delete(f"/api/v1/knowledge/files/{file_id}", headers=headers)).status_code == 403
        assert (await client.delete(f"/api/users/{cadet.user_id}", headers=headers)).status_code == 200
    async with AsyncSessionLocal() as db:
        assert not (await db.get(GeneratedTicket, ticket_id)).is_deleted
        assert await db.get(KnowledgeFile, file_id) is not None
        user = await db.get(User, cadet.user_id)
        assert user is not None and not user.is_active


@pytest.mark.asyncio
async def test_new_teacher_group_has_an_owner_for_directory_access():
    teacher, headers = await _create_user("TEACHER")
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/groups", headers=headers, json={"group_name": "New owned group"})
    assert response.status_code == 200
    async with AsyncSessionLocal() as db:
        group = await db.get(StudentGroup, response.json()["group_id"])
        assert group.teacher_id == teacher.user_id

