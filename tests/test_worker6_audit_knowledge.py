import io
import json
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import User, StudentGroup, UserActionLog
from backend.models.domain_03 import Assignment, ExamSession, KnowledgeFile
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult
from backend.core.ai_worker import collect_group_session_data


async def _create_user(role: str, username: str | None = None, full_name: str | None = None) -> tuple[User, dict[str, str]]:
    async with AsyncSessionLocal() as db:
        user = User(
            username=username or f"{role.lower()}_{uuid.uuid4().hex[:8]}@test.local",
            password_hash=hash_password("pass_123"),
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
async def test_knowledge_file_teacher_isolation_and_delete_permissions():
    teacher1, t1_headers = await _create_user("TEACHER")
    teacher2, t2_headers = await _create_user("TEACHER")
    admin, admin_headers = await _create_user("ADMIN")

    async with AsyncClient(app=app, base_url="http://test") as client:
        # Teacher 1 uploads a file
        file_bytes = b"%PDF-1.4 dummy test content"
        files = {"file": ("manual_1.pdf", io.BytesIO(file_bytes), "application/pdf")}
        res_upload = await client.post("/api/v1/knowledge/files", headers=t1_headers, files=files)
        assert res_upload.status_code == 201, res_upload.text
        file_data = res_upload.json()
        file_id = file_data["id"]
        assert file_data["uploaded_by"] == teacher1.user_id

        # Teacher 2 tries to delete Teacher 1's file -> 403 Forbidden
        res_del_t2 = await client.delete(f"/api/v1/knowledge/files/{file_id}", headers=t2_headers)
        assert res_del_t2.status_code == 403
        assert "запрещено" in res_del_t2.json()["detail"]

        # Admin cannot delete educational materials (403 Forbidden per security policy)
        res_del_admin = await client.delete(f"/api/v1/knowledge/files/{file_id}", headers=admin_headers)
        assert res_del_admin.status_code == 403

        # Teacher 1 (owner) can delete their own file -> 200 OK
        res_del_owner = await client.delete(f"/api/v1/knowledge/files/{file_id}", headers=t1_headers)
        assert res_del_owner.status_code == 200


@pytest.mark.asyncio
async def test_session_grade_override_with_user_action_log_audit():
    teacher, t_headers = await _create_user("TEACHER")
    other_teacher, ot_headers = await _create_user("TEACHER")
    cadet, _ = await _create_user("CADET")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(group_name=f"grp-{uuid.uuid4().hex[:6]}", teacher_id=teacher.user_id)
        db.add(group)
        await db.flush()

        lesson = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="DISPATCHER_DDS",
            session_type="CARD_ACTIONS",
            status="COMPLETED",
        )
        db.add(lesson)
        await db.flush()

        session = ExamSession(
            assignment_id=lesson.assignment_id,
            cadet_id=cadet.user_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
            dynamic_state={"dds": {"score": 50.0}},
        )
        db.add(session)
        await db.flush()

        card = IncidentCard(
            session_id=session.session_id,
            operator_id=cadet.user_id,
            card_origin="DDS",
            status="completed",
        )
        db.add(card)
        await db.flush()

        evaluation = EvaluationResult(
            card_id=card.card_id,
            session_id=session.session_id,
            scores={"final_score": 50.0, "total": 50.0},
        )
        db.add(evaluation)
        await db.commit()
        session_id = session.session_id

    async with AsyncClient(app=app, base_url="http://test") as client:
        # Other teacher tries to override grade -> 403 Forbidden
        res_ot = await client.post(
            f"/api/v1/analytics/sessions/{session_id}/grade-override",
            headers=ot_headers,
            json={"score": 85.0, "reason": "Пересмотр"},
        )
        assert res_ot.status_code == 403

        # Owning teacher overrides grade -> 200 OK
        res_t = await client.post(
            f"/api/v1/analytics/sessions/{session_id}/grade-override",
            headers=t_headers,
            json={"score": 92.5, "reason": "Учтена сложность дорожной обстановки", "comment": "Отличная работа"},
        )
        assert res_t.status_code == 200, res_t.text
        data = res_t.json()
        assert data["old_score"] == 50.0
        assert data["new_score"] == 92.5
        assert data["reason"] == "Учтена сложность дорожной обстановки"

    # Verify audit record in UserActionLog
    async with AsyncSessionLocal() as db:
        stmt_log = select(UserActionLog).where(
            UserActionLog.action == "GRADE_OVERRIDE",
            UserActionLog.target_id == session_id,
        )
        log_entry = (await db.execute(stmt_log)).scalar_one_or_none()
        assert log_entry is not None
        assert log_entry.user_id == teacher.user_id
        details = json.loads(log_entry.details)
        assert details["old_score"] == 50.0
        assert details["new_score"] == 92.5
        assert details["reason"] == "Учтена сложность дорожной обстановки"


@pytest.mark.asyncio
async def test_ai_group_recommendations_honest_data_no_cross_group_leak():
    teacher, _ = await _create_user("TEACHER")
    cadet1, _ = await _create_user("CADET")
    other_cadet, _ = await _create_user("CADET")

    async with AsyncSessionLocal() as db:
        group = StudentGroup(
            group_name=f"grp-empty-{uuid.uuid4().hex[:6]}",
            teacher_id=teacher.user_id,
            cadet_ids=[cadet1.user_id],
        )
        db.add(group)

        # Other cadet has an error in a foreign group
        other_session = ExamSession(
            cadet_id=other_cadet.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
        )
        db.add(other_session)
        await db.flush()

        foreign_tr = TicketResult(
            session_id=other_session.session_id,
            is_passed=False,
            error_details=["Foreign group catastrophic error"],
        )
        db.add(foreign_tr)
        await db.commit()

        # Group data collection for empty group
        data = await collect_group_session_data(group.group_id, db)
        assert data["cadet_count"] == 1
        assert data["total_sessions"] == 0
        assert data["evaluation_count"] == 0
        assert data["sample_errors"] == []
        # Foreign errors must NOT leak into this group!
        assert "Foreign group catastrophic error" not in str(data["sample_errors"])
