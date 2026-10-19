"""Current-class contract; private synthetic DB is allocated by tests/conftest.py."""
import asyncio
import uuid

import pytest
from sqlalchemy import select, func
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import Assignment, ExamSession
from tests.test_dds_cycle_acceptance import setup_group, create, start, request


async def self_start(d, user=None, key=None):
    return await request("POST", "/api/dds/training", user or d["cadets"][0],
        json={"request_id": key or str(uuid.uuid4()), "ticket_ids": [d["ticket_id"]]})


@pytest.mark.asyncio
async def test_workspace_is_authenticated_own_and_excludes_finished_training():
    d = await setup_group()
    assert (await request("GET", "/api/dds/student-workspace")).status_code == 401
    for user in [d["teacher"], d["admin"]]:
        assert (await request("GET", "/api/dds/student-workspace", user)).status_code == 403
    r = await request("GET", "/api/dds/student-workspace", d["cadets"][0])
    assert r.json() == {"activities": [], "can_start_training": True}
    training = await self_start(d)
    assert training.status_code == 200, training.text
    own = (await request("GET", "/api/dds/student-workspace", d["cadets"][0])).json()
    assert own["activities"][0]["kind"] == "self_training" and own["can_start_training"]
    assert own["activities"][0]["session_id"] == training.json()["session_id"]
    assert "incoming_card" not in own["activities"][0] and "queue" not in own["activities"][0]
    other = (await request("GET", "/api/dds/student-workspace", d["cadets"][1])).json()
    assert other == {"activities": [], "can_start_training": True}
    r = await request("POST", f"/api/dds/sessions/{training.json()['session_id']}/finish", d["cadets"][0], json={})
    assert r.status_code == 200, r.text
    assert (await request("GET", "/api/dds/student-workspace", d["cadets"][0])).json()["can_start_training"]


@pytest.mark.asyncio
async def test_self_training_is_independent_of_current_class_and_personal_completion():
    d = await setup_group()
    lesson, states = await start(d)
    result = (await request("GET", "/api/dds/student-workspace", d["cadets"][0])).json()
    activity = result["activities"][0]
    assert activity["kind"] == "teacher" and activity["lesson_id"] == lesson
    assert activity["teacher_name"] and activity["group_name"] and activity["total_cards"] == 1
    assert result["can_start_training"]
    assert (await self_start(d)).status_code == 200
    async with AsyncSessionLocal() as db:
        s = await db.get(ExamSession, states[0]["session_id"])
        s.status = "COMPLETED"
        await db.commit()
    assert (await self_start(d)).status_code == 200
    # Ending the teacher's lesson frees every member.
    ended = await request("POST", f"/api/v1/lessons/{lesson}/stop", d["teacher"])
    assert ended.status_code == 200, ended.text
    assert (await request("GET", "/api/dds/student-workspace", d["cadets"][0])).json()["can_start_training"]
    assert (await self_start(d)).status_code == 200


@pytest.mark.asyncio
async def test_overlapping_group_start_rejected_atomically_without_mutating_existing_work():
    d = await setup_group()
    first, states = await start(d)
    second = await create(d)
    r = await request("POST", f"/api/v1/lessons/{second}/start", d["teacher"])
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "DDS_LEARNING_IN_PROGRESS"
    async with AsyncSessionLocal() as db:
        assert (await db.get(Assignment, second)).status == "WAITING"
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == second)) == 0
        assert (await db.get(ExamSession, states[0]["session_id"])).status == "ACTIVE"
    repeat = await request("POST", f"/api/v1/lessons/{first}/start", d["teacher"])
    assert repeat.status_code == 200


@pytest.mark.asyncio
async def test_old_self_training_does_not_block_a_teacher_group_start():
    d = await setup_group()
    assert (await self_start(d)).status_code == 200
    lesson = await create(d)
    r = await request("POST", f"/api/v1/lessons/{lesson}/start", d["teacher"])
    assert r.status_code == 200, r.text
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == lesson)) == 2
    assert (await self_start(d, d["cadets"][1])).status_code == 200


@pytest.mark.asyncio
async def test_training_retry_is_idempotent_and_new_keys_and_demo_aliases_remain_independent():
    d = await setup_group(); key = str(uuid.uuid4())
    a = await self_start(d, key=key); b = await self_start(d, key=key)
    assert a.status_code == b.status_code == 200
    assert a.json()["session_id"] == b.json()["session_id"]
    assert (await self_start(d)).status_code == 200
    for path in ["/api/v1/sessions/demo", "/api/v2/sessions/demo"]:
        r = await request("POST", path, d["cadets"][0], json={"target_role": "DISPATCHER_DDS", "ticket_id": d["ticket_id"]})
        assert r.status_code == 200, (path, r.text)
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.cadet_id == d["cadets"][0][0])) == 4


@pytest.mark.asyncio
async def test_distinct_concurrent_training_launches_are_allowed():
    d = await setup_group()
    results = await asyncio.gather(self_start(d), self_start(d))
    assert sorted(r.status_code for r in results) == [200, 200]


@pytest.mark.asyncio
async def test_concurrent_different_lessons_for_same_group_have_one_winner():
    d = await setup_group()
    ids = [await create(d), await create(d)]
    results = await asyncio.gather(*(request("POST", f"/api/v1/lessons/{lid}/start", d["teacher"]) for lid in ids))
    assert sorted(r.status_code for r in results) == [200, 409]


@pytest.mark.asyncio
async def test_legacy_duplicate_rows_are_reported_without_automatic_cleanup():
    d = await setup_group(); lesson, states = await start(d)
    async with AsyncSessionLocal() as db:
        original = await db.get(ExamSession, states[0]["session_id"])
        extra = Assignment(group_id=d["group_id"], assigned_by=d["teacher"][0], target_role="DISPATCHER_DDS", status="ACTIVE")
        db.add(extra); await db.flush()
        duplicate = ExamSession(assignment_id=extra.assignment_id, cadet_id=d["cadets"][0][0], session_type="CARD_ACTIONS", status="ACTIVE", ticket_id=d["ticket_id"], dynamic_state=original.dynamic_state)
        db.add(duplicate); await db.commit()
        extra_id = duplicate.session_id
    for _ in range(2):
        r = await request("GET", "/api/dds/student-workspace", d["cadets"][0])
        assert len(r.json()["activities"]) == 2 and r.json()["can_start_training"]
    async with AsyncSessionLocal() as db:
        assert (await db.get(ExamSession, extra_id)).status == "ACTIVE"


@pytest.mark.asyncio
async def test_teacher_and_self_training_can_start_independently():
    d = await setup_group(); lesson = await create(d)
    results = await asyncio.gather(self_start(d), request("POST", f"/api/v1/lessons/{lesson}/start", d["teacher"]))
    assert sorted(r.status_code for r in results) == [200, 200]
    state = (await request("GET", "/api/dds/student-workspace", d["cadets"][0])).json()
    assert len(state["activities"]) == 2


@pytest.mark.asyncio
async def test_different_groups_sharing_one_member_cannot_run_parallel_classes():
    d = await setup_group(); await start(d)
    async with AsyncSessionLocal() as db:
        group = StudentGroup(group_name="Вторая учебная группа", teacher_id=d["other"][0], cadet_ids=[d["cadets"][0][0], d["outsider"][0]])
        db.add(group); await db.commit(); gid = group.group_id
    r = await request("POST", "/api/v1/lessons", d["other"], json={"group_id": gid, "target_role": "DISPATCHER_DDS", "ticket_ids": [d["ticket_id"]]})
    assert r.status_code == 201, r.text
    r = await request("POST", f"/api/v1/lessons/{r.json()['id']}/start", d["other"])
    assert r.status_code == 409, r.text
    assert (await request("GET", "/api/dds/student-workspace", d["outsider"])).json()["can_start_training"]


@pytest.mark.asyncio
async def test_archived_test_session_is_explicit_in_history_without_faking_completion():
    from copy import deepcopy
    d = await setup_group(); _, states = await start(d)
    async with AsyncSessionLocal() as db:
        row = await db.get(ExamSession, states[0]["session_id"])
        data = deepcopy(row.dynamic_state)
        data["dds"]["archived_at"] = "2026-10-19T01:00:00+00:00"
        row.dynamic_state = data
        row.status = "COMPLETED"
        await db.commit()
    result = await request("GET", "/api/v1/students/me/lessons?role=DISPATCHER_DDS", d["cadets"][0])
    record = next(item for item in result.json() if item["session_id"] == states[0]["session_id"])
    assert record["status"] == "ARCHIVED"
    assert record["tickets"][0]["status"] == "incomplete"
    assert record["tickets"][0]["score"] is None
