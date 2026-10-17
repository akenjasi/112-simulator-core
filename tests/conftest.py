import atexit
import os
from pathlib import Path
import secrets
import shutil
import sys
import tempfile
import uuid

import pytest
from httpx import AsyncClient


def _init_test_env():
    raw_url = os.environ.get("DATABASE_URL")
    token = os.environ.get("IMBA_TEST_TOKEN")

    if raw_url is not None and raw_url != "":
        # External or runner-provided DATABASE_URL.
        # Must be an explicit absolute SQLite address starting with sqlite+aiosqlite:////
        # and verified via token file created by the runner.
        if not raw_url.startswith("sqlite+aiosqlite:////"):
            print("ERROR: External or non-SQLite DATABASE_URL rejected.", file=sys.stderr)
            sys.exit(1)

        db_path = Path(raw_url.removeprefix("sqlite+aiosqlite:///"))
        if not db_path.is_absolute() or ".." in db_path.parts:
            print("ERROR: Invalid database path.", file=sys.stderr)
            sys.exit(1)

        if db_path.is_symlink() or os.path.islink(db_path):
            print("ERROR: Database path cannot be a symlink.", file=sys.stderr)
            sys.exit(1)

        db_dir = db_path.parent
        if not db_dir.is_dir() or db_dir.is_symlink() or os.path.islink(db_dir):
            print("ERROR: Database directory must be an existing directory and not a symlink.", file=sys.stderr)
            sys.exit(1)

        if Path(os.path.realpath(db_dir)) != db_dir:
            print("ERROR: Database directory path must not contain symlinks.", file=sys.stderr)
            sys.exit(1)

        # Reject pre-existing database file (including regular files, hardlinks, symlinks, sockets, etc.)
        # The contract requires the target database file to NOT exist prior to initialization.
        if os.path.lexists(db_path) or db_path.exists():
            print("ERROR: Pre-existing database file rejected. Target database must not exist before initialization.", file=sys.stderr)
            sys.exit(1)

        token_file = db_dir / ".token"
        if not token_file.is_file() or token_file.is_symlink() or os.path.islink(token_file):
            print("ERROR: Token file missing, invalid or is a symlink.", file=sys.stderr)
            sys.exit(1)

        if not token or token_file.read_text().strip() != token:
            print("ERROR: Unverified external DATABASE_URL rejected before backend import.", file=sys.stderr)
            sys.exit(1)

        # Isolated secret handshake:
        # Trust SECRET_KEY only if verified via trusted .secret file written by the runner.
        secret_file = db_dir / ".secret"
        inherited_secret = os.environ.get("SECRET_KEY")
        if (
            secret_file.is_file()
            and not secret_file.is_symlink()
            and not os.path.islink(secret_file)
            and inherited_secret
            and secret_file.read_text().strip() == inherited_secret
        ):
            # Runner verified secret matches environment
            pass
        else:
            # Overwrite unverified or inherited SECRET_KEY with a fresh random secret
            os.environ["SECRET_KEY"] = secrets.token_hex(32)

        os.environ["TESTING"] = "true"
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    else:
        # Direct pytest run without DATABASE_URL:
        # Allocate private temporary directory and SQLite database.
        temp_dir = Path(tempfile.mkdtemp(prefix="imba_direct_pytest_")).resolve()
        tok = secrets.token_hex(16)
        token_file = temp_dir / ".token"
        token_file.write_text(tok)

        os.environ["IMBA_TEST_TOKEN"] = tok
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{temp_dir}/test.sqlite"
        os.environ["SECRET_KEY"] = secrets.token_hex(32)
        os.environ["TESTING"] = "true"
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

        atexit.register(lambda: shutil.rmtree(temp_dir, ignore_errors=True))


_init_test_env()

from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User
from backend.core.security import create_access_token, hash_password


@pytest.fixture(autouse=True)
async def init_db_tables():
    """Ensure all database tables exist before each test."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def db_session():
    """Yield an async SQLAlchemy session."""
    async with AsyncSessionLocal() as session:
        yield session


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


@pytest.fixture
async def async_client(teacher_auth_client):
    """Default async HTTP client (authenticated as TEACHER for lesson tests)."""
    yield teacher_auth_client
