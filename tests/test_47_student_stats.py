import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import TicketResult, EvaluationResult
from backend.models.domain_02 import GeneratedTicket
from backend.models.domain_01 import User
from sqlalchemy import select

@pytest.mark.asyncio
async def test_get_student_stats(cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка эндпоинта статистики студента GET /api/v1/students/me/stats.
    """
    # 1. Подготавливаем данные
    user_res = await db_session.execute(select(User).where(User.username == "ivanov@test.com"))
    user = user_res.scalar_one_or_none()
    if not user:
        pytest.skip("CADET user ivanov@test.com not found in DB")
        
    session1 = ExamSession(
        assignment_id="test-assign-1",
        cadet_id=user.user_id,
        session_type="CALL_SIMULATION",
        status="COMPLETED"
    )
    db_session.add(session1)
    await db_session.commit()
    
    tr1 = TicketResult(
        session_id=session1.session_id,
        status="completed",
        score_total=80.0
    )
    db_session.add(tr1)
    await db_session.commit()
    
    # Мок билета для radar_chart
    gt1 = GeneratedTicket(ticket_id="ticket-1", category="Пожары", plot="test", status="active")
    db_session.add(gt1)
    await db_session.commit()
    
    tr1.ticket_id = gt1.ticket_id
    db_session.add(tr1)
    await db_session.commit()

    # 2. Вызов API
    response = await cadet_auth_client.get("/api/v1/students/me/stats?role=OPERATOR_112")
    assert response.status_code == 200
    
    data = response.json()
    assert "average_score" in data
    assert "lessons_completed" in data
    assert "competence_matrix" in data
    assert "top_errors" in data
    
    # Проверка, что уроки посчитаны
    assert data["lessons_completed"] >= 1
    
    # Проверка радара
    radar = data["competence_matrix"]
    assert isinstance(radar, list)

@pytest.mark.asyncio
async def test_demo_session_creation(cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка эндпоинта создания демо-сессии POST /api/v1/sessions/demo.
    """
    # Добавим хотя бы 1 билет в БД, чтобы демо-запуск мог его выбрать
    gt = GeneratedTicket(category="ДТП", subcategory="Авария", complexity=2, plot="Demo plot", status="active")
    db_session.add(gt)
    await db_session.commit()
    
    payload = {"target_role": "OPERATOR_112"}
    response = await cadet_auth_client.post("/api/v1/sessions/demo", json=payload)
    
    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()
    
    assert "session_id" in data
    assert "ticket_id" in data
    assert "role" in data
    assert data["role"] == "OPERATOR_112"
    assert "redirect_url" in data
    
    # Проверяем, что ExamSession действительно создалась
    session_id = data["session_id"]
    sess_res = await db_session.execute(select(ExamSession).where(ExamSession.session_id == session_id))
    exam_session = sess_res.scalar_one_or_none()
    
    assert exam_session is not None
    assert exam_session.status == "ACTIVE"

