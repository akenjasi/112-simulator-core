"""Independent regression coverage for access checks lost in merge 8af1656.

Owned by the supervising reviewer; the implementation agent must not edit it.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from backend.core.security import create_access_token
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import AuthSession, StudentGroup, User
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import AIGroupAdvice, AIStudentAdvice, Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult


@pytest.fixture
async def security_data(monkeypatch):
    tag = uuid.uuid4().hex
    async with AsyncSessionLocal() as db:
        users = {
            role: User(username=f"merge_{role}_{tag}", role=role,
                       password_hash="unused", is_active=True)
            for role in ("ADMIN", "TEACHER", "CADET", "STUDENT")
        }
        db.add_all(users.values())
        await db.flush()
        group = StudentGroup(group_name=f"merge_group_{tag}", teacher_id=users["TEACHER"].user_id)
        db.add(group)
        await db.flush()
        student_advice = AIStudentAdvice(cadet_id=users["CADET"].user_id, analysis_text="PRIVATE_STUDENT")
        group_advice = AIGroupAdvice(group_id=group.group_id, analysis_text="PRIVATE_GROUP")
        now = datetime.now(timezone.utc)
        revoked_id = str(uuid.uuid4())
        db.add_all([student_advice, group_advice, AuthSession(
            session_id=revoked_id, user_id=users["CADET"].user_id,
            expires_at=now + timedelta(hours=1), revoked_at=now,
        )])
        await db.commit()
        headers = {role: {"Authorization": "Bearer " + create_access_token(user.user_id, role)}
                   for role, user in users.items()}
        headers.update({
            "anonymous": {},
            "invalid": {"Authorization": "Bearer invalid"},
            "expired": {"Authorization": "Bearer " + create_access_token(
                users["CADET"].user_id, "CADET", expires_delta=timedelta(seconds=-30))},
            "revoked": {"Authorization": "Bearer " + create_access_token(
                users["CADET"].user_id, "CADET", token_id=revoked_id)},
        })
        data = dict(headers=headers, cadet_id=users["CADET"].user_id, group_id=group.group_id,
                    student_advice_id=student_advice.advice_id, group_advice_id=group_advice.advice_id)
    enqueue = AsyncMock(return_value="merge-security-test-job")
    monkeypatch.setattr("backend.api.router_ai_analytics.ai_worker.start", Mock())
    monkeypatch.setattr("backend.api.router_ai_analytics.ai_worker.enqueue", enqueue)
    data["enqueue"] = enqueue
    return data


async def demo_row_counts():
    async with AsyncSessionLocal() as db:
        return tuple([await db.scalar(select(func.count()).select_from(model))
                      for model in (ScenarioTicket, Assignment, ExamSession, TicketResult, IncidentCard)])


@pytest.mark.parametrize("path", ["/api/v1/sessions/demo", "/api/v2/sessions/demo"])
@pytest.mark.parametrize("target", ["DISPATCHER_DDS", "OPERATOR_112"])
@pytest.mark.parametrize("credentials", ["anonymous", "invalid", "expired", "revoked"])
async def test_demo_requires_valid_auth_without_creating_rows(security_data, path, target, credentials):
    before = await demo_row_counts()
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(path, headers=security_data["headers"][credentials],
                                     json={"target_role": target})
    after = await demo_row_counts()
    assert (response.status_code, after) == (401, before), response.text


@pytest.mark.parametrize("path", ["/api/v1/sessions/demo", "/api/v2/sessions/demo"])
@pytest.mark.parametrize("target", ["DISPATCHER_DDS", "OPERATOR_112"])
@pytest.mark.parametrize("role", ["ADMIN", "TEACHER", "CADET", "STUDENT"])
async def test_demo_role_matrix_preserves_existing_exceptions(security_data, path, target, role):
    allowed = (target == "DISPATCHER_DDS" and role in ("TEACHER", "CADET")) or (
        target == "OPERATOR_112" and role == "ADMIN" and path == "/api/v1/sessions/demo")
    before = await demo_row_counts()
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(path, headers=security_data["headers"][role],
                                     json={"target_role": target})
    assert response.status_code == (200 if allowed else 403), response.text
    after = await demo_row_counts()
    if allowed:
        assert response.json()["role"] == target
        assert after == tuple(value + (0 if index == 4 and target == "OPERATOR_112" else 1)
                              for index, value in enumerate(before))
    else:
        assert after == before


LEGACY_AI_ROUTES = [
    ("GET", "/info"),
    ("GET", "/trigger"),
    ("POST", "/trigger"),
    ("GET", "/student/{cadet_id}"),
    ("GET", "/group/{group_id}"),
    ("PATCH", "/advice/{student_advice_id}/read"),
    ("PATCH", "/student/advice/{student_advice_id}/read"),
    ("PATCH", "/group/advice/{group_advice_id}/read"),
    ("POST", "/student/{student_advice_id}/refine"),
]


@pytest.mark.parametrize("method,suffix", LEGACY_AI_ROUTES)
@pytest.mark.parametrize("credentials", ["ADMIN", "STUDENT", "anonymous", "invalid"])
async def test_legacy_ai_rejects_forbidden_roles_and_invalid_auth(security_data, method, suffix, credentials):
    url = "/api/ai-analytics" + suffix.format(**security_data)
    body = {"cadet_id": security_data["cadet_id"], "background": True, "correction_comment": "must not change"}
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.request(method, url, headers=security_data["headers"][credentials], json=body)
    security_data["enqueue"].assert_not_called()
    async with AsyncSessionLocal() as db:
        student = await db.get(AIStudentAdvice, security_data["student_advice_id"])
        group = await db.get(AIGroupAdvice, security_data["group_advice_id"])
        assert (student.analysis_text, student.is_read, group.is_read) == ("PRIVATE_STUDENT", False, False)
    assert response.status_code == (403 if credentials in ("ADMIN", "STUDENT") else 401), response.text


async def test_teacher_and_cadet_keep_legacy_ai_access(security_data):
    async with AsyncClient(app=app, base_url="http://test") as client:
        for role in ("TEACHER", "CADET"):
            headers = security_data["headers"][role]
            assert (await client.get("/api/ai-analytics/info", headers=headers)).status_code == 200
            own = await client.get("/api/ai-analytics/student/" + security_data["cadet_id"], headers=headers)
            assert own.status_code == 200 and own.json()[0]["analysis_text"] == "PRIVATE_STUDENT"
            triggered = await client.post("/api/ai-analytics/trigger", headers=headers,
                                           json={"cadet_id": security_data["cadet_id"], "background": True})
            assert triggered.status_code == 200, triggered.text
        group = await client.get("/api/ai-analytics/group/" + security_data["group_id"],
                                 headers=security_data["headers"]["TEACHER"])
        assert group.status_code == 200 and group.json()[0]["analysis_text"] == "PRIVATE_GROUP"
        read = await client.patch("/api/ai-analytics/advice/" + security_data["student_advice_id"] + "/read",
                                  headers=security_data["headers"]["CADET"])
        assert read.status_code == 200
    assert security_data["enqueue"].await_count == 2
