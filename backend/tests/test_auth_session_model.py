from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from backend.core.security import create_access_token, decode_access_token, hash_password
from backend.models.domain_01 import AuthSession, User


def test_access_token_contains_explicit_session_id():
    token = create_access_token(
        subject="user-1",
        role="ADMIN",
        token_id="session-1",
    )

    payload = decode_access_token(token)

    assert payload is not None
    assert payload["jti"] == "session-1"


@pytest.mark.asyncio
async def test_auth_session_can_be_persisted(db_session):
    user = User(
        username="session_model_user",
        password_hash=hash_password("test_pass_123"),
        role="ADMIN",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    session = AuthSession(
        session_id="persisted-session",
        user_id=user.user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ip_address="127.0.0.1",
        user_agent="pytest",
    )
    db_session.add(session)
    await db_session.commit()

    persisted = await db_session.scalar(
        select(AuthSession).where(AuthSession.session_id == "persisted-session")
    )
    assert persisted is not None
    assert persisted.user_id == user.user_id
    assert persisted.revoked_at is None
