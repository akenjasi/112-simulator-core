"""Authenticate browser sockets using a first-frame credential, never a URL token."""
import asyncio
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from backend.core.access import require_session
from backend.core.config import cors_origins
from backend.core.deps import get_current_user
from backend.database import AsyncSessionLocal


async def validate_socket(token, session_id):
    async with AsyncSessionLocal() as db:
        user = await get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), db)
        if user.role not in ("TEACHER", "CADET"):
            raise HTTPException(403, "Call access denied")
        session = await require_session(db, user, session_id)
        if (session.dynamic_state or {}).get("dds"):
            raise HTTPException(409, "Prepared DDS exercises use the DDS phone API")
        return session


async def authenticate_socket(websocket, session_id):
    origin = websocket.headers.get("origin")
    own_origin = ("https" if websocket.url.scheme == "wss" else "http") + "://" + websocket.headers.get("host", "")
    if origin and origin not in {*cors_origins(), own_origin}:
        await websocket.close(code=1008)
        return None
    await websocket.accept()
    try:
        frame = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        token = frame.get("token") if frame.get("type") == "auth" else None
        if not isinstance(token, str) or len(token) > 8192:
            raise HTTPException(401, "Authentication required")
        session = await validate_socket(token, session_id)
        return token, session
    except (HTTPException, ValueError, TypeError, AttributeError, asyncio.TimeoutError):
        await websocket.close(code=1008)
        return None
