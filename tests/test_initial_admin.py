"""Tests for first-run administrator bootstrap."""

import pytest
from sqlalchemy import select

from backend.core.bootstrap import ensure_initial_admin
from backend.core.security import verify_password
from backend.database import AsyncSessionLocal, engine
from backend.models.base import Base
import backend.models.domain_01  # noqa: F401
from backend.models.domain_01 import User


@pytest.fixture(autouse=True)
async def initialize_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_initial_admin_is_created_once_without_resetting_password():
    async with AsyncSessionLocal() as session:
        created = await ensure_initial_admin(
            session,
            username="initial_admin",
            password="First-run-password-112!",
        )
        assert created is True

        user = (await session.execute(select(User).where(User.username == "initial_admin"))).scalar_one()
        assert user.role == "ADMIN"
        assert verify_password("First-run-password-112!", user.password_hash)

        created_again = await ensure_initial_admin(
            session,
            username="initial_admin",
            password="Replacement-password-112!",
        )
        assert created_again is False

        unchanged = (await session.execute(select(User).where(User.username == "initial_admin"))).scalar_one()
        assert verify_password("First-run-password-112!", unchanged.password_hash)
        assert not verify_password("Replacement-password-112!", unchanged.password_hash)
