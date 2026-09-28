import asyncio
from backend.database import AsyncSessionLocal
from backend.models.domain_02 import GeneratedTicket
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(GeneratedTicket).limit(5))
        tickets = res.scalars().all()
        print(f"Found {len(tickets)} tickets.")

asyncio.run(main())
