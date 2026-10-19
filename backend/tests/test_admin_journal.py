import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.models.base import Base
from backend.models.domain_01 import SystemErrorLog, User, UserActionLog


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _create_user(role: str, username: str | None = None) -> tuple[User, dict[str, str]]:
    async with AsyncSessionLocal() as session:
        user = User(
            username=username or f"{role.lower()}_{uuid.uuid4().hex[:8]}",
            password_hash=hash_password("test_pass_123"),
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        token = create_access_token(subject=user.user_id, role=user.role)
        return user, {"Authorization": f"Bearer {token}"}


# ─── 1. Role-based Access Control & Legacy Alias ──────────────────────────────


@pytest.mark.asyncio
async def test_audit_logs_and_error_logs_admin_allowed():
    _, admin_headers = await _create_user("ADMIN")
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res_audit = await ac.get("/api/admin/audit-logs", headers=admin_headers)
        res_error = await ac.get("/api/admin/error-logs", headers=admin_headers)
        res_legacy = await ac.get("/api/admin/audit", headers=admin_headers)

    assert res_audit.status_code == 200
    assert isinstance(res_audit.json(), list)
    assert res_error.status_code == 200
    assert isinstance(res_error.json(), list)
    assert res_legacy.status_code == 200
    assert "logs" in res_legacy.json()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "endpoint",
    ["/api/admin/audit-logs", "/api/admin/error-logs", "/api/admin/audit"],
)
async def test_logs_endpoints_forbidden_for_anonymous_teacher_cadet(endpoint: str):
    # Anonymous -> 401
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res_anon = await ac.get(endpoint)
    assert res_anon.status_code == 401

    # TEACHER -> 403
    _, teacher_headers = await _create_user("TEACHER")
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res_teacher = await ac.get(endpoint, headers=teacher_headers)
    assert res_teacher.status_code == 403

    # CADET -> 403
    _, cadet_headers = await _create_user("CADET")
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res_cadet = await ac.get(endpoint, headers=cadet_headers)
    assert res_cadet.status_code == 403


# ─── 2. Sorting (timestamp DESC, ID DESC) ────────────────────────────────────


@pytest.mark.asyncio
async def test_audit_logs_deterministic_sorting():
    _, admin_headers = await _create_user("ADMIN")
    base_time = datetime(2026, 10, 1, 12, 0, 0, tzinfo=timezone.utc)

    async with AsyncSessionLocal() as session:
        # Create records: two with different timestamps, two with exact same timestamp
        log1 = UserActionLog(
            log_id="log-001",
            action="FIRST",
            timestamp=base_time - timedelta(minutes=10),
        )
        log2_a = UserActionLog(
            log_id="log-002",
            action="SAME_TIME_A",
            timestamp=base_time,
        )
        log2_b = UserActionLog(
            log_id="log-003",
            action="SAME_TIME_B",
            timestamp=base_time,
        )
        log3 = UserActionLog(
            log_id="log-004",
            action="LATEST",
            timestamp=base_time + timedelta(minutes=10),
        )
        session.add_all([log1, log2_a, log2_b, log3])
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/audit-logs", headers=admin_headers)

    assert res.status_code == 200
    ids = [item["log_id"] for item in res.json()]
    # Expect: log-004 (latest), then log-003, log-002 (ID desc for identical timestamps), then log-001
    assert ids == ["log-004", "log-003", "log-002", "log-001"]


@pytest.mark.asyncio
async def test_error_logs_deterministic_sorting():
    _, admin_headers = await _create_user("ADMIN")
    base_time = datetime(2026, 10, 2, 10, 0, 0, tzinfo=timezone.utc)

    async with AsyncSessionLocal() as session:
        e1 = SystemErrorLog(
            id="err-001",
            error_message="Error 1",
            timestamp=base_time,
        )
        e2 = SystemErrorLog(
            id="err-002",
            error_message="Error 2",
            timestamp=base_time,
        )
        e3 = SystemErrorLog(
            id="err-003",
            error_message="Error 3",
            timestamp=base_time + timedelta(seconds=30),
        )
        session.add_all([e1, e2, e3])
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/error-logs", headers=admin_headers)

    assert res.status_code == 200
    ids = [item["id"] for item in res.json()]
    assert ids == ["err-003", "err-002", "err-001"]


# ─── 3. Filtering by Period and User ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_audit_logs_period_and_user_filters():
    admin, admin_headers = await _create_user("ADMIN")
    user_b, _ = await _create_user("TEACHER", username="teacher_bob")

    t1 = datetime(2026, 10, 10, 10, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 10, 11, 0, 0, tzinfo=timezone.utc)
    t3 = datetime(2026, 10, 10, 12, 0, 0, tzinfo=timezone.utc)

    async with AsyncSessionLocal() as session:
        session.add_all([
            UserActionLog(log_id="l1", user_id=admin.user_id, action="A1", timestamp=t1),
            UserActionLog(log_id="l2", user_id=user_b.user_id, action="A2", timestamp=t2),
            UserActionLog(log_id="l3", user_id=admin.user_id, action="A3", timestamp=t3),
        ])
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Filter: from_at single bound
        res_from = await ac.get(
            f"/api/admin/audit-logs?from_at={t2.isoformat()}",
            headers=admin_headers,
        )
        assert res_from.status_code == 200
        assert [x["log_id"] for x in res_from.json()] == ["l3", "l2"]

        # Filter: to_at single bound
        res_to = await ac.get(
            f"/api/admin/audit-logs?to_at={t2.isoformat()}",
            headers=admin_headers,
        )
        assert res_to.status_code == 200
        assert [x["log_id"] for x in res_to.json()] == ["l2", "l1"]

        # Filter: both bounds (inclusive)
        res_both = await ac.get(
            f"/api/admin/audit-logs?from_at={t1.isoformat()}&to_at={t2.isoformat()}",
            headers=admin_headers,
        )
        assert res_both.status_code == 200
        assert [x["log_id"] for x in res_both.json()] == ["l2", "l1"]

        # Filter: timezone offset equivalent (+03:00 for 11:00 UTC is 14:00+03:00)
        t2_offset = "2026-10-10T14:00:00+03:00"
        res_offset = await ac.get(
            f"/api/admin/audit-logs?from_at={t2_offset}&to_at={t2_offset}",
            headers=admin_headers,
        )
        assert res_offset.status_code == 200
        assert [x["log_id"] for x in res_offset.json()] == ["l2"]

        # Filter: by user_id
        res_user = await ac.get(
            f"/api/admin/audit-logs?user_id={user_b.user_id}",
            headers=admin_headers,
        )
        assert res_user.status_code == 200
        assert [x["log_id"] for x in res_user.json()] == ["l2"]

        # Filter: combined period + user_id
        res_comb = await ac.get(
            f"/api/admin/audit-logs?from_at={t1.isoformat()}&to_at={t2.isoformat()}&user_id={admin.user_id}",
            headers=admin_headers,
        )
        assert res_comb.status_code == 200
        assert [x["log_id"] for x in res_comb.json()] == ["l1"]


@pytest.mark.asyncio
async def test_error_logs_period_filters():
    _, admin_headers = await _create_user("ADMIN")
    t1 = datetime(2026, 10, 5, 8, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 5, 9, 0, 0, tzinfo=timezone.utc)

    async with AsyncSessionLocal() as session:
        session.add_all([
            SystemErrorLog(id="err-1", error_message="msg1", timestamp=t1),
            SystemErrorLog(id="err-2", error_message="msg2", timestamp=t2),
        ])
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get(
            f"/api/admin/error-logs?from_at={t2.isoformat()}",
            headers=admin_headers,
        )
        assert res.status_code == 200
        assert [x["id"] for x in res.json()] == ["err-2"]


# ─── 4. Pagination and Limits ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_audit_logs_pagination():
    _, admin_headers = await _create_user("ADMIN")
    base_time = datetime(2026, 10, 1, 0, 0, 0, tzinfo=timezone.utc)

    async with AsyncSessionLocal() as session:
        logs = [
            UserActionLog(
                log_id=f"page-log-{i:02d}",
                action=f"ACT_{i}",
                timestamp=base_time + timedelta(minutes=i),
            )
            for i in range(5)
        ]
        session.add_all(logs)
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Page 1: limit 2, offset 0 -> newest (ACT_4, ACT_3)
        p1 = await ac.get("/api/admin/audit-logs?limit=2&offset=0", headers=admin_headers)
        assert p1.status_code == 200
        ids_p1 = [x["log_id"] for x in p1.json()]
        assert ids_p1 == ["page-log-04", "page-log-03"]

        # Page 2: limit 2, offset 2 -> (ACT_2, ACT_1)
        p2 = await ac.get("/api/admin/audit-logs?limit=2&offset=2", headers=admin_headers)
        assert p2.status_code == 200
        ids_p2 = [x["log_id"] for x in p2.json()]
        assert ids_p2 == ["page-log-02", "page-log-01"]
        # No duplicates across pages
        assert set(ids_p1).isdisjoint(set(ids_p2))

        # Empty selection: offset beyond total
        p_empty = await ac.get("/api/admin/audit-logs?limit=2&offset=100", headers=admin_headers)
        assert p_empty.status_code == 200
        assert p_empty.json() == []


# ─── 5. Validation and 422 Errors ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_validation_errors_return_422():
    _, admin_headers = await _create_user("ADMIN")

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Invalid date format
        r1 = await ac.get("/api/admin/audit-logs?from_at=invalid-date", headers=admin_headers)
        assert r1.status_code == 422

        # Naive datetime without timezone
        r2 = await ac.get("/api/admin/audit-logs?from_at=2026-10-10T12:00:00", headers=admin_headers)
        assert r2.status_code == 422

        # Inverted period (from_at > to_at)
        from_dt = "2026-10-10T15:00:00Z"
        to_dt = "2026-10-10T10:00:00Z"
        r3 = await ac.get(f"/api/admin/audit-logs?from_at={from_dt}&to_at={to_dt}", headers=admin_headers)
        assert r3.status_code == 422

        # Limit out of bounds (< 1)
        r4 = await ac.get("/api/admin/audit-logs?limit=0", headers=admin_headers)
        assert r4.status_code == 422

        # Limit out of bounds (> 1000)
        r5 = await ac.get("/api/admin/audit-logs?limit=1001", headers=admin_headers)
        assert r5.status_code == 422

        # Offset negative
        r6 = await ac.get("/api/admin/audit-logs?offset=-1", headers=admin_headers)
        assert r6.status_code == 422

        # Error logs also return 422 for inverted period
        r7 = await ac.get(f"/api/admin/error-logs?from_at={from_dt}&to_at={to_dt}", headers=admin_headers)
        assert r7.status_code == 422

        # Legacy /api/admin/audit pagination and validation limits
        leg_r1 = await ac.get("/api/admin/audit?limit=0", headers=admin_headers)
        assert leg_r1.status_code == 422

        leg_r2 = await ac.get("/api/admin/audit?limit=1001", headers=admin_headers)
        assert leg_r2.status_code == 422

        leg_r3 = await ac.get("/api/admin/audit?offset=-1", headers=admin_headers)
        assert leg_r3.status_code == 422

        leg_r4 = await ac.get("/api/admin/audit?from_at=invalid-date", headers=admin_headers)
        assert leg_r4.status_code == 422

        leg_r5 = await ac.get("/api/admin/audit?from_at=2026-10-10T12:00:00", headers=admin_headers)
        assert leg_r5.status_code == 422

        leg_r6 = await ac.get(f"/api/admin/audit?from_at={from_dt}&to_at={to_dt}", headers=admin_headers)
        assert leg_r6.status_code == 422


# ─── 6. Data Integrity, Outer JOIN, and Nullable Fields ───────────────────────


@pytest.mark.asyncio
async def test_safe_outer_join_and_nullable_fields():
    admin, admin_headers = await _create_user("ADMIN", username="admin_master")

    async with AsyncSessionLocal() as session:
        # 1. Log with valid existing user
        log_with_user = UserActionLog(
            log_id="log-user-ok",
            user_id=admin.user_id,
            role="ADMIN",
            action="UPDATE_USER",
            endpoint="/api/admin/users",
            target_entity="users",
            target_id="u123",
            ip_address="127.0.0.1",
            details='{"key": "value"}',
        )
        # 2. Log with non-existent user_id (should NOT be dropped by JOIN!)
        log_missing_user = UserActionLog(
            log_id="log-ghost-user",
            user_id="non-existent-user-uuid",
            role="CADET",
            action="MUTATION",
            details="plain text note, not json",
        )
        # 3. Log with NULL user_id and all nullable fields empty
        log_null_user = UserActionLog(
            log_id="log-null-user",
            user_id=None,
            role=None,
            action="ANON_ACTION",
            endpoint=None,
            target_entity=None,
            target_id=None,
            ip_address=None,
            details=None,
        )
        session.add_all([log_with_user, log_missing_user, log_null_user])
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/audit-logs", headers=admin_headers)

    assert res.status_code == 200
    data = {x["log_id"]: x for x in res.json()}

    # All three must be present
    assert "log-user-ok" in data
    assert "log-ghost-user" in data
    assert "log-null-user" in data

    # User details check
    assert data["log-user-ok"]["username"] == "admin_master"
    assert data["log-user-ok"]["action_type"] == "UPDATE_USER"
    assert data["log-user-ok"]["details"] == '{"key": "value"}'

    # Missing user has username None, preserved
    assert data["log-ghost-user"]["username"] is None
    assert data["log-ghost-user"]["details"] == "plain text note, not json"

    # Null user fields
    assert data["log-null-user"]["user_id"] is None
    assert data["log-null-user"]["username"] is None
    assert data["log-null-user"]["role"] is None
    assert data["log-null-user"]["details"] is None


@pytest.mark.asyncio
async def test_error_logs_schema_and_nullable_traceback():
    _, admin_headers = await _create_user("ADMIN")

    async with AsyncSessionLocal() as session:
        session.add_all([
            SystemErrorLog(id="err-tb", error_message="Fatal crash", traceback="Traceback line 1\nline 2"),
            SystemErrorLog(id="err-no-tb", error_message="Simple warning", traceback=None),
        ])
        await session.commit()

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/error-logs", headers=admin_headers)

    assert res.status_code == 200
    data = {x["id"]: x for x in res.json()}
    assert data["err-tb"]["error_message"] == "Fatal crash"
    assert "Traceback" in data["err-tb"]["traceback"]
    assert data["err-no-tb"]["traceback"] is None
