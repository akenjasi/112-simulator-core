"""Router for viewing audit logs."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.database import get_db
from backend.models.domain_01 import UserActionLog
from backend.schemas.audit import UserActionLogResponse

audit_router = APIRouter(
    prefix="/api/admin/audit-logs",
    tags=["Audit Logs"],
    dependencies=[Depends(require_role("ADMIN"))],
)
router = audit_router


@audit_router.get("", response_model=list[UserActionLogResponse])
@audit_router.get("/", response_model=list[UserActionLogResponse], include_in_schema=False)
async def get_audit_logs(
    limit: int = Query(100, ge=1, le=1000, description="Max number of logs to return"),
    offset: int = Query(0, ge=0, description="Number of logs to skip"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve audit action logs with pagination. Restricted to ADMIN role."""
    stmt = (
        select(UserActionLog)
        .order_by(UserActionLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
