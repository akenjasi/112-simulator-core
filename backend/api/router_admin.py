"""Admin tools router: healthcheck and database backup."""

import asyncio
from fastapi import APIRouter, Depends
import psutil
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.database import get_db
from backend.schemas.admin import BackupResponse, HealthCheckResponse
from scripts.backup_db import create_backup_async

admin_router = APIRouter(
    prefix="/api/admin",
    tags=["Admin Tools"],
    dependencies=[Depends(require_role("ADMIN"))],
)
router = admin_router


def _get_system_metrics() -> tuple[float, float]:
    """Synchronous psutil metrics extraction."""
    cpu = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory().percent
    return cpu, ram


@admin_router.get("/healthcheck", response_model=HealthCheckResponse)
@admin_router.get("/healthcheck/", response_model=HealthCheckResponse, include_in_schema=False)
async def healthcheck(db: AsyncSession = Depends(get_db)):
    """Return CPU, RAM usage and database connectivity status."""
    cpu_percent, ram_percent = await asyncio.to_thread(_get_system_metrics)

    try:
        result = await db.execute(text("SELECT 1"))
        val = result.scalar()
        db_status = "ok" if val == 1 else "error"
    except Exception:
        db_status = "error"

    return HealthCheckResponse(
        cpu_percent=cpu_percent,
        ram_percent=ram_percent,
        db_status=db_status,
    )


@admin_router.post("/backup", response_model=BackupResponse)
@admin_router.post("/backup/", response_model=BackupResponse, include_in_schema=False)
async def backup():
    """Create a database backup asynchronously."""
    backup_file = await create_backup_async()
    return BackupResponse(
        backup_file=backup_file,
        status="ok",
    )
