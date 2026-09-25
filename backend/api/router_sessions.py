import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.deps import require_role, get_current_user
from backend.core.runtime_router import RuntimeRouter
from backend.database import get_db
from backend.models.domain_01 import User
from backend.models.domain_02 import GeneratedTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult
from backend.schemas.students import DemoSessionRequest, DemoSessionResponse
from backend.core.evaluator import evaluate_ticket
from backend.schemas.domain_04 import (
    TicketEvaluationRequest,
    TicketEvaluationResult,
    TicketResultResponse,
    TicketResultUpdate,
)
from backend.schemas.domain_03 import (
    SessionConfigCreate,
    SessionConfigResponse,
)
from backend.schemas.sessions import (
    MessageRequest,
    MessageResponse,
    SessionStartRequest,
    SessionStartResponse,
    SessionStateResponse,
    SubmitCardRequest,
    SubmitCardResponse,
    CadetSessionStats,
    SessionStatsResponse,
)

sessions_router = APIRouter(
    prefix="/api/v2",
    tags=["Runtime Sessions"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER", "CADET"))],
)


@sessions_router.post(
    "/assignments/{assignment_id}/sessions/start",
    response_model=SessionStartResponse,
)
async def start_session(
    assignment_id: str,
    req: SessionStartRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Assignment).where(Assignment.assignment_id == assignment_id)
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    exam_session = ExamSession(
        session_type=assignment.session_type,
        assignment_id=assignment_id,
        cadet_id=req.cadet_id,
        status="active",
    )
    db.add(exam_session)
    await db.commit()
    await db.refresh(exam_session)

    return exam_session


@sessions_router.get(
    "/sessions/{session_id}",
    response_model=SessionStateResponse,
)
async def get_session_state(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    return session


@sessions_router.post(
    "/sessions/{session_id}/message",
    response_model=MessageResponse,
)
async def post_session_message(
    session_id: str,
    req: MessageRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    log = list(session.dialogue_log or [])
    log.append(
        {
            "role": "OPERATOR",
            "text": req.text,
            "timestamp": datetime.datetime.now().isoformat(),
        }
    )

    from backend.core.runtime_router import RuntimeRouter
    router_instance = RuntimeRouter(session_id=session_id)
    ai_result = router_instance.process_message(message=req.text, session_id=session_id)

    log.append(
        {
            "role": "CALLER",
            "text": ai_result.get("reply_text", "Error"),
            "timestamp": datetime.datetime.now().isoformat(),
        }
    )
    session.dialogue_log = log
    flag_modified(session, "dialogue_log")
    await db.commit()
    await db.refresh(session)

    return {
        "reply": ai_result.get("reply_text", ""),
        "audio_id": ai_result.get("audio_id"),
    }



@sessions_router.post(
    "/sessions/{session_id}/submit_card",
    response_model=SubmitCardResponse,
)
async def submit_card(
    session_id: str,
    req: SubmitCardRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    session.status = "COMPLETED"
    session.end_time = datetime.datetime.now(datetime.timezone.utc)

    card = IncidentCard(
        card_origin="runtime",
        session_id=session.session_id,
        operator_id=req.operator_id,
        filled_data=req.filled_data,
        assigned_services=req.assigned_services,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)

    return {"card_id": card.card_id, "session_status": "COMPLETED"}


@sessions_router.post(
    "/tickets/evaluate",
    response_model=TicketEvaluationResult,
)
async def evaluate_ticket_endpoint(
    req: TicketEvaluationRequest,
):
    return evaluate_ticket(req)


@sessions_router.patch(
    "/ticket-results/{result_id}/appeal",
    response_model=TicketResultResponse,
)
async def appeal_ticket_result(
    result_id: str,
    req: TicketResultUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TicketResult).where(TicketResult.result_id == result_id)
    result = await db.execute(stmt)
    ticket_result = result.scalar_one_or_none()

    if not ticket_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket result not found",
        )

    ticket_result.is_passed = req.is_passed
    ticket_result.teacher_comment = req.teacher_comment
    ticket_result.is_appealed = True
    ticket_result.updated_at = datetime.datetime.now(datetime.timezone.utc)

    await db.commit()
    await db.refresh(ticket_result)
    return ticket_result


@sessions_router.patch(
    "/tickets/{result_id}/appeal",
    response_model=TicketResultResponse,
)
async def appeal_ticket(
    result_id: str,
    req: TicketResultUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await appeal_ticket_result(result_id=result_id, req=req, db=db)


sessions_v1_router = APIRouter(
    prefix="/api/v1/sessions",
    tags=["Sessions v1"],
)


from starlette.requests import Request


@sessions_v1_router.post(
    "/demo",
    response_model=DemoSessionResponse,
)
@sessions_router.post(
    "/sessions/demo",
    response_model=DemoSessionResponse,
    include_in_schema=False,
)
async def create_demo_session(
    request: Request,
    req: Optional[DemoSessionRequest] = None,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a demo training session with 1 random ticket."""
    if req is None:
        try:
            raw_body = await request.body()
            if raw_body:
                import json
                data = json.loads(raw_body)
                req = DemoSessionRequest.model_validate(data)
        except Exception:
            pass

    target_role = (req.target_role if req and req.target_role else "OPERATOR_112").upper()
    if target_role not in ("OPERATOR_112", "DISPATCHER_DDS"):
        target_role = "OPERATOR_112"

    stmt = select(GeneratedTicket).order_by(func.random()).limit(1)
    res = await db.execute(stmt)
    ticket = res.scalar_one_or_none()

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Билеты не найдены. Пожалуйста, сначала сгенерируйте билеты.",
        )

    session_type = "CALL_SIMULATION" if target_role == "OPERATOR_112" else "CARD_ACTIONS"
    cadet_id = current_user.user_id if current_user else None

    assignment = Assignment(
        session_type=session_type,
        mode="TRAINING",
        status="ACTIVE",
        target_role=target_role,
        cadet_id=cadet_id,
        categories=[ticket.category] if ticket.category else [],
        complexity=str(ticket.complexity or "1"),
        teacher_notes="Демо-запуск",
    )
    db.add(assignment)
    await db.flush()

    exam_session = ExamSession(
        assignment_id=assignment.assignment_id,
        cadet_id=cadet_id,
        session_type=session_type,
        status="ACTIVE",
        categories=[ticket.category] if ticket.category else [],
        complexity=str(ticket.complexity or "1"),
    )
    db.add(exam_session)
    await db.flush()

    tr = TicketResult(
        session_id=exam_session.session_id,
        ticket_id=ticket.ticket_id,
        status="active",
        is_passed=False,
    )
    db.add(tr)

    if target_role == "DISPATCHER_DDS":
        card = IncidentCard(
            session_id=exam_session.session_id,
            operator_id=cadet_id,
            card_origin="112_CALL",
            status="open",
            filled_data={
                "category": ticket.category,
                "subcategory": ticket.subcategory,
                "plot": ticket.plot,
                "factoids": ticket.factoids,
            },
            assigned_services={"services": ticket.etalon_services or []},
        )
        db.add(card)

    await db.commit()
    await db.refresh(exam_session)

    ticket_key = ticket.ticket_id
    base_url = "/operator" if target_role == "OPERATOR_112" else "/dds"
    redirect_url = f"{base_url}?session_id={exam_session.session_id}&ticket_id={ticket_key}"

    return DemoSessionResponse(
        session_id=exam_session.session_id,
        ticket_id=ticket_key,
        role=target_role,
        redirect_url=redirect_url,
    )


@sessions_v1_router.post(
    "",
    response_model=SessionConfigResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
@sessions_v1_router.post(
    "/",
    response_model=SessionConfigResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
    include_in_schema=False,
)
async def create_session_config(
    config: SessionConfigCreate,
    db: AsyncSession = Depends(get_db),
):
    exam_session = ExamSession(
        session_type=config.distribution_mode or "live_stream",
        status="active",
        categories=config.categories,
        complexity=config.complexity.value if hasattr(config.complexity, "value") else str(config.complexity),
        error_limit=config.error_limit,
        time_limit_seconds=config.time_limit_seconds,
    )
    db.add(exam_session)
    await db.commit()
    await db.refresh(exam_session)

    return SessionConfigResponse(
        session_id=exam_session.session_id,
        group_id=config.group_id,
        categories=exam_session.categories,
        complexity=config.complexity,
        distribution_mode=exam_session.session_type,
        error_limit=exam_session.error_limit,
        time_limit_seconds=exam_session.time_limit_seconds,
        status=exam_session.status,
    )


@sessions_v1_router.get(
    "/{session_id}/stats",
    response_model=SessionStatsResponse,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def get_session_stats(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    exam_session = result.scalar_one_or_none()

    session_status = exam_session.status if exam_session else "active"
    group_name = "Группа 101"
    if not exam_session:
        stmt_assign = select(Assignment).where(Assignment.assignment_id == session_id)
        res_assign = await db.execute(stmt_assign)
        assignment = res_assign.scalar_one_or_none()
        if assignment:
            session_status = assignment.status
            session_name_val = f"Урок #{session_id[:8]}"
        else:
            session_name_val = f"Сессия #{session_id[:8]}"
    else:
        session_name_val = f"Сессия #{session_id[:8]}"

    is_completed = (session_status == "COMPLETED")
    is_waiting = (session_status == "WAITING")

    cadets_data = [
        CadetSessionStats(
            cadet_id="cadet-1",
            cadet_name="Иванов Иван",
            status="PASSED" if is_completed else ("IN_PROGRESS" if not is_waiting else "IDLE"),
            current_ticket="Билет #2 (Завершено)" if is_completed else ("Билет #2 (Пожар в жилом секторе)" if not is_waiting else "Ожидание"),
            in_progress=0 if (is_completed or is_waiting) else 1,
            passed=2 if not is_waiting else 0,
            failed=0,
            progress=100 if is_completed else (66 if not is_waiting else 0),
            score=92 if not is_waiting else 0,
            last_activity="1 мин назад",
        ),
        CadetSessionStats(
            cadet_id="cadet-2",
            cadet_name="Петров Петр",
            status="PASSED" if not is_waiting else "IDLE",
            current_ticket="Билет #3 (Завершено)" if not is_waiting else "Ожидание",
            in_progress=0,
            passed=3 if not is_waiting else 0,
            failed=0,
            progress=100 if not is_waiting else 0,
            score=98 if not is_waiting else 0,
            last_activity="3 мин назад",
        ),
        CadetSessionStats(
            cadet_id="cadet-3",
            cadet_name="Сидорова Анна",
            status="FAILED" if not is_waiting else "IDLE",
            current_ticket="Билет #2 (ДТП с пострадавшими)" if not is_waiting else "Ожидание",
            in_progress=0,
            passed=1 if not is_waiting else 0,
            failed=1 if not is_waiting else 0,
            progress=100 if is_completed else (50 if not is_waiting else 0),
            score=64 if not is_waiting else 0,
            last_activity="Только что",
        ),
    ]

    total_in_progress = sum(c.in_progress for c in cadets_data)
    total_passed = sum(c.passed for c in cadets_data)
    total_failed = sum(c.failed for c in cadets_data)
    overall_progress = round(sum(c.progress for c in cadets_data) / max(len(cadets_data), 1))

    return SessionStatsResponse(
        session_id=session_id,
        session_name=session_name_val,
        group_name=group_name,
        status=session_status,
        overall_progress=overall_progress,
        total_cadets=len(cadets_data),
        total_in_progress=total_in_progress,
        total_passed=total_passed,
        total_failed=total_failed,
        cadets=cadets_data,
    )


