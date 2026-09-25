import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import TicketResult, EvaluationResult, IncidentCard
from backend.models.domain_02 import GeneratedTicket
from backend.models.domain_01 import User
from backend.core.security import decode_access_token
from sqlalchemy import select


def get_user_id_from_client(client: AsyncClient) -> str:
    auth_header = client.headers.get("Authorization", "")
    token = auth_header.split()[1]
    payload = decode_access_token(token)
    return payload["sub"]


@pytest.mark.asyncio
async def test_get_student_stats(cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка эндпоинта статистики студента GET /api/v1/students/me/stats.
    """
    user_id = get_user_id_from_client(cadet_auth_client)

    gt1 = GeneratedTicket(ticket_id="ticket-1", category="Пожары", plot="test", status="active")
    db_session.add(gt1)
    await db_session.commit()

    assignment1 = Assignment(
        target_role="OPERATOR_112",
        session_type="CALL_SIMULATION",
        status="COMPLETED",
        cadet_id=user_id,
        categories=["Пожары"],
    )
    db_session.add(assignment1)
    await db_session.commit()

    session1 = ExamSession(
        assignment_id=assignment1.assignment_id,
        cadet_id=user_id,
        session_type="CALL_SIMULATION",
        status="COMPLETED",
        categories=["Пожары"],
    )
    db_session.add(session1)
    await db_session.commit()

    tr1 = TicketResult(
        session_id=session1.session_id,
        ticket_id=gt1.ticket_id,
        status="completed",
        score_total=80.0,
        is_passed=True,
    )
    db_session.add(tr1)
    await db_session.commit()

    response = await cadet_auth_client.get("/api/v1/students/me/stats?role=OPERATOR_112")
    assert response.status_code == 200

    data = response.json()
    assert "average_score" in data
    assert "lessons_completed" in data
    assert "competence_matrix" in data
    assert "top_errors" in data
    assert "cards_solved" in data
    assert "average_score_7_days" in data
    assert "score_trend" in data
    assert "average_processing_time_seconds" in data
    assert "time_trend" in data
    assert "service_accuracy_percent" in data

    assert data["lessons_completed"] >= 1
    assert data["cards_solved"] >= 1
    assert data["average_score"] == 80.0
    assert data["average_score_7_days"] == 80.0
    assert isinstance(data["score_trend"], (int, float))
    assert isinstance(data["average_processing_time_seconds"], int)
    assert isinstance(data["time_trend"], int)
    assert isinstance(data["service_accuracy_percent"], (int, float))

    radar = data["competence_matrix"]
    assert isinstance(radar, list)
    assert len(radar) >= 1
    assert any(item["category"] == "Пожары" and item["score"] == 80.0 for item in radar)

    # Check top_errors structured format and separation of fatal / non-fatal
    errors = data["top_errors"]
    assert isinstance(errors, list)
    assert len(errors) >= 1
    for err in errors:
        assert "text" in err
        assert "frequency_percent" in err
        assert "is_fatal" in err
        assert isinstance(err["frequency_percent"], int)
        assert isinstance(err["is_fatal"], bool)

    has_fatal = any(e["is_fatal"] is True for e in errors)
    has_minor = any(e["is_fatal"] is False for e in errors)
    assert has_fatal or has_minor


@pytest.mark.asyncio
async def test_get_student_lessons(cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка эндпоинта истории уроков GET /api/v1/students/me/lessons.
    """
    user_id = get_user_id_from_client(cadet_auth_client)

    sess = ExamSession(
        cadet_id=user_id,
        session_type="CALL_SIMULATION",
        status="COMPLETED",
        categories=["ДТП"],
    )
    db_session.add(sess)
    await db_session.commit()

    tr = TicketResult(
        session_id=sess.session_id,
        ticket_id="ticket-demo",
        status="completed",
        score_total=95.0,
        is_passed=True,
    )
    db_session.add(tr)
    await db_session.commit()

    response = await cadet_auth_client.get("/api/v1/students/me/lessons")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    first_item = data[0]
    assert "session_id" in first_item
    assert "status" in first_item
    assert "tickets" in first_item
    assert isinstance(first_item["tickets"], list)
    assert len(first_item["tickets"]) >= 1


@pytest.mark.asyncio
async def test_demo_session_creation(cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка эндпоинта создания демо-сессии POST /api/v1/sessions/demo для OPERATOR_112.
    """
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
    assert "/operator?" in data["redirect_url"]

    session_id = data["session_id"]
    sess_res = await db_session.execute(select(ExamSession).where(ExamSession.session_id == session_id))
    exam_session = sess_res.scalar_one_or_none()

    assert exam_session is not None
    assert exam_session.status == "ACTIVE"


@pytest.mark.asyncio
async def test_demo_session_creation_dds(cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка создания демо-сессии для DISPATCHER_DDS с предзаполненной IncidentCard.
    """
    gt = GeneratedTicket(category="Пожары", subcategory="Жилой сектор", complexity=1, plot="Fire in apartment", status="active")
    db_session.add(gt)
    await db_session.commit()

    payload = {"target_role": "DISPATCHER_DDS"}
    response = await cadet_auth_client.post("/api/v1/sessions/demo", json=payload)

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()

    assert data["role"] == "DISPATCHER_DDS"
    assert "/dds?" in data["redirect_url"]

    # Проверяем карточку инцидента
    session_id = data["session_id"]
    card_res = await db_session.execute(select(IncidentCard).where(IncidentCard.session_id == session_id))
    card = card_res.scalar_one_or_none()
    assert card is not None
    assert card.card_origin == "112_CALL"

    # Выбранный билет должен соответствовать категории карточки
    ticket_res = await db_session.execute(select(GeneratedTicket).where(GeneratedTicket.id == data["ticket_id"]))
    chosen_ticket = ticket_res.scalar_one_or_none()
    assert chosen_ticket is not None
    assert card.filled_data.get("category") == chosen_ticket.category


@pytest.mark.asyncio
async def test_student_id_and_no_avatar_url(auth_client: AsyncClient, cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка удаления avatar_url из API и генерации/сохранения короткого student_id формата СМ1-12.
    """
    username = f"student_test_{pytest.__file__[-6:]}@example.com"
    create_payload = {
        "username": username,
        "password": "secure_password_123",
        "role": "CADET",
        "full_name": "Иванов Иван Иванович",
        "student_id": "СМ1-12",
    }
    res = await auth_client.post("/api/admin/users", json=create_payload)
    assert res.status_code == 200
    user_data = res.json()
    assert "avatar_url" not in user_data
    assert user_data["student_id"] == "СМ1-12"
    assert user_data["full_name"] == "Иванов Иван Иванович"

    # Проверяем PATCH student_id
    patch_res = await auth_client.patch(
        f"/api/admin/users/{user_data['user_id']}",
        json={"student_id": "СМ1-99"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["student_id"] == "СМ1-99"
    assert "avatar_url" not in patch_res.json()

    # Проверяем /api/v1/users/me
    me_res = await cadet_auth_client.get("/api/v1/users/me")
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert "avatar_url" not in me_data
    assert "student_id" in me_data
    assert me_data["student_id"] == "СМ1-12"


@pytest.mark.asyncio
async def test_demo_session_no_tickets_404(cadet_auth_client: AsyncClient, db_session: AsyncSession):
    """
    Проверка возврата 404, если в GeneratedTicket нет билетов.
    """
    from sqlalchemy import delete
    await db_session.execute(delete(GeneratedTicket))
    await db_session.commit()

    res = await cadet_auth_client.post("/api/v1/sessions/demo", json={"target_role": "OPERATOR_112"})
    assert res.status_code == 404
    assert "билеты" in res.json()["detail"].lower()

