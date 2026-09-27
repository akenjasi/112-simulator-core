"""Admin tools router: healthcheck and database backup."""

import asyncio
from fastapi import APIRouter, Depends

import io
from fastapi import Response
from fastapi.responses import StreamingResponse
from backend.models.domain_01 import SecurityPolicy, SystemErrorLog
from sqlalchemy import select
from pydantic import BaseModel
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

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


class SecurityPolicyUpdate(BaseModel):
    key: str
    value: str

class SecurityPoliciesUpdateRequest(BaseModel):
    policies: list[SecurityPolicyUpdate]

@admin_router.get("/security-policies")
async def get_security_policies(db: AsyncSession = Depends(get_db)):
    stmt = select(SecurityPolicy)
    result = await db.execute(stmt)
    policies = result.scalars().all()
    
    defaults = {
        "MIN_PASSWORD_LENGTH": "8",
        "SESSION_TIMEOUT_MINUTES": "60",
        "REQUIRE_2FA_ALL": "false"
    }
    
    current = {p.key: p.value for p in policies}
    for k, v in defaults.items():
        if k not in current:
            current[k] = v
            db.add(SecurityPolicy(key=k, value=v))
    await db.commit()
    
    return {"policies": [{"key": k, "value": current[k]} for k in current]}

@admin_router.put("/security-policies")
async def update_security_policies(
    request: SecurityPoliciesUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    for p in request.policies:
        stmt = select(SecurityPolicy).where(SecurityPolicy.key == p.key)
        result = await db.execute(stmt)
        policy = result.scalar_one_or_none()
        if policy:
            policy.value = p.value
        else:
            db.add(SecurityPolicy(key=p.key, value=p.value))
    await db.commit()
    return {"status": "ok"}

@admin_router.get("/error-report/pdf")
async def get_error_report_pdf(db: AsyncSession = Depends(get_db)):
    stmt = select(SystemErrorLog).order_by(SystemErrorLog.timestamp.desc()).limit(100)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("System Error Report", styles['Title']))
    story.append(Spacer(1, 12))

    if not logs:
        story.append(Paragraph("No errors found.", styles['Normal']))
    else:
        for log in logs:
            time_str = log.timestamp.strftime("%Y-%m-%d %H:%M:%S")
            story.append(Paragraph(f"<b>Time:</b> {time_str}", styles['Normal']))
            story.append(Paragraph(f"<b>Message:</b> {log.error_message}", styles['Normal']))
            story.append(Spacer(1, 6))

    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=error_report.pdf"}
    )
