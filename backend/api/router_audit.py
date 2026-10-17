"""Router for viewing audit logs and system error logs."""

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.database import get_db
from backend.models.domain_01 import SystemErrorLog, User, UserActionLog
from backend.schemas.audit import SystemErrorLogResponse, UserActionLogResponse


def parse_iso_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse an ISO datetime string ensuring it contains an explicit timezone.

    Returns the datetime normalized to UTC. Raises HTTPException 422 on failure.
    """
    if dt_str is None:
        return None
    val = dt_str.strip()
    if not val:
        return None

    # In URL query parameters, '+' is often decoded into a space (' ').
    # Restore '+' before timezone offset if present (e.g. ' 00:00' -> '+00:00' or ' 03:00' -> '+03:00')
    val = re.sub(r" (\d{2}:\d{2})$", r"+\1", val)

    try:
        normalized_str = val.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid ISO datetime format: {dt_str}",
        )

    if dt.tzinfo is None or dt.utcoffset() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Datetime must include an explicit timezone offset (e.g. 'Z' or '+03:00')",
        )

    return dt.astimezone(timezone.utc)


audit_router = APIRouter(
    prefix="/api/admin/audit-logs",
    tags=["Audit Logs"],
    dependencies=[Depends(require_role("ADMIN"))],
)
router = audit_router

error_logs_router = APIRouter(
    prefix="/api/admin/error-logs",
    tags=["Error Logs"],
    dependencies=[Depends(require_role("ADMIN"))],
)


@audit_router.get("", response_model=list[UserActionLogResponse])
@audit_router.get("/", response_model=list[UserActionLogResponse], include_in_schema=False)
async def get_audit_logs(
    limit: int = Query(100, ge=1, le=1000, description="Max number of logs to return"),
    offset: int = Query(0, ge=0, description="Number of logs to skip"),
    from_at: Optional[str] = Query(None, description="Start datetime with explicit timezone"),
    to_at: Optional[str] = Query(None, description="End datetime with explicit timezone"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve audit action logs with optional filtering and pagination. Restricted to ADMIN role."""
    from_dt = parse_iso_datetime(from_at)
    to_dt = parse_iso_datetime(to_at)
    if from_dt is not None and to_dt is not None and from_dt > to_dt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_at cannot be greater than to_at",
        )

    stmt = select(UserActionLog, User.username).outerjoin(
        User, UserActionLog.user_id == User.user_id
    )

    if from_dt is not None:
        stmt = stmt.where(UserActionLog.timestamp >= from_dt)
    if to_dt is not None:
        stmt = stmt.where(UserActionLog.timestamp <= to_dt)
    if user_id:
        stmt = stmt.where(UserActionLog.user_id == user_id)

    stmt = (
        stmt.order_by(UserActionLog.timestamp.desc(), UserActionLog.log_id.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(stmt)
    rows = result.all()

    logs: list[UserActionLogResponse] = []
    for log_entry, username in rows:
        ts = log_entry.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        logs.append(
            UserActionLogResponse(
                log_id=log_entry.log_id,
                user_id=log_entry.user_id,
                username=username,
                role=log_entry.role,
                action=log_entry.action,
                action_type=log_entry.action,
                endpoint=log_entry.endpoint,
                target_entity=log_entry.target_entity,
                target_id=log_entry.target_id,
                ip_address=log_entry.ip_address,
                details=log_entry.details,
                timestamp=ts,
            )
        )
    return logs


@error_logs_router.get("", response_model=list[SystemErrorLogResponse])
@error_logs_router.get("/", response_model=list[SystemErrorLogResponse], include_in_schema=False)
async def get_error_logs(
    limit: int = Query(100, ge=1, le=1000, description="Max number of logs to return"),
    offset: int = Query(0, ge=0, description="Number of logs to skip"),
    from_at: Optional[str] = Query(None, description="Start datetime with explicit timezone"),
    to_at: Optional[str] = Query(None, description="End datetime with explicit timezone"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve system error logs with optional filtering and pagination. Restricted to ADMIN role."""
    from_dt = parse_iso_datetime(from_at)
    to_dt = parse_iso_datetime(to_at)
    if from_dt is not None and to_dt is not None and from_dt > to_dt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_at cannot be greater than to_at",
        )

    stmt = select(SystemErrorLog)
    if from_dt is not None:
        stmt = stmt.where(SystemErrorLog.timestamp >= from_dt)
    if to_dt is not None:
        stmt = stmt.where(SystemErrorLog.timestamp <= to_dt)

    stmt = (
        stmt.order_by(SystemErrorLog.timestamp.desc(), SystemErrorLog.id.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(stmt)
    records = result.scalars().all()

    error_logs: list[SystemErrorLogResponse] = []
    for item in records:
        ts = item.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        error_logs.append(
            SystemErrorLogResponse(
                id=item.id,
                timestamp=ts,
                error_message=item.error_message,
                traceback=item.traceback,
            )
        )
    return error_logs
