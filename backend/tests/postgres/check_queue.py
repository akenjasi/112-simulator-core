"""Run the DDS queue acceptance against an owned, disposable PostgreSQL 15.

Does not accept inherited database settings or touch existing containers/volumes.
Run from any directory: python backend/tests/postgres/check_queue.py
"""
import asyncio
import inspect
import itertools
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import uuid


async def acceptance():
    from backend.database import engine
    from backend.models.base import Base
    from backend.tests import test_dds_queue

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    count = 0
    try:
        for name, function in vars(test_dds_queue).items():
            if not name.startswith("test_") or not inspect.iscoroutinefunction(function):
                continue
            cases = [{}]
            for mark in getattr(function, "pytestmark", []):
                if mark.name == "parametrize":
                    parameter, values = mark.args
                    cases = [{**case, parameter: value} for case, value in itertools.product(cases, values)]
            for case in cases:
                await function(**case)
                count += 1
                print(f"PASS {name} {case}", flush=True)
        print(f"PostgreSQL 15: {count} queue acceptance cases passed", flush=True)
    finally:
        await engine.dispose()


def main():
    root = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--owned-child"]:
        # The parent is the only entrypoint configuring the child connection.
        if os.environ.get("DDS_QUEUE_OWNED_CHECK") != "1":
            raise SystemExit("Run without --owned-child to allocate an isolated database")
        sys.path.insert(0, str(root))
        asyncio.run(acceptance())
        return
    name = "imba-dds-queue-check-" + uuid.uuid4().hex[:12]
    password = secrets.token_hex(16)
    created = False
    try:
        subprocess.run(["docker", "run", "-d", "--name", name, "-p", "127.0.0.1::5432",
                        "-e", "POSTGRES_USER=dds_queue_test", "-e", f"POSTGRES_PASSWORD={password}",
                        "-e", "POSTGRES_DB=dds_queue_test", "postgres:15-alpine"],
                       check=True, stdout=subprocess.DEVNULL)
        created = True
        for _ in range(50):
            health = subprocess.run(["docker", "exec", "-e", f"PGPASSWORD={password}", name, "psql", "-h", "127.0.0.1", "-U", "dds_queue_test", "-d", "dds_queue_test", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1"],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if health.returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("Owned PostgreSQL did not become ready")
        port = subprocess.check_output(["docker", "port", name, "5432/tcp"], text=True).strip().rsplit(":", 1)[1]
        environment = dict(os.environ)
        environment.update(DATABASE_URL=f"postgresql+asyncpg://dds_queue_test:{password}@127.0.0.1:{port}/dds_queue_test",
                           SECRET_KEY=secrets.token_hex(32), TESTING="true", HF_HUB_OFFLINE="1",
                           TRANSFORMERS_OFFLINE="1", DDS_QUEUE_OWNED_CHECK="1")
        subprocess.run([sys.executable, str(Path(__file__).resolve()), "--owned-child"],
                       cwd=root, env=environment, check=True)
    finally:
        if created:
            subprocess.run(["docker", "rm", "-fv", name], check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
