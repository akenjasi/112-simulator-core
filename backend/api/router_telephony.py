"""Telephony Router (VoIP / SIP PBX Abstraction) — ТЗ 62.

Provides abstraction and mock endpoints for Asterisk PBX (ARI / AMI) integration.
Integrates with physical IP phones (e.g. RTU T16R) via SIP/ARI or browser WebRTC (sip.js).
"""

import asyncio
import logging
import uuid
from typing import Optional, Dict, Any, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.database import get_db
from backend.core.deps import require_role, get_current_user
from backend.models.domain_01 import User
from backend.core.access import require_session
from backend.core.socket_auth import authenticate_socket, validate_socket
from backend.models.domain_03 import ExamSession
from backend.core.telephony_adapter import telephony_adapter

logger = logging.getLogger(__name__)

router_telephony = APIRouter(
    prefix="/api/v2/telephony",
    tags=["VoIP & Telephony"],
)


# ─── Pydantic Schemas ──────────────────────────────────────────────────────────

class StartCallRequest(BaseModel):
    ticket_id: str = Field(..., description="ID билета или сценария для вызова")
    operator_ext: str = Field(default="1002", description="Внутренний SIP-номер оператора (АРМ)")
    session_id: Optional[str] = Field(default=None, description="ID экзаменационной/учебной сессии")


class StartCallResponse(BaseModel):
    call_id: str
    status: str
    ticket_id: str
    operator_ext: str
    session_id: Optional[str] = None
    message: str
    mode: str = "simulation"


class HangupRequest(BaseModel):
    call_id: Optional[str] = Field(default=None, description="ID звонка Asterisk")
    session_id: Optional[str] = Field(default=None, description="ID сессии")
    ticket_id: Optional[str] = Field(default=None, description="ID билета")
    reason: Optional[str] = Field(default="operator_hangup", description="Причина завершения звонка")


class HangupResponse(BaseModel):
    call_id: Optional[str] = None
    session_id: Optional[str] = None
    status: str
    message: str


class PlayAudioRequest(BaseModel):
    call_id: Optional[str] = Field(default=None, description="ID звонка Asterisk")
    session_id: Optional[str] = Field(default=None, description="ID сессии")
    audio_url: Optional[str] = Field(default=None, description="URL или путь к аудиофайлу для воспроизведения")
    text: Optional[str] = Field(default=None, description="Текст реплики заявителя")


class PlayAudioResponse(BaseModel):
    call_id: Optional[str] = None
    session_id: Optional[str] = None
    status: str
    audio_url: Optional[str] = None
    message: str


class TelephonyStatusResponse(BaseModel):
    session_id: str
    call_status: str
    operator_ext: Optional[str] = None
    ticket_id: Optional[str] = None
    call_id: Optional[str] = None


# ─── In-Memory State & WebSocket Manager ──────────────────────────────────────

class TelephonyConnectionManager:
    """Manages real-time WebSocket connections for telephony events."""

    def __init__(self):
        # Maps session_id -> list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # In-memory fast cache of active call states: session_id -> dict
        self.call_states: Dict[str, Dict[str, Any]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        # Socket is authenticated and accepted before registration.
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        logger.info(f"Telephony WS connected for session: {session_id}")

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"Telephony WS disconnected for session: {session_id}")

    async def broadcast_to_session(self, session_id: str, message: dict):
        connections = self.active_connections.get(session_id, [])
        dead_conns = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send telephony WS message to {session_id}: {e}")
                dead_conns.append(ws)
        for ws in dead_conns:
            self.disconnect(session_id, ws)

    def set_state(self, session_id: str, state_data: dict):
        if session_id not in self.call_states:
            self.call_states[session_id] = {}
        self.call_states[session_id].update(state_data)

    def get_state(self, session_id: str) -> Dict[str, Any]:
        return self.call_states.get(
            session_id,
            {"call_status": "IDLE", "operator_ext": "1002"},
        )


telephony_manager = TelephonyConnectionManager()


# ─── Helper: DB State Synchronization ────────────────────────────────────────

async def _update_db_session_call_status(
    db: AsyncSession,
    session_id: Optional[str],
    call_status: str,
    operator_ext: str,
    ticket_id: str,
    call_id: str,
):
    """Updates session state in database if session exists."""
    if not session_id:
        return
    try:
        stmt = select(ExamSession).where(ExamSession.session_id == session_id)
        res = await db.execute(stmt)
        exam_session = res.scalar_one_or_none()
        if exam_session:
            if (exam_session.dynamic_state or {}).get("dds"):
                return
            b_call = dict(exam_session.browser_call or {})
            b_call["call_status"] = call_status
            b_call["operator_ext"] = operator_ext
            b_call["ticket_id"] = ticket_id
            b_call["call_id"] = call_id
            exam_session.browser_call = b_call
            flag_modified(exam_session, "browser_call")

            dyn_state = dict(exam_session.dynamic_state or {})
            dyn_state["call_status"] = call_status
            exam_session.dynamic_state = dyn_state
            flag_modified(exam_session, "dynamic_state")

            await db.commit()
    except Exception as e:
        logger.error(f"Error persisting telephony state in db for {session_id}: {e}")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router_telephony.post("/start_call", response_model=StartCallResponse, dependencies=[Depends(require_role("TEACHER", "CADET"))])
async def start_call(
    req: StartCallRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StartCallResponse:
    """Initiates an incoming call to the operator workstation using Asterisk."""
    if not req.session_id:
        raise HTTPException(422, "A saved session is required")
    session = await require_session(db, current_user, req.session_id)
    if (session.dynamic_state or {}).get("dds"):
        raise HTTPException(409, "Prepared DDS exercises use the DDS phone API")
    if session.ticket_id != req.ticket_id:
        raise HTTPException(409, "Ticket must match the saved session")

    
    if telephony_adapter.enabled in ("true", "1", "yes"):
        raise HTTPException(501, "Real PBX channel lifecycle is not implemented; use simulation mode")
    # Simulator call lifecycle
    ext_call_id = None

    if not ext_call_id:
        # Fallback if Asterisk is unavailable
        logger.warning("Asterisk unavailable, using fallback mock call ID")
        call_id = f"call-{uuid.uuid4().hex[:8]}"
    else:
        call_id = ext_call_id

    session_key = req.session_id or req.ticket_id

    # 1. State: RINGING
    telephony_manager.set_state(session_key, {
        "call_id": call_id,
        "call_status": "RINGING",
        "ticket_id": req.ticket_id,
        "operator_ext": req.operator_ext,
        "session_id": req.session_id,
    })

    # Broadcast RINGING immediately to frontend subscribers
    await telephony_manager.broadcast_to_session(session_key, {
        "type": "CALL_STATUS",
        "status": "RINGING",
        "call_id": call_id,
        "ticket_id": req.ticket_id,
        "operator_ext": req.operator_ext,
        "session_id": req.session_id,
    })

    # Update DB with initial RINGING
    await _update_db_session_call_status(
        db=db,
        session_id=req.session_id,
        call_status="RINGING",
        operator_ext=req.operator_ext,
        ticket_id=req.ticket_id,
        call_id=call_id,
    )

    # 2. Wait for answer event from Asterisk
    if telephony_adapter.connected:
        answered = await telephony_adapter.wait_for_answer(req.operator_ext, timeout=30.0)
        if not answered:
            logger.warning(f"Asterisk wait_for_answer timeout or failed for endpoint {req.operator_ext}, using fallback ANSWERED")
    else:
        # Standalone / simulator mode: smooth 0.5s ringing cadence before answering
        await asyncio.sleep(0.5)
    # 3. State: ANSWERED
    telephony_manager.set_state(session_key, {
        "call_id": call_id,
        "call_status": "ANSWERED",
        "ticket_id": req.ticket_id,
        "operator_ext": req.operator_ext,
        "session_id": req.session_id,
    })

    # Broadcast ANSWERED to frontend subscribers
    await telephony_manager.broadcast_to_session(session_key, {
        "type": "CALL_STATUS",
        "status": "ANSWERED",
        "call_id": call_id,
        "ticket_id": req.ticket_id,
        "operator_ext": req.operator_ext,
        "session_id": req.session_id,
    })

    # Update DB with ANSWERED
    await _update_db_session_call_status(
        db=db,
        session_id=req.session_id,
        call_status="ANSWERED",
        operator_ext=req.operator_ext,
        ticket_id=req.ticket_id,
        call_id=call_id,
    )

    return StartCallResponse(
        call_id=call_id,
        status="ANSWERED",
        ticket_id=req.ticket_id,
        operator_ext=req.operator_ext,
        session_id=req.session_id,
        message="Simulated call started; no physical SIP call was confirmed",
        mode="simulation",
    )


@router_telephony.post("/hangup", response_model=HangupResponse, dependencies=[Depends(require_role("TEACHER", "CADET"))])
async def hangup(
    req: HangupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HangupResponse:
    """Terminates active call on PBX and notifies clients."""
    if not req.session_id:
        raise HTTPException(422, "A saved session is required")
    session = await require_session(db, current_user, req.session_id)
    if (session.dynamic_state or {}).get("dds"):
        raise HTTPException(409, "Prepared DDS exercises use the DDS phone API")
    state = telephony_manager.get_state(req.session_id)
    if req.call_id and state.get("call_id") != req.call_id:
        raise HTTPException(403, "Call does not belong to this session")

    session_key = req.session_id or req.ticket_id or (req.call_id or "default")
    current_state = telephony_manager.get_state(session_key)

    telephony_manager.set_state(session_key, {
        "call_status": "HANGUP",
        "hangup_reason": req.reason,
    })

    # Broadcast HANGUP to frontend
    await telephony_manager.broadcast_to_session(session_key, {
        "type": "CALL_STATUS",
        "status": "HANGUP",
        "call_id": req.call_id or current_state.get("call_id"),
        "session_id": req.session_id,
        "reason": req.reason,
    })

    # Update DB state
    await _update_db_session_call_status(
        db=db,
        session_id=req.session_id,
        call_status="HANGUP",
        operator_ext=current_state.get("operator_ext", "1002"),
        ticket_id=req.ticket_id or current_state.get("ticket_id", ""),
        call_id=req.call_id or current_state.get("call_id", ""),
    )

    return HangupResponse(
        call_id=req.call_id,
        session_id=req.session_id,
        status="HANGUP",
        message="Call terminated successfully",
    )


@router_telephony.post("/play_audio", response_model=PlayAudioResponse, dependencies=[Depends(require_role("TEACHER", "CADET"))])
async def play_audio(
    req: PlayAudioRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayAudioResponse:
    """Plays audio into the active channel (e.g. citizen dialogue turn / TTS playback)."""
    if not req.session_id:
        raise HTTPException(422, "A saved session is required")
    session = await require_session(db, current_user, req.session_id)
    if (session.dynamic_state or {}).get("dds"):
        raise HTTPException(409, "Prepared DDS exercises use the DDS phone API")
    state = telephony_manager.get_state(req.session_id)
    if req.call_id and state.get("call_id") != req.call_id:
        raise HTTPException(403, "Call does not belong to this session")

    session_key = req.session_id or (req.call_id or "default")

    # Broadcast PLAY_AUDIO to frontend
    await telephony_manager.broadcast_to_session(session_key, {
        "type": "PLAY_AUDIO",
        "audio_url": req.audio_url,
        "text": req.text,
        "call_id": req.call_id,
        "session_id": req.session_id,
    })

    return PlayAudioResponse(
        call_id=req.call_id,
        session_id=req.session_id,
        status="PLAYING",
        audio_url=req.audio_url,
        message="Audio playback command received and dispatched",
    )


@router_telephony.get("/status/{session_id}", response_model=TelephonyStatusResponse)
async def get_telephony_status(
    session_id: str,
    current_user: User = Depends(require_role("TEACHER", "CADET")),
    db: AsyncSession = Depends(get_db),
) -> TelephonyStatusResponse:
    """Gets current telephony state for a session (WebSocket fallback polling)."""
    await require_session(db, current_user, session_id)
    state = telephony_manager.get_state(session_id)
    call_status = state.get("call_status", "IDLE")

    # If in-memory is IDLE, check database
    if call_status == "IDLE":
        stmt = select(ExamSession).where(ExamSession.session_id == session_id)
        res = await db.execute(stmt)
        exam_session = res.scalar_one_or_none()
        if exam_session and exam_session.browser_call:
            call_status = exam_session.browser_call.get("call_status", "IDLE")

    return TelephonyStatusResponse(
        session_id=session_id,
        call_status=call_status,
        operator_ext=state.get("operator_ext", "1002"),
        ticket_id=state.get("ticket_id"),
        call_id=state.get("call_id"),
    )


# ─── WebSocket Endpoint ───────────────────────────────────────────────────────

@router_telephony.websocket("/ws/{session_id}")
async def telephony_websocket(
    websocket: WebSocket,
    session_id: str,
):
    """Real-time WebSocket endpoint for receiving telephony events (RINGING, ANSWERED, HANGUP)."""
    authorized = await authenticate_socket(websocket, session_id)
    if not authorized:
        return
    socket_token, _ = authorized
    await telephony_manager.connect(session_id, websocket)
    try:
        # Send current status immediately upon connection
        current_state = telephony_manager.get_state(session_id)
        await websocket.send_json({
            "type": "CONNECTED",
            "session_id": session_id,
            "status": current_state.get("call_status", "IDLE"),
            "operator_ext": current_state.get("operator_ext", "1002"),
        })

        while True:
            # Keep connection alive & accept any client command
            data = await websocket.receive_json()
            await validate_socket(socket_token, session_id)
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "get_status":
                state = telephony_manager.get_state(session_id)
                await websocket.send_json({
                    "type": "STATUS",
                    "session_id": session_id,
                    "status": state.get("call_status", "IDLE"),
                })
    except HTTPException:
        await websocket.close(code=1008)
        telephony_manager.disconnect(session_id, websocket)
    except WebSocketDisconnect:
        telephony_manager.disconnect(session_id, websocket)
    except Exception as e:
        logger.warning(f"Telephony WebSocket error for session {session_id}: {e}")
        telephony_manager.disconnect(session_id, websocket)
