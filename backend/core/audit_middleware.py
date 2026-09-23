"""Audit middleware for logging mutating requests."""

import logging
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from backend.core.security import decode_access_token
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import UserActionLog

logger = logging.getLogger(__name__)

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _extract_token(auth_header: Optional[str]) -> Optional[str]:
    if not auth_header:
        return None
    parts = auth_header.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    if len(parts) == 1:
        return parts[0]
    return None


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method.upper() in MUTATING_METHODS:
            try:
                token = _extract_token(request.headers.get("authorization"))
                if token:
                    payload = None
                    try:
                        payload = decode_access_token(token)
                    except Exception as err:
                        logger.debug("Failed to decode JWT token: %s", err)

                    if payload:
                        user_id = payload.get("sub") or payload.get("user_id")
                        if user_id:
                            role = payload.get("role")
                            action = f"{request.method.upper()} {request.url.path}"
                            client_ip = request.client.host if request.client else None

                            async with AsyncSessionLocal() as session:
                                log_entry = UserActionLog(
                                    user_id=str(user_id),
                                    role=role,
                                    action=action,
                                    ip_address=client_ip,
                                )
                                session.add(log_entry)
                                await session.commit()
            except Exception as exc:
                logger.warning("Failed to record audit log: %s", exc)

        return await call_next(request)
