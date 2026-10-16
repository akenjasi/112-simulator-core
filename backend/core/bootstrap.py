"""Safe first-run initialization for local deployments."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import hash_password
from backend.models.domain_01 import User


async def ensure_initial_admin(
    db: AsyncSession,
    username: str | None,
    password: str | None,
    full_name: str | None = None,
) -> bool:
    """Create the configured initial administrator exactly once.

    Missing bootstrap credentials intentionally do nothing.  Existing accounts
    are never updated here, so a restart cannot reset a changed password.
    """
    username = (username or "").strip()
    if not username or not password:
        return False

    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none() is not None:
        return False

    db.add(
        User(
            username=username,
            password_hash=hash_password(password),
            role="ADMIN",
            full_name=(full_name or "Администратор системы 112").strip(),
            is_active=True,
        )
    )
    await db.commit()
    return True
