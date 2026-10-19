"""Persistent authentication-session helpers.

The helpers only flush changes. Transaction ownership stays with the API layer so
user state, audit entries, and session changes are committed atomically.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.domain_01 import AuthChallenge, AuthSession


MAX_ACTIVE_SESSIONS = 5


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def create_user_session(
    db: AsyncSession,
    *,
    user_id: str,
    expires_at: datetime,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> str:
    session_id = str(uuid.uuid4())
    now = utc_now()
    db.add(
        AuthSession(
            session_id=session_id,
            user_id=user_id,
            created_at=now,
            last_seen_at=now,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await db.flush()

    result = await db.execute(
        select(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
        .order_by(AuthSession.created_at.desc(), AuthSession.session_id.desc())
    )
    active_sessions = result.scalars().all()
    for stale_session in active_sessions[MAX_ACTIVE_SESSIONS:]:
        stale_session.revoked_at = now
    await db.flush()
    return session_id


async def revoke_session(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: Optional[str] = None,
) -> bool:
    stmt = select(AuthSession).where(AuthSession.session_id == session_id)
    if user_id is not None:
        stmt = stmt.where(AuthSession.user_id == user_id)
    auth_session = (await db.execute(stmt)).scalar_one_or_none()
    if auth_session is None:
        return False
    if auth_session.revoked_at is None:
        auth_session.revoked_at = utc_now()
        await db.flush()
    return True


async def revoke_all_user_sessions(db: AsyncSession, *, user_id: str) -> int:
    await db.execute(update(AuthChallenge).where(
        AuthChallenge.user_id == user_id, AuthChallenge.consumed_at.is_(None)
    ).values(consumed_at=utc_now()))
    result = await db.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=utc_now())
    )
    await db.flush()
    return int(result.rowcount or 0)
