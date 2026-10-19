"""P1: independent HTTP acceptance; no imports of the legacy tests/conftest.

Only outbound analysis work is replaced. Authentication, role/ownership checks,
SQL queries, commits and response serialization run through the real application.
"""
import importlib
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from httpx import ASGITransport, AsyncClient


PREFIX = "/api/ai-analytics"
PASSWORD = "acceptance-password-2026"


@pytest.fixture(scope="module")
def runtime(tmp_path_factory):
    # Never change an already imported runtime to point at another database.
    assert "backend.database" not in sys.modules, "Run P1 in its own pytest process"
    root = tmp_path_factory.mktemp("p1-private-db")
    values = {
        "DATABASE_URL": "sqlite+aiosqlite:///" + str(root / "acceptance.sqlite"),
        "SECRET_KEY": uuid.uuid4().hex + uuid.uuid4().hex,
        "TESTING": "false", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
        "LDAP_ENABLED": "false",
    }
    with pytest.MonkeyPatch.context() as mp:
        for key, value in values.items():
            mp.setenv(key, value)
        main = importlib.import_module("backend.main")
        database = importlib.import_module("backend.database")
        d1 = importlib.import_module("backend.models.domain_01")
        d3 = importlib.import_module("backend.models.domain_03")
        security = importlib.import_module("backend.core.security")
        base = importlib.import_module("backend.models.base").Base
        yield SimpleNamespace(app=main.app, db=database, d1=d1, d3=d3, base=base,
                              security=security, password_hash=security.hash_password(PASSWORD))


@pytest.fixture
async def data(runtime, monkeypatch):
    from sqlalchemy import select

    r = runtime
    async with r.db.engine.begin() as connection:
        await connection.run_sync(r.base.metadata.create_all)
    tag = uuid.uuid4().hex
    roles = {"teacher": "TEACHER", "foreign_teacher": "TEACHER", "empty_teacher": "TEACHER",
             "json": "CADET", "linked": "CADET", "both": "CADET", "dict": "CADET",
             "foreign": "CADET", "ownerless": "CADET", "orphan": "CADET",
             "admin": "ADMIN", "student_role": "STUDENT", "inactive": "CADET"}
    async with r.db.AsyncSessionLocal() as db:
        users = {key: r.d1.User(username=f"p1_{key}_{tag}", role=role,
                               password_hash=r.password_hash, is_active=key != "inactive")
                 for key, role in roles.items()}
        db.add_all(users.values())
        await db.flush()
        groups = {
            "own": r.d1.StudentGroup(group_name=f"own_{tag}", teacher_id=users["teacher"].user_id,
                                     cadet_ids=[users["json"].user_id, users["both"].user_id,
                                                {"user_id": users["dict"].user_id}]),
            "foreign": r.d1.StudentGroup(group_name=f"foreign_{tag}", teacher_id=users["foreign_teacher"].user_id,
                                         cadet_ids=[users["foreign"].user_id, users["both"].user_id]),
            "ownerless": r.d1.StudentGroup(group_name=f"ownerless_{tag}", cadet_ids=[users["ownerless"].user_id]),
        }
        groups["own"].students = [users["linked"], users["both"]]
        db.add_all(groups.values())
        await db.flush()
        personal = {key: r.d3.AIStudentAdvice(cadet_id=user.user_id, analysis_text=f"P1_PRIVATE_{key}_{tag}")
                    for key, user in users.items() if user.role in ("CADET", "STUDENT")}
        grouped = {key: r.d3.AIGroupAdvice(group_id=group.group_id, analysis_text=f"P1_GROUP_PRIVATE_{key}_{tag}")
                   for key, group in groups.items()}
        now = datetime.now(timezone.utc)
        headers = {}
        for key, user in users.items():
            sid = uuid.uuid4().hex
            db.add(r.d1.AuthSession(session_id=sid, user_id=user.user_id, expires_at=now + timedelta(hours=1)))
            headers[key] = {"Authorization": "Bearer " + r.security.create_access_token(user.user_id, user.role, token_id=sid)}
        revoked_id = uuid.uuid4().hex
        db.add(r.d1.AuthSession(session_id=revoked_id, user_id=users["json"].user_id,
                               expires_at=now + timedelta(hours=1), revoked_at=now))
        headers.update({
            "anonymous": {}, "invalid": {"Authorization": "Bearer invalid"},
            "expired": {"Authorization": "Bearer " + r.security.create_access_token(
                users["json"].user_id, "CADET", expires_delta=timedelta(seconds=-60))},
            "revoked": {"Authorization": "Bearer " + r.security.create_access_token(users["json"].user_id, "CADET", token_id=revoked_id)},
            "legacy_jwt": {"Authorization": "Bearer " + r.security.create_access_token(users["json"].user_id, "CADET")},
        })
        db.add_all([*personal.values(), *grouped.values()])
        await db.commit()
    router = importlib.import_module("backend.api.router_ai_analytics")
    calls = SimpleNamespace(start=Mock(), enqueue=AsyncMock(return_value="p1-job"),
                            cadet=AsyncMock(return_value=personal["json"]),
                            group=AsyncMock(return_value=grouped["own"]))
    monkeypatch.setattr(router.ai_worker, "start", calls.start)
    monkeypatch.setattr(router.ai_worker, "enqueue", calls.enqueue)
    monkeypatch.setattr(router, "run_cadet_analysis", calls.cadet)
    monkeypatch.setattr(router, "run_group_analysis", calls.group)
    # Refinement's old artificial delay is irrelevant to authorization.
    async_proxy = ModuleType("p1_asyncio_proxy")
    async_proxy.__dict__.update(vars(router.asyncio))
    async_proxy.sleep = AsyncMock()
    monkeypatch.setattr(router, "asyncio", async_proxy)
    return SimpleNamespace(r=r, users=users, groups=groups, personal=personal, grouped=grouped,
                           headers=headers, calls=calls, select=select)


async def request(d, method, suffix, who="teacher", **kwargs):
    async with AsyncClient(transport=ASGITransport(app=d.r.app), base_url="http://test") as client:
        return await client.request(method, PREFIX + suffix, headers=d.headers[who], **kwargs)


async def snapshot(d):
    async with d.r.db.AsyncSessionLocal() as db:
        result = []
        for model in (d.r.d3.AIStudentAdvice, d.r.d3.AIGroupAdvice):
            rows = (await db.scalars(d.select(model))).all()
            result.append(sorted((row.advice_id, row.is_read, row.analysis_text) for row in rows))
        return result


def no_work(d):
    d.calls.start.assert_not_called()
    d.calls.enqueue.assert_not_awaited()
    d.calls.cadet.assert_not_awaited()
    d.calls.group.assert_not_awaited()


def advice_path(d, operation, target):
    if operation == "student_get":
        return "GET", "/student/" + d.users[target].user_id
    if operation == "group_get":
        return "GET", "/group/" + d.groups[target].group_id
    if operation == "refine":
        return "POST", "/student/" + d.personal[target].advice_id + "/refine"
    if operation == "group_read":
        return "PATCH", "/group/advice/" + d.grouped[target].advice_id + "/read"
    model = d.grouped if operation.endswith("group") else d.personal
    alias = "/student/advice/" if operation.startswith("student_alias") else "/advice/"
    return "PATCH", alias + model[target].advice_id + "/read"


FOREIGN_CASES = [
    ("student_get", "foreign"), ("student_get", "ownerless"), ("student_get", "orphan"),
    ("group_get", "foreign"), ("group_get", "ownerless"),
    ("read", "foreign"), ("student_alias", "foreign"),
    ("read_group", "foreign"), ("student_alias_group", "foreign"),
    ("group_read", "foreign"), ("group_read", "ownerless"), ("refine", "foreign"),
]


@pytest.mark.parametrize("operation,target", FOREIGN_CASES)
async def test_teacher_cannot_read_or_mutate_foreign_or_ownerless_objects(data, operation, target):
    d = data
    before = await snapshot(d)
    method, path = advice_path(d, operation, target)
    response = await request(d, method, path, json={"correction_comment": "MUST_NOT_CHANGE"})
    assert response.status_code == 403, response.text
    assert "P1_PRIVATE_" not in response.text and "P1_GROUP_PRIVATE_" not in response.text
    assert await snapshot(d) == before
    no_work(d)


@pytest.mark.parametrize("member", ["json", "linked", "both", "dict"])
async def test_teacher_own_student_is_allowed_through_each_membership_representation(data, member):
    d = data
    response = await request(d, "GET", "/student/" + d.users[member].user_id)
    assert response.status_code == 200, response.text
    assert [row["analysis_text"] for row in response.json()] == [d.personal[member].analysis_text]
    no_work(d)


@pytest.mark.parametrize("operation,target", [("group_get", "own"), ("group_read", "own"),
    ("read_group", "own"), ("student_alias_group", "own"),
    ("read", "json"), ("student_alias", "linked"), ("refine", "json")])
async def test_teacher_keeps_allowed_reads_and_mutations(data, operation, target):
    d = data
    method, path = advice_path(d, operation, target)
    response = await request(d, method, path, json={"correction_comment": "review note"})
    assert response.status_code == 200, response.text
    if operation == "group_get":
        assert response.json()[0]["analysis_text"] == d.grouped["own"].analysis_text
    elif operation == "refine":
        async with d.r.db.AsyncSessionLocal() as db:
            saved = await db.get(d.r.d3.AIStudentAdvice, d.personal[target].advice_id)
            assert "review note" in saved.analysis_text
    else:
        model = d.r.d3.AIGroupAdvice if target == "own" else d.r.d3.AIStudentAdvice
        row = d.grouped[target] if target == "own" else d.personal[target]
        async with d.r.db.AsyncSessionLocal() as db:
            assert (await db.get(model, row.advice_id)).is_read is True
    no_work(d)


@pytest.mark.parametrize("operation,target", [("student_get", "foreign"), ("read", "foreign"),
    ("student_alias", "foreign"), ("group_get", "own"), ("group_read", "own"),
    ("read_group", "own"), ("student_alias_group", "own"), ("refine", "json")])
async def test_cadet_cannot_use_group_fallback_or_modify_peer(data, operation, target):
    d = data
    before = await snapshot(d)
    method, path = advice_path(d, operation, target)
    response = await request(d, method, path, "json", json={"correction_comment": "denied"})
    assert response.status_code == 403, response.text
    assert await snapshot(d) == before
    no_work(d)


async def test_cadet_keeps_own_read_and_mark_read(data):
    d = data
    response = await request(d, "GET", "/student/" + d.users["json"].user_id, "json")
    assert response.status_code == 200
    assert response.json()[0]["advice_id"] == d.personal["json"].advice_id
    response = await request(d, "PATCH", "/student/advice/" + d.personal["json"].advice_id + "/read", "json")
    assert response.status_code == 200
    async with d.r.db.AsyncSessionLocal() as db:
        assert (await db.get(d.r.d3.AIStudentAdvice, d.personal["json"].advice_id)).is_read


@pytest.mark.parametrize("method,wire", [("POST", "body"), ("POST", "query"), ("GET", "query"), ("GET", "body")])
@pytest.mark.parametrize("background", [True, False])
@pytest.mark.parametrize("target", ["foreign_student", "foreign_group", "ownerless_group", "mixed_group", "mixed_student"])
async def test_trigger_checks_all_targets_before_any_work(data, method, wire, background, target):
    d = data
    payload = {"background": background}
    if target == "foreign_student":
        payload["cadet_id"] = d.users["foreign"].user_id
    elif target in ("foreign_group", "ownerless_group"):
        payload["group_id"] = d.groups["foreign" if target == "foreign_group" else "ownerless"].group_id
    elif target == "mixed_group":
        payload.update(cadet_id=d.users["json"].user_id, group_id=d.groups["foreign"].group_id)
    else:
        payload.update(cadet_id=d.users["foreign"].user_id, group_id=d.groups["own"].group_id)
    before = await snapshot(d)
    response = await request(d, method, "/trigger", **{"json" if wire == "body" else "params": payload})
    assert response.status_code == 403, response.text
    assert await snapshot(d) == before
    no_work(d)


@pytest.mark.parametrize("method", ["GET", "POST"])
@pytest.mark.parametrize("payload", [{}, {"background": True}, {"background": False}])
async def test_teacher_trigger_requires_explicit_target(data, method, payload):
    response = await request(data, method, "/trigger", **{"params" if method == "GET" else "json": payload})
    assert response.status_code == 422, response.text
    no_work(data)


@pytest.mark.parametrize("kind", ["cadet_id", "group_id"])
@pytest.mark.parametrize("background", [True, False])
async def test_trigger_missing_explicit_object_is_404_without_work(data, kind, background):
    response = await request(data, "POST", "/trigger", json={kind: str(uuid.uuid4()), "background": background})
    assert response.status_code == 404, response.text
    no_work(data)


@pytest.mark.parametrize("kind", ["cadet_id", "group_id"])
@pytest.mark.parametrize("background", [True, False])
async def test_trigger_own_target_keeps_sync_and_background_paths(data, kind, background):
    d = data
    target = d.users["json"].user_id if kind == "cadet_id" else d.groups["own"].group_id
    response = await request(d, "POST", "/trigger", json={kind: target, "background": background})
    assert response.status_code == 200, response.text
    if background:
        assert response.json()["status"] == "queued"
        assert [call.kwargs["target_id"] for call in d.calls.enqueue.await_args_list] == [target]
        d.calls.cadet.assert_not_awaited()
        d.calls.group.assert_not_awaited()
    else:
        assert response.json()["status"] == "completed"
        worker = d.calls.cadet if kind == "cadet_id" else d.calls.group
        assert worker.await_count == 1
        assert worker.await_args.kwargs[kind] == target
        d.calls.enqueue.assert_not_awaited()


@pytest.mark.parametrize("method,wire", [("POST", "body"), ("GET", "query")])
async def test_all_students_is_scoped_and_deduplicated(data, method, wire):
    d = data
    response = await request(d, method, "/trigger", **{"json" if wire == "body" else "params": {"all_students": True}})
    assert response.status_code == 200, response.text
    ids = [call.kwargs["target_id"] for call in d.calls.enqueue.await_args_list]
    expected = {d.users[key].user_id for key in ("json", "linked", "both", "dict")}
    assert set(ids) == expected and len(ids) == len(expected)
    assert response.json()["count"] == len(expected)


async def test_empty_all_students_never_starts_worker(data):
    response = await request(data, "POST", "/trigger", "empty_teacher", json={"all_students": True})
    assert response.status_code == 200 and response.json()["count"] == 0, response.text
    no_work(data)


@pytest.mark.parametrize("kind", ["cadet_id", "group_id"])
@pytest.mark.parametrize("background", [True, False])
async def test_bulk_flag_does_not_authorize_an_explicit_foreign_target(data, kind, background):
    d = data
    target = d.users["foreign"].user_id if kind == "cadet_id" else d.groups["foreign"].group_id
    before = await snapshot(d)
    response = await request(d, "POST", "/trigger", json={kind: target, "all_students": True, "background": background})
    assert response.status_code == 403, response.text
    assert await snapshot(d) == before
    no_work(d)


@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_cadet_trigger_cannot_select_foreign_targets(data, method):
    d = data
    payload = {"cadet_id": d.users["foreign"].user_id, "group_id": d.groups["foreign"].group_id,
               "all_students": True, "background": True}
    response = await request(d, method, "/trigger", "json", **{"params" if method == "GET" else "json": payload})
    assert response.status_code == 200, response.text
    assert [call.kwargs["target_id"] for call in d.calls.enqueue.await_args_list] == [d.users["json"].user_id]


@pytest.mark.parametrize("operation", ["student_get", "group_get", "read", "student_alias", "group_read", "refine", "trigger"])
@pytest.mark.parametrize("who", ["anonymous", "invalid", "expired", "revoked", "legacy_jwt", "inactive", "admin", "student_role"])
async def test_real_authentication_and_role_checks_remain_in_force(data, operation, who):
    d = data
    if operation == "trigger":
        method, path = "POST", "/trigger"
    else:
        method, path = advice_path(d, operation, "own" if operation.startswith("group") else "json")
    before = await snapshot(d)
    response = await request(d, method, path, who, json={"correction_comment": "denied", "cadet_id": d.users["json"].user_id})
    assert response.status_code == (403 if who in ("admin", "student_role") else 401), response.text
    assert await snapshot(d) == before
    no_work(d)


@pytest.mark.parametrize("suffix", ["/student/{}", "/group/{}", "/advice/{}/read",
    "/student/advice/{}/read", "/group/advice/{}/read", "/student/{}/refine"])
async def test_missing_object_returns_404_without_mutation(data, suffix):
    method = "POST" if suffix.endswith("refine") else "PATCH" if suffix.endswith("read") else "GET"
    before = await snapshot(data)
    response = await request(data, method, suffix.format(uuid.uuid4()), json={"correction_comment": "missing"})
    assert response.status_code == 404, response.text
    assert await snapshot(data) == before
    no_work(data)


async def test_real_login_logout_revokes_access_without_testing_bypass(data):
    d = data
    assert os.environ["TESTING"] == "false"
    async with AsyncClient(transport=ASGITransport(app=d.r.app), base_url="http://test") as client:
        login = await client.post("/api/auth/login", json={"username": d.users["teacher"].username,
                                                           "password": PASSWORD, "role": "TEACHER"})
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        assert d.r.security.decode_access_token(token).get("jti")
        headers = {"Authorization": "Bearer " + token}
        url = PREFIX + "/group/" + d.groups["own"].group_id
        assert (await client.get(url, headers=headers)).status_code == 200
        assert (await client.post("/api/auth/logout", headers=headers)).status_code == 200
        response = await client.get(url, headers=headers)
        assert response.status_code == 401
        assert "P1_GROUP_PRIVATE_" not in response.text
