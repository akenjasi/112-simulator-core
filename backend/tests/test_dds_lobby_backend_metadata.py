"""Additional contract tests for DDS lobby metadata and self-training separation."""

import uuid
import pytest
from backend.tests.test_dds_cycle_acceptance import request
from backend.tests.test_dds_queue import exercise, launch


@pytest.mark.asyncio
async def test_assignments_distinguish_teacher_and_self_training():
    users, tickets = await exercise(n=1, count=2)
    cadet = users["cadets"][0]
    lesson, states = await launch(users, tickets)

    # 1. Teacher lesson assignment check
    assigned = (await request("GET", "/api/dds/assignments", cadet)).json()
    teacher_item = next(it for it in assigned if it["lesson_id"] == lesson)
    assert teacher_item["is_self_training"] is False
    assert teacher_item["card_pool_source"] is None

    # 2. Launch self-training session for same cadet
    training_payload = {"request_id": str(uuid.uuid4()), "ticket_ids": tickets}
    training_resp = await request("POST", "/api/dds/training", cadet, json=training_payload)
    assert training_resp.status_code == 200, training_resp.text
    training_session_id = training_resp.json()["session_id"]

    # 3. Both are returned by default GET /api/dds/assignments with appropriate metadata
    assigned_all = (await request("GET", "/api/dds/assignments", cadet)).json()
    self_item = next(it for it in assigned_all if it["session_id"] == training_session_id)
    assert self_item["is_self_training"] is True
    assert self_item["card_pool_source"] == "self_training"

    # 4. Optional query parameter include_self_training=false excludes self-training
    assigned_teacher_only = (await request("GET", "/api/dds/assignments?include_self_training=false", cadet)).json()
    assert any(it["lesson_id"] == lesson for it in assigned_teacher_only)
    assert not any(it["session_id"] == training_session_id for it in assigned_teacher_only)
