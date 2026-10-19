"""Actual migrations, configuration and exports rather than mirrored implementation."""
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import create_engine, inspect, text

from backend.core.schema_migrations import migrate_schema


def test_fresh_and_repeated_schema_upgrade():
    engine = create_engine("sqlite://")
    with engine.begin() as db:
        assert migrate_schema(db) == []
        assert migrate_schema(db) == []
        assert 'auth_challenges' in inspect(db).get_table_names()
    engine.dispose()


def test_legacy_user_columns_are_added_without_losing_rows():
    engine = create_engine("sqlite://")
    with engine.begin() as db:
        db.execute(text("CREATE TABLE users (user_id VARCHAR PRIMARY KEY, username VARCHAR NOT NULL UNIQUE, password_hash VARCHAR NOT NULL, role VARCHAR NOT NULL, created_at DATETIME NOT NULL, is_active BOOLEAN NOT NULL)"))
        db.execute(text("INSERT INTO users VALUES ('original', 'original', 'hash', 'CADET', '2026-10-19', 1)"))
        changed = migrate_schema(db)
        assert 'users.created_by_id' in changed and 'users.is_2fa_enabled' in changed
        row = db.execute(text("SELECT username, failed_login_attempts, is_2fa_enabled, group_ids, full_name FROM users WHERE user_id='original' ")).one()
        assert row == ('original', 0, 0, '[]', None)
        assert migrate_schema(db) == []
    engine.dispose()


def test_unknown_required_schema_is_rejected_before_mutation():
    engine = create_engine("sqlite://")
    with engine.begin() as db:
        db.execute(text("CREATE TABLE users (user_id VARCHAR PRIMARY KEY)"))
        with pytest.raises(RuntimeError, match='users.username'):
            migrate_schema(db)
        assert inspect(db).get_table_names() == ['users']
        assert [column['name'] for column in inspect(db).get_columns('users')] == ['user_id']
    engine.dispose()


def test_private_env_generator_is_portable_and_never_overwrites(tmp_path):
    output = tmp_path / '.env'
    script = Path(__file__).resolve().parents[1] / 'setup_env.py'
    first = subprocess.run([sys.executable, str(script), '--init', '--output', str(output)], capture_output=True, text=True)
    assert first.returncode == 0
    contents = output.read_text()
    assert 'SECRET_KEY=\n' not in contents and 'POSTGRES_PASSWORD=\n' not in contents
    assert output.stat().st_mode & 0o777 == 0o600
    second = subprocess.run([sys.executable, str(script), '--init', '--output', str(output)], capture_output=True, text=True)
    assert second.returncode != 0 and output.read_text() == contents
    assert contents not in first.stdout + first.stderr


def test_demo_seeder_refuses_existing_or_postgres_targets(tmp_path):
    from scripts.demo_seed_guard import require_new_demo_sqlite
    file = tmp_path / 'existing.sqlite'
    file.write_text('original')
    for url in (f'sqlite+aiosqlite:///{file}', 'postgresql+asyncpg://demo:demo@localhost/demo'):
        with pytest.raises(SystemExit):
            require_new_demo_sqlite(url)
    assert file.read_text() == 'original'
    require_new_demo_sqlite(f'sqlite+aiosqlite:///{tmp_path / "new.sqlite"}')


def test_deprecated_database_import_is_the_canonical_engine():
    from backend import database
    from backend.db import database as legacy
    assert legacy.engine is database.engine
    assert legacy.AsyncSessionLocal is database.AsyncSessionLocal


def test_demo_cli_persists_announced_results_in_a_new_database(tmp_path):
    import sqlite3
    database = tmp_path / 'demo.db'
    result = subprocess.run([sys.executable, '-m', 'scripts.seed', '--db-url',
                             f'sqlite+aiosqlite:///{database}', '--num-students', '3',
                             '--min-tickets', '1', '--max-tickets', '1'],
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        assert db.execute('select count(*) from exam_sessions').fetchone()[0] == 3
        assert db.execute('select count(*) from ticket_results').fetchone()[0] == 3
        assert db.execute('select count(*) from incident_cards').fetchone()[0] == 3
        assert db.execute('pragma integrity_check').fetchone()[0] == 'ok'


def test_backup_retention_removes_only_expired_owned_files(tmp_path):
    import os
    from scripts.backup_loop import prune_owned_backups
    old = tmp_path / 'database_20260101_010101_123456_aabbcc.sql'
    unrelated = tmp_path / 'customer_notes.sql'
    recent = tmp_path / 'database_20261019_010101_123456_aabbcc.sql'
    for path in (old, unrelated, recent):
        path.write_text('private')
    for path in (old, unrelated):
        os.utime(path, (1, 1))
    link = tmp_path / 'database_20260101_010101_123456_ffffff.sql'
    link.symlink_to(unrelated)
    prune_owned_backups(tmp_path, days=180)
    assert not old.exists()
    assert unrelated.exists() and recent.exists() and link.is_symlink()


def test_release_script_stops_on_failed_image_build(tmp_path):
    import os
    stub = tmp_path / 'docker'
    stub.write_text('#!/bin/sh\nexit 73\n')
    stub.chmod(0o755)
    output = tmp_path / 'release'
    script = Path(__file__).resolve().parents[1] / 'scripts/pack_release.sh'
    result = subprocess.run(['bash', str(script)], capture_output=True, text=True,
                            env={**os.environ, 'PATH': f'{tmp_path}:{os.environ["PATH"]}',
                                 'RELEASE_DIR': str(output)})
    assert result.returncode == 73
    assert not (output / 'images.tar').exists()
    assert 'Release images saved' not in result.stdout
