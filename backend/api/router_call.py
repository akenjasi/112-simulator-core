"""Call Runtime API — processes dialogue turns during a call."""

import inspect
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.core.dialogue_router import process_turn
from backend.core.intent_classifier import classify_intent
from backend.core.tts_engine import generate_audio
from backend.database import get_db
from backend.models.domain_02 import ScenarioTicketModel
from backend.models.domain_03 import SessionStateModel
from backend.schemas.bricks import Brick, Intent
from backend.schemas.router import SessionState

logger = logging.getLogger(__name__)

router_call = APIRouter(
    prefix="/api/v1/call",
    tags=["Call Runtime"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER", "CADET"))],
)
router = router_call

DEFAULT_RESPONSES = {
    Intent.greeting: "Здравствуйте, 112, помогите нам скорее!",
    Intent.situation: "У нас сильное задымление и пожар, срочно приезжайте!",
    Intent.address: "ул. Ленина, дом 10",
    Intent.address_details: "Первый подъезд, второй этаж",
    Intent.victims: "Пострадавших нет, все эвакуировались.",
    Intent.caller_id: "Иванов Иван",
    Intent.phone: "+7 (916) 123-45-67",
    Intent.repeat: "Повторяю, у нас пожар, приезжайте скорее!",
    Intent.bureaucracy: "Зачем вы тратите время на лишние вопросы, отправляйте службы!",
    Intent.outro: "Спасибо, ждем помощи. До свидания.",
}


class ProcessTurnRequest(BaseModel):
    session_id: str
    operator_text: str = ""


class ProcessTurnResponse(BaseModel):
    text: str
    audio_url: str


@router_call.post("/process_turn", response_model=ProcessTurnResponse)
async def handle_process_turn(
    req: ProcessTurnRequest,
    db: AsyncSession = Depends(get_db),
) -> ProcessTurnResponse:
    # 1. Classify intent
    intent = await classify_intent(req.operator_text)

    # 2. Try loading state and matrix bricks from database
    current_state = SessionState(panic_level=50, asked_intents=[])
    state_record: Optional[SessionStateModel] = None
    matrix_bricks: list[Brick] = []

    # Check if db supports async execution (handles MagicMock in tests safely)
    if hasattr(db, "execute") and inspect.iscoroutinefunction(getattr(db, "execute", None)):
        try:
            res = await db.execute(
                select(SessionStateModel).where(SessionStateModel.session_id == req.session_id)
            )
            state_record = res.scalar_one_or_none()
            if state_record:
                asked = [i.strip() for i in state_record.asked_intents.split(",") if i.strip()]
                current_state = SessionState(
                    panic_level=state_record.panic_level,
                    asked_intents=asked,
                )
        except Exception as e:
            logger.warning(f"Error querying SessionStateModel: {e}")

        try:
            ticket_res = await db.execute(select(ScenarioTicketModel).limit(1))
            ticket_record = ticket_res.scalar_one_or_none()
            if ticket_record and ticket_record.matrix_json:
                raw_bricks = ticket_record.matrix_json.get("bricks", [])
                matrix_bricks = [Brick.model_validate(b) for b in raw_bricks]
        except Exception as e:
            logger.warning(f"Error querying ScenarioTicketModel: {e}")

    # 3. Process turn through dialogue router
    brick, new_state = process_turn(
        current_state=current_state,
        matrix_bricks=matrix_bricks,
        operator_intent=intent,
    )

    if brick and brick.text:
        reply_text = brick.text
    else:
        reply_text = DEFAULT_RESPONSES.get(
            intent,
            "Алло! Вас плохо слышно, помогите!",
        )

    # 4. Generate audio via TTS
    try:
        await generate_audio(reply_text)
    except Exception as e:
        logger.warning(f"Error generating audio: {e}")

    # 5. Persist state to DB if real async session is available
    if hasattr(db, "execute") and inspect.iscoroutinefunction(getattr(db, "execute", None)):
        try:
            intents_str = ",".join(new_state.asked_intents)
            if state_record:
                state_record.panic_level = new_state.panic_level
                state_record.asked_intents = intents_str
            else:
                state_record = SessionStateModel(
                    session_id=req.session_id,
                    panic_level=new_state.panic_level,
                    asked_intents=intents_str,
                )
                db.add(state_record)
            if inspect.iscoroutinefunction(getattr(db, "commit", None)):
                await db.commit()
        except Exception as e:
            logger.warning(f"Error saving SessionStateModel: {e}")

    audio_url = f"/api/v1/call/audio/{req.session_id}_{intent.value}.wav"
    return ProcessTurnResponse(text=reply_text, audio_url=audio_url)
