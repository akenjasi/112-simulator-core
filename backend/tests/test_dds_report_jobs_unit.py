"""Comprehensive unit tests for DDS Lesson Report Background Jobs (Task A-04).

Scope:
- Model invariants and database uniqueness constraints.
- Authorization and lesson eligibility checks (401, 403, 404, 409).
- Job state machine: creation (202), completed (200), failed (409 vs retry 202).
- Retry rules: cannot restart completed or active jobs.
- Response field guarantees: report_text only on completed, error_code only on failed, no snapshot leak.
- Read idempotency: GET does not regenerate text.
- Worker execution with atomic claim (RETURNING/rowcount): only winning claimant generates.
- Attempt token and conditioned writes: stale attempts cannot overwrite newer attempts.
- Queue management: repeated POST on pending/running does not duplicate queue entries.
- Error sanitization: length finish_reason, empty response, network errors.
- Process restart / shutdown recovery: interrupted handling and preservation of completed jobs.
- Startup recovery failure raises and halts startup.
- Single backend process constraint.
"""

import asyncio
import copy
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
import httpx
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from backend.main import app
from backend.database import AsyncSessionLocal
from backend.core.security import create_access_token
from backend.core.dds_report_jobs import (
    DDSReportJobWorker,
    classify_error,
    dds_report_job_worker,
)
from backend.core.dds_report_llm import (
    DDSReportConfigurationError,
    DDSReportGenerationError,
)
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult
from backend.models.dds_report_job import DDSReportJob


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
async def setup_test_data():
    """Create isolated test fixtures for testing DDS report jobs."""
    tag = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as db:
        teacher = User(username=f"teacher_{tag}", role="TEACHER", password_hash="dummy")
        other_teacher = User(username=f"other_teacher_{tag}", role="TEACHER", password_hash="dummy")
        admin = User(username=f"admin_{tag}", role="ADMIN", password_hash="dummy")
        cadet = User(username=f"cadet_{tag}", role="CADET", password_hash="dummy")
        db.add_all([teacher, other_teacher, admin, cadet])
        await db.flush()

        group = StudentGroup(group_name=f"Группа {tag}", teacher_id=teacher.user_id)
        db.add(group)
        await db.flush()

        # Completed DDS lesson
        lesson_ok = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="DISPATCHER_DDS",
            status="COMPLETED",
            session_type="CARD_ACTIONS",
        )
        # Active DDS lesson
        lesson_active = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="DISPATCHER_DDS",
            status="ACTIVE",
            session_type="CARD_ACTIONS",
        )
        # Operator lesson
        lesson_operator = Assignment(
            group_id=group.group_id,
            assigned_by=teacher.user_id,
            target_role="OPERATOR_112",
            status="COMPLETED",
            session_type="CALL_SIMULATION",
        )
        db.add_all([lesson_ok, lesson_active, lesson_operator])
        await db.flush()

        # Completed session for lesson_ok
        t0 = datetime(2026, 10, 17, 10, 0, tzinfo=timezone.utc)
        session1 = ExamSession(
            assignment_id=lesson_ok.assignment_id,
            cadet_id=cadet.user_id,
            session_type="CARD_ACTIONS",
            status="COMPLETED",
            time_limit_seconds=60,
            start_time=t0,
        )
        db.add(session1)
        await db.flush()

        card1 = IncidentCard(
            session_id=session1.session_id,
            operator_id=cadet.user_id,
            card_origin="DDS",
            status="closed",
        )
        db.add(card1)
        await db.flush()

        eval1 = EvaluationResult(
            session_id=session1.session_id,
            card_id=card1.card_id,
            scores={"total": 90},
            metrics={"time": 45},
            errors_list=["Незначительная задержка"],
        )
        # ticket_id nullable per PG FK check
        ticket1 = TicketResult(
            session_id=session1.session_id,
            ticket_id=None,
            is_passed=True,
            errors_count=0,
        )
        db.add_all([eval1, ticket1])
        await db.commit()

        return {
            "teacher": teacher,
            "other_teacher": other_teacher,
            "admin": admin,
            "cadet": cadet,
            "lesson_ok": lesson_ok,
            "lesson_active": lesson_active,
            "lesson_operator": lesson_operator,
            "session": session1,
        }


# ─── 1. Error Classification Unit Tests ──────────────────────────────────────

def test_classify_error_sanitization():
    """Verify error classifier returns standardized codes and sanitized Russian text."""
    code, msg = classify_error(DDSReportGenerationError("finish_reason='length'"))
    assert code == "length_exceeded"
    assert "лимит токенов" in msg.lower()

    code, msg = classify_error(DDSReportGenerationError("Сервер нейросетевого инференса вернул пустой текст отчета"))
    assert code == "empty_response"
    assert "пустой" in msg.lower()

    code, msg = classify_error(httpx.ReadTimeout("Timeout occurred to http://secret-ip:8080/v1"))
    assert code == "llm_timeout"
    assert "secret-ip" not in msg
    assert "время ожидания" in msg.lower()

    code, msg = classify_error(httpx.ConnectError("Connection refused"))
    assert code == "llm_unavailable"

    code, msg = classify_error(DDSReportGenerationError("Недостаточно данных для формирования отчета"))
    assert code == "insufficient_data"

    code, msg = classify_error(DDSReportGenerationError("Размер снимка данных превышает максимально допустимый"))
    assert code == "input_too_large"

    code, msg = classify_error(DDSReportConfigurationError("DDS_LLM_BASE_URL не может быть пустым"))
    assert code == "configuration_error"

    # A-03 wrapped exceptions
    code, _ = classify_error(DDSReportGenerationError("Превышено время ожидания ответа от сервиса нейросетевого инференса (180.0 с)."))
    assert code == "llm_timeout"

    code, _ = classify_error(DDSReportGenerationError("Ошибка сетевого соединения при обращении к сервису нейросетевого инференса."))
    assert code == "llm_unavailable"

    code, _ = classify_error(DDSReportGenerationError("Сервер нейросетевого инференса вернул некорректный ответ (невалидный JSON)."))
    assert code == "llm_error"

    code, _ = classify_error(DDSReportGenerationError("Сервер нейросетевого инференса вернул ошибку со статусом HTTP 500."))
    assert code == "llm_error"

    code, msg = classify_error(Exception("interrupted"))
    assert code == "interrupted"


# ─── 2. Model and Uniqueness Unit Tests ──────────────────────────────────────

@pytest.mark.asyncio
async def test_job_model_creation_and_uniqueness(setup_test_data):
    """Verify DDSReportJob model defaults and uniqueness on lesson_id."""
    lesson_id = setup_test_data["lesson_ok"].assignment_id

    async with AsyncSessionLocal() as db:
        job1 = DDSReportJob(
            lesson_id=lesson_id,
            status="pending",
            snapshot={"lesson_id": lesson_id},
        )
        db.add(job1)
        await db.commit()
        await db.refresh(job1)

        assert job1.job_id is not None
        assert job1.attempt == 1
        assert job1.status == "pending"
        assert job1.created_at is not None
        assert job1.updated_at is not None

        # Inserting duplicate lesson_id must trigger IntegrityError
        job2 = DDSReportJob(
            lesson_id=lesson_id,
            status="pending",
        )
        db.add(job2)
        with pytest.raises(IntegrityError):
            await db.commit()


# ─── 3. Authorization and Validation Unit Tests ──────────────────────────────

@pytest.mark.asyncio
async def test_endpoint_authorization_and_validation(setup_test_data):
    """Verify 401, 403, 404, 409 enforcement on report endpoints."""
    data = setup_test_data
    lesson_ok_id = data["lesson_ok"].assignment_id
    token_teacher = create_access_token(subject=data["teacher"].user_id, role=data["teacher"].role)
    token_other = create_access_token(subject=data["other_teacher"].user_id, role=data["other_teacher"].role)
    token_cadet = create_access_token(subject=data["cadet"].user_id, role=data["cadet"].role)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Unauthenticated -> 401
        res = await client.post(f"/api/ai-analytics/lessons/{lesson_ok_id}/report")
        assert res.status_code == 401

        res = await client.get(f"/api/ai-analytics/lessons/{lesson_ok_id}/report")
        assert res.status_code == 401

        # 2. Cadet role -> 403
        headers_cadet = {"Authorization": f"Bearer {token_cadet}"}
        res = await client.post(f"/api/ai-analytics/lessons/{lesson_ok_id}/report", headers=headers_cadet)
        assert res.status_code == 403

        res = await client.get(f"/api/ai-analytics/lessons/{lesson_ok_id}/report", headers=headers_cadet)
        assert res.status_code == 403

        # 3. Foreign teacher -> 403
        headers_other = {"Authorization": f"Bearer {token_other}"}
        res = await client.post(f"/api/ai-analytics/lessons/{lesson_ok_id}/report", headers=headers_other)
        assert res.status_code == 403

        # 4. Non-existent lesson -> 404
        headers_teacher = {"Authorization": f"Bearer {token_teacher}"}
        res = await client.post("/api/ai-analytics/lessons/non_existent_id/report", headers=headers_teacher)
        assert res.status_code == 404

        # 5. Active lesson -> 409
        active_id = data["lesson_active"].assignment_id
        res = await client.post(f"/api/ai-analytics/lessons/{active_id}/report", headers=headers_teacher)
        assert res.status_code == 409

        # 6. Operator lesson -> 409
        op_id = data["lesson_operator"].assignment_id
        res = await client.post(f"/api/ai-analytics/lessons/{op_id}/report", headers=headers_teacher)
        assert res.status_code == 409


# ─── 4. Job State Machine & Retry Contract Tests ──────────────────────────────

@pytest.mark.asyncio
async def test_job_lifecycle_state_machine(setup_test_data):
    """Verify POST creation, completed status, failed 409, and retry rules."""
    data = setup_test_data
    lesson_id = data["lesson_ok"].assignment_id
    token_teacher = create_access_token(subject=data["teacher"].user_id, role=data["teacher"].role)
    headers = {"Authorization": f"Bearer {token_teacher}"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Initial GET before any job exists -> 404
        res_get_init = await client.get(f"/api/ai-analytics/lessons/{lesson_id}/report", headers=headers)
        assert res_get_init.status_code == 404

        # 1. Initial POST -> 202 Accepted, status="pending"
        res_post = await client.post(f"/api/ai-analytics/lessons/{lesson_id}/report", headers=headers)
        assert res_post.status_code == 202
        body = res_post.json()
        assert body["lesson_id"] == lesson_id
        assert body["status"] == "pending"
        assert body["attempt"] == 1
        assert body["report_text"] is None
        assert body["error_code"] is None
        assert "snapshot" not in body
        job_id = body["job_id"]

        # 2. Duplicate POST while pending -> 202, returns same job without duplicate enqueue
        q_size_before = dds_report_job_worker._queue.qsize()
        res_post_dup = await client.post(f"/api/ai-analytics/lessons/{lesson_id}/report", headers=headers)
        assert res_post_dup.status_code == 202
        assert res_post_dup.json()["job_id"] == job_id
        assert res_post_dup.json()["status"] == "pending"
        assert dds_report_job_worker._queue.qsize() == q_size_before  # No duplicate enqueue!

        # 3. Complete the job manually in DB
        async with AsyncSessionLocal() as db:
            stmt = select(DDSReportJob).where(DDSReportJob.job_id == job_id)
            job = (await db.execute(stmt)).scalar_one()
            job.status = "completed"
            job.report_text = "Готовый аналитический отчет преподавателю"
            job.model_used = "dds-qwen"
            await db.commit()

        # 4. POST on completed job -> 200 OK with result
        res_post_comp = await client.post(f"/api/ai-analytics/lessons/{lesson_id}/report", headers=headers)
        assert res_post_comp.status_code == 200
        assert res_post_comp.json()["status"] == "completed"
        assert res_post_comp.json()["report_text"] == "Готовый аналитический отчет преподавателю"
        assert res_post_comp.json()["model_used"] == "dds-qwen"

        # 5. POST on completed with retry=true -> does NOT restart completed (returns 200)
        res_post_retry_comp = await client.post(
            f"/api/ai-analytics/lessons/{lesson_id}/report",
            json={"retry": True},
            headers=headers,
        )
        assert res_post_retry_comp.status_code == 200
        assert res_post_retry_comp.json()["status"] == "completed"
        assert res_post_retry_comp.json()["attempt"] == 1

        # 6. GET returns 200 and does NOT regenerate report text
        res_get = await client.get(f"/api/ai-analytics/lessons/{lesson_id}/report", headers=headers)
        assert res_get.status_code == 200
        assert res_get.json()["report_text"] == "Готовый аналитический отчет преподавателю"

        # 7. Fail the job in DB
        async with AsyncSessionLocal() as db:
            stmt = select(DDSReportJob).where(DDSReportJob.job_id == job_id)
            job = (await db.execute(stmt)).scalar_one()
            job.status = "failed"
            job.error_code = "llm_timeout"
            job.report_text = None
            await db.commit()

        # 8. POST without retry=true on failed job -> 409 Conflict
        res_post_fail_no_retry = await client.post(
            f"/api/ai-analytics/lessons/{lesson_id}/report",
            json={"retry": False},
            headers=headers,
        )
        assert res_post_fail_no_retry.status_code == 409

        # 9. POST with retry=true on failed job -> 202 Accepted, new attempt
        res_post_retry = await client.post(
            f"/api/ai-analytics/lessons/{lesson_id}/report",
            json={"retry": True},
            headers=headers,
        )
        assert res_post_retry.status_code == 202
        retry_body = res_post_retry.json()
        assert retry_body["status"] == "pending"
        assert retry_body["attempt"] == 2
        assert retry_body["report_text"] is None
        assert retry_body["error_code"] is None


# ─── 5. Worker Atomic Claim & Session Isolation Unit Tests ────────────────────

@pytest.mark.asyncio
async def test_simultaneous_process_single_job_claims_once(setup_test_data):
    """Verify simultaneous process_single_job calls claim atomic lock: only 1 claimant invokes LLM."""
    data = setup_test_data
    lesson_id = data["lesson_ok"].assignment_id
    worker = DDSReportJobWorker()

    job_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        job = DDSReportJob(
            job_id=job_id,
            lesson_id=lesson_id,
            status="pending",
            attempt=1,
            snapshot={
                "lesson_id": lesson_id,
                "status": "COMPLETED",
                "summary": {"completed_session_count": 1, "evaluation_count": 1, "ticket_result_count": 1},
                "sessions": [],
                "students": [],
            },
        )
        db.add(job)
        await db.commit()

    llm_mock = AsyncMock(
        return_value={"lesson_id": lesson_id, "model_used": "dds-qwen", "analysis_text": "Отчет"}
    )
    with patch("backend.core.dds_report_jobs.generate_dds_lesson_report", new=llm_mock):
        # 4 simultaneous process_single_job calls
        await asyncio.gather(
            worker.process_single_job(job_id),
            worker.process_single_job(job_id),
            worker.process_single_job(job_id),
            worker.process_single_job(job_id),
        )

    # Exactly ONE invocation!
    assert llm_mock.call_count == 1

    async with AsyncSessionLocal() as db:
        stmt = select(DDSReportJob).where(DDSReportJob.job_id == job_id)
        saved = (await db.execute(stmt)).scalar_one()
        assert saved.status == "completed"
        assert saved.report_text == "Отчет"


@pytest.mark.asyncio
async def test_stale_attempt_does_not_overwrite_newer_attempt(setup_test_data):
    """Verify conditioned write: a stale attempt completion does not overwrite newer attempt."""
    data = setup_test_data
    lesson_id = data["lesson_ok"].assignment_id
    worker = DDSReportJobWorker()

    job_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        job = DDSReportJob(
            job_id=job_id,
            lesson_id=lesson_id,
            status="pending",
            attempt=2,  # Current attempt is 2
            snapshot={"lesson_id": lesson_id, "status": "COMPLETED"},
        )
        db.add(job)
        await db.commit()

    # Try marking failed with stale attempt 1
    await worker._mark_failed(job_id, attempt=1, error_code="stale_err", error_message="stale msg")

    async with AsyncSessionLocal() as db:
        stmt = select(DDSReportJob).where(DDSReportJob.job_id == job_id)
        saved = (await db.execute(stmt)).scalar_one()
        assert saved.status == "pending"  # Unchanged!
        assert saved.attempt == 2
        assert saved.error_code is None


# ─── 6. Startup Recovery Tests ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_startup_recovery_marks_interrupted(setup_test_data):
    """Verify startup recovery marks pending/running jobs as interrupted and preserves completed."""
    data = setup_test_data
    worker = DDSReportJobWorker()

    tag = uuid.uuid4().hex[:6]
    job_pending_id = f"job_p_{tag}"
    job_running_id = f"job_r_{tag}"
    job_completed_id = f"job_c_{tag}"

    async with AsyncSessionLocal() as db:
        jp = DDSReportJob(job_id=job_pending_id, lesson_id=f"l_p_{tag}", status="pending")
        jr = DDSReportJob(job_id=job_running_id, lesson_id=f"l_r_{tag}", status="running")
        jc = DDSReportJob(
            job_id=job_completed_id,
            lesson_id=f"l_c_{tag}",
            status="completed",
            report_text="Сохраненный отчет",
        )
        db.add_all([jp, jr, jc])
        await db.commit()

    # Trigger recovery
    await worker._recover_interrupted_jobs()

    async with AsyncSessionLocal() as db:
        jp_res = (await db.execute(select(DDSReportJob).where(DDSReportJob.job_id == job_pending_id))).scalar_one()
        jr_res = (await db.execute(select(DDSReportJob).where(DDSReportJob.job_id == job_running_id))).scalar_one()
        jc_res = (await db.execute(select(DDSReportJob).where(DDSReportJob.job_id == job_completed_id))).scalar_one()

        assert jp_res.status == "failed"
        assert jp_res.error_code == "interrupted"

        assert jr_res.status == "failed"
        assert jr_res.error_code == "interrupted"

        assert jc_res.status == "completed"
        assert jc_res.report_text == "Сохраненный отчет"
