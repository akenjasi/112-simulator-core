import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.main import app
from backend.core.evaluator import normalize_text, evaluate_ticket
from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal, engine
from backend.models.base import Base
from backend.models.domain_01 import User, UserActionLog
from backend.models.domain_04 import TicketResult
from backend.schemas.domain_04 import (
    TicketEvaluationRequest,
    TicketEvaluationResult,
    TicketResultUpdate,
)


@pytest.fixture
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def test_normalize_text():
    assert normalize_text("Ул. Ленина, д. 15!") == "ул ленина д 15"
    assert normalize_text("  ДТП   с пострадавшими ") == "дтп с пострадавшими"


def test_evaluate_ticket_perfect_match():
    req = TicketEvaluationRequest(
        etalon_services=["01", "02"],
        etalon_fields={"street": "Ленина", "house": "10"},
        student_services=["02", "01"],  # Порядок не важен
        student_fields={"street": "ул. ленина", "house": "дом 10"},
        error_limit=0,
    )

    result = evaluate_ticket(req)

    assert result.is_passed is True
    assert result.errors_count == 0
    assert len(result.error_details) == 0


def test_evaluate_ticket_with_errors():
    req = TicketEvaluationRequest(
        etalon_services=["01", "02", "03"],
        etalon_fields={"street": "Пушкина"},
        student_services=["01"],  # Забыл 02 и 03
        student_fields={"street": "Лермонтова"},  # Ошибка в адресе
        error_limit=1,
    )

    result = evaluate_ticket(req)

    # 1 ошибка за службы (не все вызваны), 1 ошибка за адрес. Итого 2 ошибки. Лимит 1.
    assert result.is_passed is False
    assert result.errors_count == 2
    assert "services" in result.error_details
    assert "street" in result.error_details


def test_evaluate_ticket_within_limits():
    req = TicketEvaluationRequest(
        etalon_services=["01"],
        etalon_fields={"street": "Пушкина"},
        student_services=["01"],
        student_fields={"street": "Неизвестно"},  # 1 ошибка
        error_limit=2,  # Лимит позволяет 2 ошибки
    )

    result = evaluate_ticket(req)

    assert result.is_passed is True  # Сдал, т.к. ошибка укладывается в лимит
    assert result.errors_count == 1


def test_evaluate_ticket_extra_services():
    req = TicketEvaluationRequest(
        etalon_services=["01"],
        etalon_fields={"reason": "пожар"},
        student_services=["01", "02"],  # 02 лишняя служба
        student_fields={"reason": "пожар"},
        error_limit=0,
    )
    result = evaluate_ticket(req)
    assert result.is_passed is False
    assert result.errors_count == 1
    assert "Лишние службы" in result.error_details["services"]


def test_ticket_result_update_schema():
    update = TicketResultUpdate(
        is_passed=True,
        teacher_comment="Зачтено после пояснений курсанта",
    )
    assert update.is_passed is True
    assert update.teacher_comment == "Зачтено после пояснений курсанта"


@pytest.mark.asyncio
async def test_ticket_result_model_appeal(setup_db):
    async with AsyncSessionLocal() as session:
        tr = TicketResult(
            ticket_id="ticket-123",
            is_passed=False,
            errors_count=2,
            error_details={"street": "ошибка адреса", "services": "не вызвана 03"},
        )
        session.add(tr)
        await session.commit()
        await session.refresh(tr)

        assert tr.is_appealed is False
        assert tr.teacher_comment is None
        assert tr.is_passed is False

        # Апелляция преподавателя
        tr.is_passed = True
        tr.is_appealed = True
        tr.teacher_comment = "Ошибки признаны несущественными"
        await session.commit()
        await session.refresh(tr)

        assert tr.is_appealed is True
        assert tr.teacher_comment == "Ошибки признаны несущественными"
        assert tr.is_passed is True


@pytest.mark.asyncio
async def test_appeal_endpoint_and_audit_logging(setup_db):
    # Создаем преподавателя
    async with AsyncSessionLocal() as session:
        teacher = User(
            username="teacher_evaluator",
            password_hash=hash_password("teacher_pwd"),
            role="TEACHER",
        )
        session.add(teacher)
        await session.flush()
        teacher_id = teacher.user_id

        # Создаем результат проверки билета
        tr = TicketResult(
            ticket_id="ticket-appeal-42",
            is_passed=False,
            errors_count=2,
            error_details={"services": "не все службы вызваны"},
        )
        session.add(tr)
        await session.commit()
        await session.refresh(tr)
        result_id = tr.result_id

    token = create_access_token(subject=str(teacher_id), role="TEACHER")
    headers = {"Authorization": f"Bearer {token}"}

    update_payload = TicketResultUpdate(
        is_passed=True,
        teacher_comment="Апелляция удовлетворена: курсант пояснил выбор служб",
    )

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.patch(
            f"/api/v2/ticket-results/{result_id}/appeal",
            json=update_payload.model_dump(),
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_passed"] is True
        assert data["is_appealed"] is True
        assert data["teacher_comment"] == "Апелляция удовлетворена: курсант пояснил выбор служб"

    # Проверяем, что AuditMiddleware зафиксировал апелляцию в UserActionLog
    async with AsyncSessionLocal() as session:
        logs_res = await session.execute(
            select(UserActionLog).where(UserActionLog.user_id == str(teacher_id))
        )
        logs = logs_res.scalars().all()
        assert len(logs) >= 1
        assert "PATCH" in logs[0].action
        assert f"/api/v2/ticket-results/{result_id}/appeal" in logs[0].action
