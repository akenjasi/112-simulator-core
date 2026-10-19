"""End-to-end regressions for the independently reproduced audit findings."""
import io
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

import pyotp
import pytest
from httpx import ASGITransport, AsyncClient
from openpyxl import load_workbook
from sqlalchemy import select

from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import AuthChallenge, StudentGroup, User
from backend.models.domain_02 import GeneratedTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard


@pytest.mark.parametrize("route", ["/api/v2/telephony/ws", "/api/v2/asr/stream"])
async def test_sockets_require_first_frame_auth_and_session_ownership(route):
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    owner, _ = await account("CADET")
    _, foreign = await account("CADET")
    session = await saved_session(owner)

    def probe():
        with TestClient(app) as browser:
            for frame in ({"type": "ping"}, {"type": "auth", "token": foreign["Authorization"].split()[1]}):
                with browser.websocket_connect(f"{route}/{session.session_id}") as ws:
                    ws.send_json(frame)
                    with pytest.raises(WebSocketDisconnect) as denied:
                        ws.receive_json()
                    assert denied.value.code == 1008
    await asyncio.to_thread(probe)


async def test_telephony_socket_rechecks_revoked_login_on_each_message():
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    owner, _ = await account("CADET")
    session = await saved_session(owner)
    async with client() as c:
        response = await c.post("/api/auth/login", json={"username": owner.username, "password": "audit-password"})
    token = response.json()["access_token"]

    def probe():
        with TestClient(app) as browser:
            with browser.websocket_connect(f"/api/v2/telephony/ws/{session.session_id}") as ws:
                ws.send_json({"type": "auth", "token": token})
                assert ws.receive_json()["type"] == "CONNECTED"
                ws.send_json({"type": "ping"})
                assert ws.receive_json()["type"] == "pong"
                assert browser.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"}).status_code == 200
                ws.send_json({"type": "ping"})
                with pytest.raises(WebSocketDisconnect) as denied:
                    ws.receive_json()
                assert denied.value.code == 1008
    await asyncio.to_thread(probe)


async def account(role, **extra):
    async with AsyncSessionLocal() as db:
        user = User(username="audit_" + uuid.uuid4().hex + "@example.test", password_hash=hash_password("audit-password"), role=role, **extra)
        db.add(user)
        await db.commit()
    return user, {"Authorization": "Bearer " + create_access_token(user.user_id, role)}


def client(headers=None):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers)


async def saved_session(cadet, teacher=None):
    async with AsyncSessionLocal() as db:
        assignment = Assignment(assigned_by=teacher.user_id if teacher else None, cadet_id=cadet.user_id, status="ACTIVE")
        db.add(assignment)
        await db.flush()
        session = ExamSession(cadet_id=cadet.user_id, assignment_id=assignment.assignment_id, session_type="CALL_SIMULATION", status="ACTIVE")
        db.add(session)
        await db.commit()
    return session


async def test_export_job_is_private_and_partial_custom_metrics_are_rejected(tmp_path, monkeypatch):
    from backend.api import router_reports as reports
    teacher, headers = await account("TEACHER")
    _, other = await account("TEACHER")
    task_id = uuid.uuid4().hex
    report = tmp_path / "private.xlsx"
    report.write_bytes(b"private recorded data")
    reports.TASKS[task_id] = {"owner_id": teacher.user_id, "status": "ready",
                             "created_at": datetime.now(timezone.utc).isoformat(), "excel_path": str(report)}
    try:
        async with client(other) as c:
            assert (await c.get(f"/api/reports/status/{task_id}")).status_code == 404
            assert (await c.get(f"/api/reports/download/{task_id}?format=excel")).status_code == 404
        async with client(headers) as c:
            assert (await c.get(f"/api/reports/download/{task_id}?format=excel")).content == report.read_bytes()
            response = await c.post("/api/reports/generate", json={"custom_records": [
                {"comm_metrics": {"greeting_success": True}, "card_metrics": {"address_correct": True}, "sla_metrics": {"sla_breached_count": 0}}]})
            assert response.status_code == 422
        monkeypatch.setenv("REPORT_DIR", str(tmp_path))
        reports.TASKS[task_id]["created_at"] = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        reports.prune_completed_reports()
        assert task_id not in reports.TASKS and not report.exists()
    finally:
        reports.TASKS.pop(task_id, None)


async def test_ldap_cannot_choose_admin_or_use_shared_local_password(monkeypatch):
    import backend.api.router_auth as auth
    monkeypatch.setenv("LDAP_ENABLED", "true")
    monkeypatch.setattr(auth, "authenticate_ldap", lambda *args: True)
    name = "audit_ldap_" + uuid.uuid4().hex
    async with client() as c:
        response = await c.post("/api/auth/login", json={"username": name, "password": "directory-password", "role": "ADMIN"})
        assert response.status_code == 401
        response = await c.post("/api/auth/login", json={"username": name, "password": "directory-password"})
        assert response.status_code == 200 and response.json()["role"] == "CADET"
        monkeypatch.setattr(auth, "authenticate_ldap", lambda *args: False)
        response = await c.post("/api/auth/login", json={"username": name, "password": "ldap_provisioned_no_password"})
        assert response.status_code == 401


async def test_second_factor_requires_live_single_use_password_challenge():
    user, _ = await account("TEACHER")
    secret = pyotp.random_base32()
    async with AsyncSessionLocal() as db:
        row = await db.get(User, user.user_id)
        row.totp_secret, row.is_2fa_enabled = secret, True
        await db.commit()
    async with client() as c:
        data = {"user_id": user.user_id, "code": pyotp.TOTP(secret).now()}
        assert (await c.post("/api/auth/login/2fa", json=data)).status_code == 401
        first = await c.post("/api/auth/login", json={"username": user.username, "password": "audit-password"})
        assert first.status_code == 200
        data["challenge_token"] = first.json()["challenge_token"]
        assert (await c.post("/api/auth/login/2fa", json=data)).status_code == 200
        assert (await c.post("/api/auth/login/2fa", json=data)).status_code == 401
        assert (await c.get("/api/users/me", headers={"Authorization": "Bearer " + data["challenge_token"]})).status_code == 401


async def test_second_factor_expired_challenge_and_attempt_limit():
    user, _ = await account("ADMIN")
    secret = pyotp.random_base32()
    async with AsyncSessionLocal() as db:
        row = await db.get(User, user.user_id)
        row.totp_secret, row.is_2fa_enabled = secret, True
        await db.commit()
    async with client() as c:
        login = await c.post("/api/auth/login", json={"username": user.username, "password": "audit-password"})
        token = login.json()["challenge_token"]
        import hashlib
        async with AsyncSessionLocal() as db:
            challenge = await db.get(AuthChallenge, hashlib.sha256(token.encode()).hexdigest())
            challenge.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await db.commit()
        assert (await c.post("/api/auth/login/2fa", json={"challenge_token": token, "code": pyotp.TOTP(secret).now()})).status_code == 401
        login = await c.post("/api/auth/login", json={"username": user.username, "password": "audit-password"})
        token = login.json()["challenge_token"]
        valid = {pyotp.TOTP(secret).at(datetime.now(timezone.utc) + timedelta(seconds=n)) for n in (-30, 0, 30)}
        wrong = next(str(i).zfill(6) for i in range(10) if str(i).zfill(6) not in valid)
        for _ in range(5):
            assert (await c.post("/api/auth/login/2fa", json={"challenge_token": token, "code": wrong})).status_code == 401
        assert (await c.post("/api/auth/login/2fa", json={"challenge_token": token, "code": pyotp.TOTP(secret).now()})).status_code == 401


@pytest.mark.parametrize("role", ["ADMIN", "TEACHER"])
async def test_non_cadet_cannot_be_enrolled_or_reset_through_group(role):
    teacher, headers = await account("TEACHER")
    target, _ = await account(role)
    async with AsyncSessionLocal() as db:
        group = StudentGroup(group_name="audit", teacher_id=teacher.user_id)
        db.add(group)
        await db.commit()
    async with client(headers) as c:
        assert (await c.post(f"/api/groups/{group.group_id}/students/single", json={"user_id": target.user_id})).status_code == 403
        csv = f"last_name,first_name,email\nAudit,User,{target.username}\n".encode()
        assert (await c.post(f"/api/groups/{group.group_id}/students/csv", files={"file": ("students.csv", csv, "text/csv")})).status_code in (400, 403)
        # Historical inconsistent JSON membership must not reopen the reset bypass.
        async with AsyncSessionLocal() as db:
            stored = await db.get(StudentGroup, group.group_id)
            stored.cadet_ids = [target.user_id]
            await db.commit()
        assert (await c.post(f"/api/groups/{group.group_id}/reset-passwords")).status_code == 403


async def test_teacher_can_manage_created_cadet_without_password_reset_privilege():
    teacher, headers = await account("TEACHER")
    foreign, _ = await account("CADET")
    async with client(headers) as c:
        for path, method, data in [(f"/api/users/{foreign.user_id}/reset-password", "POST", {}), (f"/api/users/{foreign.user_id}", "PATCH", {"full_name": "changed"}), (f"/api/users/{foreign.user_id}", "DELETE", None)]:
            assert (await c.request(method, path, json=data)).status_code == 403
        created = await c.post("/api/users", json={"username": "created_" + uuid.uuid4().hex, "password": "audit-password", "role": "CADET"})
        assert created.status_code == 200
        own_id = created.json()["user_id"]
        assert (await c.patch(f"/api/users/{own_id}", json={"full_name": "Managed cadet"})).status_code == 200
        assert (await c.post(f"/api/users/{own_id}/reset-password")).status_code == 403
        assert (await c.patch(f"/api/users/{own_id}", json={"password": "replacement-password"})).status_code == 403


@pytest.mark.parametrize("path,data", [
    ("/api/v2/sessions/{sid}/message", {"text": "do not invoke inference"}),
    ("/api/v2/sessions/{sid}/submit_card", {"operator_id": "other", "filled_data": {}, "assigned_services": []}),
    ("/api/v1/call/process_turn", {"operator_text": "do not invoke inference"}),
    ("/api/v2/telephony/start_call", {"ticket_id": "other"}),
])
async def test_foreign_session_mutations_are_denied_before_side_effects(path, data):
    victim, _ = await account("CADET")
    _, headers = await account("CADET")
    session = await saved_session(victim)
    if "{sid}" not in path:
        data = {**data, "session_id": session.session_id}
    async with client(headers) as c:
        assert (await c.post(path.format(sid=session.session_id), json=data)).status_code == 403
    async with AsyncSessionLocal() as db:
        assert (await db.get(ExamSession, session.session_id)).status == "ACTIVE"


@pytest.mark.parametrize("path", ["/api/admin/system_stats", "/api/teacher/analytics", "/api/v2/asr/status", "/api/v2/telephony/status/unknown"])
async def test_sensitive_legacy_reads_require_authentication(path):
    async with client() as c:
        assert (await c.get(path)).status_code == 401


async def test_cadet_catalog_does_not_expose_answers():
    _, headers = await account("CADET")
    async with AsyncSessionLocal() as db:
        ticket = GeneratedTicket(category="audit", ground_truth={"answer": "private"})
        db.add(ticket)
        await db.commit()
    async with client(headers) as c:
        for prefix in ("/api/v1/tickets", "/api/tickets"):
            assert (await c.get(prefix)).status_code == 403
            assert (await c.get(f"{prefix}/{ticket.id}")).status_code == 403


async def test_analytics_scope_excludes_other_teachers_and_missing_is_not_demo():
    teacher, headers = await account("TEACHER")
    foreign_teacher, _ = await account("TEACHER")
    cadet, _ = await account("CADET", created_by_id=teacher.user_id)
    foreign = await saved_session(cadet, foreign_teacher)
    own = await saved_session(cadet, teacher)
    async with client(headers) as c:
        assert (await c.get(f"/api/v1/analytics/sessions/{foreign.session_id}")).status_code == 403
        assert (await c.get("/api/v1/analytics/sessions/missing")).status_code == 404
        result = await c.get(f"/api/v1/analytics/sessions/{own.session_id}")
        assert result.status_code == 200 and result.json()["cadets"][0]["records"] == []
        assert (await c.get("/api/v1/analytics/records/missing")).status_code == 404


def test_spreadsheet_exports_keep_untrusted_values_literal():
    from backend.core.reports_engine import generate_csv_from_data, generate_excel_from_data
    row = {"cadet_name": "=1+1", "ticket_id": "@untrusted", "final_score": 50}
    workbook = load_workbook(io.BytesIO(generate_excel_from_data([row])))
    assert not any(cell.data_type == "f" for cells in workbook.active for cell in cells)
    assert "'=1+1" in generate_csv_from_data([row])


async def test_upload_limit_is_checked_without_reading_the_whole_file():
    from backend.core.limits import read_upload
    from fastapi import HTTPException
    class Upload:
        async def read(self, size):
            assert size == 11
            return b"x" * size
    with pytest.raises(HTTPException) as error:
        await read_upload(Upload(), 10)
    assert error.value.status_code == 413
