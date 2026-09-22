import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.runtime_router import RuntimeRouter
from backend.database import get_db
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard
from backend.schemas.sessions import (
    MessageRequest,
    MessageResponse,
    SessionStartRequest,
    SessionStartResponse,
    SessionStateResponse,
    SubmitCardRequest,
    SubmitCardResponse,
)

sessions_router = APIRouter(prefix="/api/v2", tags=["Runtime Sessions"])


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

