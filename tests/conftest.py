import uuid
import pytest
from httpx import AsyncClient

from backend.main import app
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import User
from backend.core.security import create_access_token, hash_password


async def create_user_and_token(role: str = 'ADMIN', username: str = None) -> tuple[User, str, dict]:
    """Helper to create a user with the given role in DB and return (user, token, headers)."""
    uname = username or f"{role.lower()}_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as session:
        user = User(
            username=uname,
            password_hash=hash_password('test_pass_123'),
            role=role,
            full_name=f'Test {role.capitalize()}',
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        token = create_access_token(subject=user.user_id, role=user.role)
        headers = {'Authorization': f'Bearer {token}'}
        return user, token, headers


@pytest.fixture
async def auth_client():
    """HTTP client authenticated as ADMIN."""
    user, token, headers = await create_user_and_token(role='ADMIN')
    async with AsyncClient(app=app, base_url='http://test', headers=headers) as ac:
        yield ac


@pytest.fixture
async def teacher_auth_client():
    """HTTP client authenticated as TEACHER."""
    user, token, headers = await create_user_and_token(role='TEACHER')
    async with AsyncClient(app=app, base_url='http://test', headers=headers) as ac:
        yield ac


@pytest.fixture
async def cadet_auth_client():
    """HTTP client authenticated as CADET."""
    user, token, headers = await create_user_and_token(role='CADET')
    async with AsyncClient(app=app, base_url='http://test', headers=headers) as ac:
        yield ac
