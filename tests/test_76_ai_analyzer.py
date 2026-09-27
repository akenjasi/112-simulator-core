"""Tests for Task 76: AI Background Analyzer (Qwen 3.5 9B / Qwen 2.5 9B).

Verifies:
1. Database tables and models (AIStudentAdvice, AIGroupAdvice).
2. Asynchronous AI worker, session log aggregation, prompt builder, and LLM stub.
3. Queue processing and database persistence.
4. REST API endpoints (/api/ai-analytics/trigger, /student/{id}, /group/{id}, mark as read, /info).
"""

import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.main import app
from backend.database import AsyncSessionLocal, engine
from backend.models.base import Base
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import ExamSession, AIStudentAdvice, AIGroupAdvice
from backend.models.domain_04 import TicketResult
from backend.core.security import create_access_token, hash_password
from backend.core.ai_worker import (
    DEFAULT_MODEL_NAME,
    MODEL_GGUF_URL,
    MODEL_FILENAME,
    ai_worker,
    call_qwen_llm,
    collect_cadet_session_data,
    build_cadet_prompt,
    run_cadet_analysis,
    run_group_analysis,
    AIAnalysisWorker,
)


@pytest.fixture(autouse=True)
async def ensure_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.mark.asyncio
async def test_ai_analyzer_architecture():
    """
    Test that the AI analysis queue and DB models are ready.
    Verifies that AIStudentAdvice and AIGroupAdvice tables exist in Base.metadata.
    """
    table_names = list(Base.metadata.tables.keys())
    assert "ai_student_advice" in table_names, "ai_student_advice table must exist in schema"
    assert "ai_group_advice" in table_names, "ai_group_advice table must exist in schema"

    # Verify column structures
    student_table = Base.metadata.tables["ai_student_advice"]
    assert "advice_id" in student_table.columns
    assert "cadet_id" in student_table.columns
    assert "analysis_text" in student_table.columns
    assert "date" in student_table.columns
    assert "is_read" in student_table.columns
    assert "model_used" in student_table.columns

    group_table = Base.metadata.tables["ai_group_advice"]
    assert "advice_id" in group_table.columns
    assert "group_id" in group_table.columns
    assert "analysis_text" in group_table.columns
    assert "date" in group_table.columns
    assert "is_read" in group_table.columns
    assert "model_used" in group_table.columns


@pytest.mark.asyncio
async def test_db_persistence_student_and_group_advice():
    """Test creating and retrieving AIStudentAdvice and AIGroupAdvice records in the DB."""
    async with AsyncSessionLocal() as session:
        # Create student and group
        cadet = User(
            username=f"cadet_76_{uuid.uuid4().hex[:6]}",
            password_hash=hash_password("secret"),
            role="CADET",
            full_name="Курсант Петров",
            is_active=True,
        )
        group = StudentGroup(
            name=f"Группа 76-{uuid.uuid4().hex[:4]}",
            specialization="OPERATOR_112",
        )
        session.add(cadet)
        session.add(group)
        await session.flush()

        # Insert student advice
        student_advice = AIStudentAdvice(
            cadet_id=cadet.user_id,
            analysis_text="Совет: соблюдайте алгоритм опроса при ДТП.",
            model_used="Qwen 3.5 9B",
            is_read=False,
        )
        session.add(student_advice)

        # Insert group advice
        group_advice = AIGroupAdvice(
            group_id=group.group_id,
            analysis_text="Сводка по группе: повторить классификатор экстренных служб.",
            model_used="Qwen 3.5 9B",
            is_read=False,
        )
        session.add(group_advice)
        await session.commit()

        # Query back
        res_s = await session.execute(
            select(AIStudentAdvice).where(AIStudentAdvice.cadet_id == cadet.user_id)
        )
        saved_s = res_s.scalar_one()
        assert saved_s.analysis_text == "Совет: соблюдайте алгоритм опроса при ДТП."
        assert saved_s.model_used == "Qwen 3.5 9B"
        assert saved_s.is_read is False
        assert saved_s.id == saved_s.advice_id

        res_g = await session.execute(
            select(AIGroupAdvice).where(AIGroupAdvice.group_id == group.group_id)
        )
        saved_g = res_g.scalar_one()
        assert saved_g.analysis_text == "Сводка по группе: повторить классификатор экстренных служб."
        assert saved_g.model_used == "Qwen 3.5 9B"
        assert saved_g.is_read is False
        assert saved_g.id == saved_g.advice_id


@pytest.mark.asyncio
async def test_llm_stub_and_prompt_generation():
    """Test prompt building from dialogue logs and calling LLM stub."""
    async with AsyncSessionLocal() as session:
        cadet = User(
            username=f"cadet_prompt_{uuid.uuid4().hex[:6]}",
            password_hash=hash_password("secret"),
            role="CADET",
            full_name="Смирнов Алексей",
            is_active=True,
        )
        session.add(cadet)
        await session.flush()

        # Add exam session with dialogue log
        exam_session = ExamSession(
            cadet_id=cadet.user_id,
            session_type="CALL_SIMULATION",
            status="COMPLETED",
            dialogue_log=[
                {"speaker": "Заявитель", "text": "Помогите, горит квартира на 3 этаже!"},
                {"speaker": "Оператор", "text": "112, слушаю вас. Назовите точный адрес происшествия."},
                {"speaker": "Заявитель", "text": "Улица Ленина, дом 15, кв 44!"},
            ],
        )
        session.add(exam_session)
        await session.flush()

        ticket_result = TicketResult(
            session_id=exam_session.session_id,
            is_passed=True,
            errors_count=1,
            error_details={"routing": "Задержка передачи в пожарную охрану"},
        )
        session.add(ticket_result)
        await session.commit()

        # 1. Collect session data
        data = await collect_cadet_session_data(cadet.user_id, session)
        assert data["cadet_name"] == "Смирнов Алексей"
        assert data["session_count"] >= 1
        assert data["total_dialogue_turns"] == 3
        assert len(data["errors"]) >= 1

        # 2. Build prompt
        prompt = build_cadet_prompt(data)
        assert "Смирнов Алексей" in prompt
        assert "Помогите, горит квартира" in prompt
        assert "Задержка передачи в пожарную охрану" in prompt

        # 3. Call LLM stub (with small sleep for fast tests)
        llm_response = await call_qwen_llm(prompt, sleep_seconds=0.01)
        assert "Экспертный отчет ИИ-аналитика" in llm_response
        assert "Следование регламенту 112" in llm_response

        # 4. End-to-end run_cadet_analysis
        advice = await run_cadet_analysis(
            cadet_id=cadet.user_id,
            db=session,
            sleep_seconds=0.01,
            model="Qwen 3.5 9B",
        )
        assert advice.advice_id is not None
        assert advice.cadet_id == cadet.user_id
        assert "Экспертный отчет ИИ-аналитика" in advice.analysis_text


@pytest.mark.asyncio
async def test_worker_queue_processing():
    """Test AIAnalysisWorker queue enqueue and asynchronous processing."""
    custom_worker = AIAnalysisWorker()

    async with AsyncSessionLocal() as session:
        cadet = User(
            username=f"cadet_q_{uuid.uuid4().hex[:6]}",
            password_hash=hash_password("secret"),
            role="CADET",
            full_name="Иванов Тест",
            is_active=True,
        )
        session.add(cadet)
        await session.commit()
        cadet_id = cadet.user_id

    # Enqueue a job
    job_id = await custom_worker.enqueue(
        job_type="cadet",
        target_id=cadet_id,
        sleep_seconds=0.01,
        model="Qwen 3.5 9B",
    )
    assert job_id is not None
    assert custom_worker.queue.qsize() == 1

    # Process job directly
    job = await custom_worker.queue.get()
    await custom_worker.process_job(job)
    custom_worker.queue.task_done()

    # Verify result was saved to DB
    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(AIStudentAdvice).where(AIStudentAdvice.cadet_id == cadet_id)
        )
        advices = res.scalars().all()
        assert len(advices) == 1
        assert advices[0].model_used == "Qwen 3.5 9B"


@pytest.mark.asyncio
async def test_api_trigger_and_get_student_advice():
    """Test REST API /api/ai-analytics/trigger and /api/ai-analytics/student/{id}."""
    async with AsyncSessionLocal() as session:
        cadet = User(
            username=f"cadet_api_{uuid.uuid4().hex[:6]}",
            password_hash=hash_password("secret"),
            role="CADET",
            full_name="Смирнова Анна",
            is_active=True,
        )
        session.add(cadet)
        await session.commit()
        cadet_id = cadet.user_id

    token = create_access_token(subject=cadet_id, role="CADET")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as client:
        # 1. Trigger analysis synchronously (background=false, sleep_seconds=0.01)
        resp_trigger = await client.post(
            f"/api/ai-analytics/trigger?cadet_id={cadet_id}&background=false&sleep_seconds=0.01"
        )
        assert resp_trigger.status_code == 200
        trigger_data = resp_trigger.json()
        assert trigger_data["status"] == "completed"
        assert trigger_data["target_id"] == cadet_id
        advice_id = trigger_data["advice_id"]

        # 2. Get student advice
        resp_get = await client.get(f"/api/ai-analytics/student/{cadet_id}")
        assert resp_get.status_code == 200
        advices = resp_get.json()
        assert len(advices) >= 1
        found = next((a for a in advices if a["advice_id"] == advice_id), None)
        assert found is not None
        assert found["is_read"] is False
        assert found["cadet_id"] == cadet_id
        assert "Qwen" in found["model_used"]

        # 3. Mark advice as read
        resp_read = await client.patch(f"/api/ai-analytics/advice/{advice_id}/read")
        assert resp_read.status_code == 200
        assert resp_read.json()["is_read"] is True

        # Check DB update
        resp_get_after = await client.get(f"/api/ai-analytics/student/{cadet_id}")
        updated = next(a for a in resp_get_after.json() if a["advice_id"] == advice_id)
        assert updated["is_read"] is True


@pytest.mark.asyncio
async def test_api_group_advice_and_model_info():
    """Test REST API for group analysis and model info."""
    async with AsyncSessionLocal() as session:
        teacher = User(
            username=f"teacher_api_{uuid.uuid4().hex[:6]}",
            password_hash=hash_password("secret"),
            role="TEACHER",
            full_name="Преподаватель Соколов",
            is_active=True,
        )
        group = StudentGroup(
            name=f"Группа Т-76-{uuid.uuid4().hex[:4]}",
            specialization="OPERATOR_112",
        )
        session.add(teacher)
        session.add(group)
        await session.commit()
        teacher_id = teacher.user_id
        group_id = group.group_id

    token = create_access_token(subject=teacher_id, role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test", headers=headers) as client:
        # 1. Trigger group analysis synchronously
        resp_trigger = await client.post(
            f"/api/ai-analytics/trigger?group_id={group_id}&background=false&sleep_seconds=0.01"
        )
        assert resp_trigger.status_code == 200
        data = resp_trigger.json()
        assert data["status"] == "completed"
        assert data["target_type"] == "group"
        group_advice_id = data["advice_id"]

        # 2. Get group advice
        resp_group = await client.get(f"/api/ai-analytics/group/{group_id}")
        assert resp_group.status_code == 200
        reports = resp_group.json()
        assert len(reports) >= 1
        assert reports[0]["group_id"] == group_id

        # 3. Model info endpoint
        resp_info = await client.get("/api/ai-analytics/info")
        assert resp_info.status_code == 200
        info_data = resp_info.json()
        assert info_data["model_name"] == DEFAULT_MODEL_NAME
        assert info_data["filename"] == MODEL_FILENAME
        assert info_data["gguf_url"] == MODEL_GGUF_URL
