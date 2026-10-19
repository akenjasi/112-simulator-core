"""Audit middleware for logging mutating requests."""

import logging
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import UserActionLog

logger = logging.getLogger(__name__)

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class AuditMiddleware:
    """Log after the response and dependency cleanup, avoiding SQLite write-lock cycles."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        status_code = 500

        async def capture_status(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, capture_status)
        finally:
            state = scope.get("state", {})
            user_id = state.get("auth_user_id")
            method = scope["method"].upper()
            if method in MUTATING_METHODS and user_id:
                try:
                    import json
                    async with AsyncSessionLocal() as session:
                        client = scope.get("client")
                        session.add(UserActionLog(
                            user_id=user_id, role=state.get("auth_user_role"),
                            action=f"{method} {scope['path']}", endpoint=scope["path"],
                            ip_address=client[0] if client else None,
                            details=json.dumps({"status_code": status_code, "outcome": "success" if status_code < 400 else "rejected"}),
                        ))
                        await session.commit()
                except Exception as exc:
                    logger.warning("Failed to record request outcome: %s", type(exc).__name__)
