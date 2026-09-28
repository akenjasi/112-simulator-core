import asyncio
from backend.database import engine
from sqlalchemy import text

async def main():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE scenario_tickets ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
        except Exception as e:
            print("scenario_tickets error:", e)
        try:
            await conn.execute(text("ALTER TABLE generated_tickets ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
        except Exception as e:
            print("generated_tickets error:", e)

asyncio.run(main())
