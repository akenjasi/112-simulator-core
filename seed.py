#!/usr/bin/env python3
"""
Seed script for 112 Simulator V2 local dev.

Creates initial users (ADMIN, TEACHER, CADET) so you can immediately
log in via the frontend without manual setup.

Usage:
    PYTHONPATH=.deps:. python3 seed.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env manually (uvicorn --env-file is not used here)
env_file = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


async def seed():
    # Import after env is set
    from backend.database import engine, AsyncSessionLocal
    from backend.models.base import Base
    from backend.models.domain_01 import User, StudentGroup
    from backend.core.security import hash_password

    # Ensure all tables exist
    import backend.models.domain_01  # noqa
    import backend.models.domain_02  # noqa
    import backend.models.domain_03  # noqa
    import backend.models.domain_04  # noqa
    import backend.models.domain_05  # noqa

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tables created / verified")

    async with AsyncSessionLocal() as session:
        from sqlalchemy import select

        # ─── Users ────────────────────────────────────────────────────────────
        users_to_create = [
            {"username": "admin",   "password": "admin123",   "role": "ADMIN",   "full_name": "Администратор"},
            {"username": "teacher", "password": "teacher123", "role": "TEACHER", "full_name": "Преподаватель Иванов И.И."},
            {"username": "cadet1",  "password": "cadet123",   "role": "CADET",   "full_name": "Курсант Петров А.В."},
            {"username": "cadet2",  "password": "cadet123",   "role": "CADET",   "full_name": "Курсант Сидорова М.К."},
        ]

        created_users = {}
        for u in users_to_create:
            existing = await session.execute(
                select(User).where(User.username == u["username"])
            )
            if existing.scalar_one_or_none():
                print(f"  ⏭  User '{u['username']}' already exists, skipping")
                continue
            user = User(
                username=u["username"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                full_name=u["full_name"],
            )
            session.add(user)
            await session.flush()
            created_users[u["username"]] = user
            print(f"  ✅ Created user '{u['username']}' ({u['role']})")

        await session.commit()

        # ─── Group ────────────────────────────────────────────────────────────
        existing_group = await session.execute(
            select(StudentGroup).where(StudentGroup.group_name == "Группа 112-А")
        )
        if not existing_group.scalar_one_or_none():
            teacher = (await session.execute(
                select(User).where(User.username == "teacher")
            )).scalar_one_or_none()

            if teacher:
                group = StudentGroup(
                    group_name="Группа 112-А",
                    department="Кафедра оперативной диспетчеризации",
                    teacher_id=teacher.user_id,
                )
                session.add(group)
                await session.commit()
                print("  ✅ Created student group 'Группа 112-А'")
        else:
            print("  ⏭  Group 'Группа 112-А' already exists, skipping")

    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║                Seed complete! Credentials:           ║")
    print("╠══════════════════════════════════════════════════════╣")
    print("║  admin    / admin123    (роль: ADMIN)                ║")
    print("║  teacher  / teacher123  (роль: TEACHER)              ║")
    print("║  cadet1   / cadet123    (роль: CADET)                ║")
    print("║  cadet2   / cadet123    (роль: CADET)                ║")
    print("╚══════════════════════════════════════════════════════╝")


if __name__ == "__main__":
    asyncio.run(seed())
