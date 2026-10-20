"""Admin tools router: healthcheck and database backup."""

import asyncio
import json
import os
from fastapi import APIRouter, Depends, HTTPException, status

from datetime import datetime, timezone
from pathlib import Path

import io
from fastapi import Response
from fastapi.responses import FileResponse, StreamingResponse
from backend.models.domain_01 import SecurityPolicy, SystemErrorLog, User, UserActionLog
from sqlalchemy import select
from pydantic import BaseModel
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

import psutil
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, require_role
from backend.core.integrity import verify_integrity
from backend.database import get_db
from backend.schemas.admin import (
    BackupItem,
    BackupsListResponse,
    BackupResponse,
    HealthCheckResponse,
    IntegrityCheckResponse,
)
from backend.core.backups import (
    create_backup_async,
    get_backup_file_path,
    list_backups,
)

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
    """Create a database backup asynchronously with atomic temporary file."""
    try:
        backup_file = await create_backup_async()
    except FileNotFoundError as e:
        missing_tool = str(e) == "pg_dump executable not found on server"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=("Служба резервного копирования недоступна: не найдена утилита pg_dump"
                    if missing_tool else "Источник базы данных для резервного копирования недоступен"),
        )
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Превышено время ожидания создания резервной копии базы данных",
        )
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка создания резервной копии базы данных. Проверьте доступность БД и свободное место",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Непредвиденная ошибка резервного копирования базы данных",
        )

    file_path = Path(backup_file)
    stat = file_path.stat() if file_path.exists() else None
    size_bytes = stat.st_size if stat else None
    created_at = (
        datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        if stat
        else None
    )

    return BackupResponse(
        backup_file=backup_file,
        status="ok",
        filename=file_path.name,
        size_bytes=size_bytes,
        created_at=created_at,
    )


@admin_router.get("/backups", response_model=BackupsListResponse)
@admin_router.get("/backups/", response_model=BackupsListResponse, include_in_schema=False)
async def list_admin_backups():
    """List completed database backups from storage."""
    items = list_backups()
    return BackupsListResponse(
        backups=[
            BackupItem(
                filename=item["filename"],
                created_at=item["created_at"],
                size_bytes=item["size_bytes"],
            )
            for item in items
        ]
    )


@admin_router.get("/backups/{filename}/download")
async def download_admin_backup(filename: str):
    """Download a completed database backup file."""
    try:
        target_path = get_backup_file_path(filename)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Резервная копия не найдена: {filename}",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Не удалось получить файл резервной копии",
        )

    return FileResponse(
        path=str(target_path),
        media_type="application/octet-stream",
        filename=target_path.name,
    )



class SecurityPolicyUpdate(BaseModel):
    key: str
    value: str

class SecurityPoliciesUpdateRequest(BaseModel):
    policies: list[SecurityPolicyUpdate]


SECURITY_POLICY_DEFAULTS = {
    "MIN_PASSWORD_LENGTH": "8",
    "SESSION_TIMEOUT_MINUTES": "60",
    # Backward-compatible name used by the current authentication flow and UI.
    "REQUIRE_2FA_ALL": "false",
    "ENABLE_OPERATOR_112_FOR_LESSONS": "false",
}


def _normalise_security_policy(key: str, value: str) -> tuple[str, str]:
    normalised_key = key.strip().upper()
    if normalised_key not in SECURITY_POLICY_DEFAULTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported security policy: {key}",
        )

    raw_value = str(value).strip()
    if normalised_key in {
        "REQUIRE_2FA_ALL",
        "ENABLE_OPERATOR_112_FOR_LESSONS",
    }:
        boolean_value = raw_value.lower()
        if boolean_value not in {"true", "false"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{normalised_key} must be true or false",
            )
        return normalised_key, boolean_value

    try:
        integer_value = int(raw_value)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{normalised_key} must be an integer",
        )

    ranges = {
        "MIN_PASSWORD_LENGTH": (8, 128),
        "SESSION_TIMEOUT_MINUTES": (1, 1440),
    }
    minimum, maximum = ranges[normalised_key]
    if not minimum <= integer_value <= maximum:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{normalised_key} must be between {minimum} and {maximum}",
        )
    return normalised_key, str(integer_value)

@admin_router.get("/security-policies")
async def get_security_policies(db: AsyncSession = Depends(get_db)):
    stmt = select(SecurityPolicy)
    result = await db.execute(stmt)
    policies = result.scalars().all()
    
    current = {p.key: p.value for p in policies}
    for k, v in SECURITY_POLICY_DEFAULTS.items():
        if k not in current:
            current[k] = v
            db.add(SecurityPolicy(key=k, value=v))
    await db.commit()
    
    return {"policies": [{"key": k, "value": current[k]} for k in current]}

@admin_router.put("/security-policies")
async def update_security_policies(
    request: SecurityPoliciesUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate the whole batch before changing any policy.
    updates = [_normalise_security_policy(p.key, p.value) for p in request.policies]
    if any(key != "ENABLE_OPERATOR_112_FOR_LESSONS" for key, _ in updates):
        # Security authority is configured by the installation owner, not by
        # assigning oneself a role through the user-management API.
        configured_managers = os.getenv("SECURITY_POLICY_ADMIN_USERNAMES")
        if configured_managers is None:
            configured_managers = os.getenv("INITIAL_ADMIN_USERNAME", "admin")
        managers = {name.strip() for name in configured_managers.split(",") if name.strip()}
        if current_user.username not in managers:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="У администратора нет права изменять базовые настройки безопасности",
            )
    if ("REQUIRE_2FA_ALL", "true") in updates:
        unenrolled = await db.scalar(select(User.user_id).where(User.is_active.is_(True), User.is_2fa_enabled.is_(False)).limit(1))
        if unenrolled:
            raise HTTPException(409, "Сначала настройте 2FA для всех активных пользователей. Подключение 2FA для курсантов пока недоступно.")
    for key, value in updates:
        stmt = select(SecurityPolicy).where(SecurityPolicy.key == key)
        result = await db.execute(stmt)
        policy = result.scalar_one_or_none()
        old_value = policy.value if policy else None
        if policy:
            policy.value = value
        else:
            db.add(SecurityPolicy(key=key, value=value))

        db.add(
            UserActionLog(
                user_id=current_user.user_id,
                role=current_user.role,
                action="SECURITY_POLICY_UPDATED",
                endpoint="/api/admin/security-policies",
                target_entity="security_policies",
                target_id=key,
                details=json.dumps(
                    {"old_value": old_value, "new_value": value},
                    ensure_ascii=False,
                ),
            )
        )
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


@admin_router.post("/integrity/check", response_model=IntegrityCheckResponse)
@admin_router.post("/integrity/check/", response_model=IntegrityCheckResponse, include_in_schema=False)
async def check_integrity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Verify backend file integrity against the SHA-256 build manifest.
    Hashing is executed in a background thread without blocking the event loop.
    Logs completion to UserActionLog audit table.
    """
    app_root = os.getenv("APP_ROOT")
    if not app_root:
        if Path("/app/backend").is_dir():
            app_root = "/app"
        else:
            app_root = str(Path(__file__).resolve().parent.parent.parent)

    result = await asyncio.to_thread(verify_integrity, root_dir=app_root)

    try:
        log_entry = UserActionLog(
            user_id=current_user.user_id,
            role=current_user.role,
            action="INTEGRITY_CHECK_COMPLETED",
            endpoint="/api/admin/integrity/check",
            target_entity="system_integrity",
            target_id=result.get("manifest_digest"),
            details=json.dumps(
                {
                    "status": result.get("status"),
                    "checked_files_count": result.get("checked_files_count"),
                    "deviations_count": len(result.get("deviations", [])),
                    "deviations": [
                        {"path": d["path"], "reason": d["reason"]}
                        for d in result.get("deviations", [])[:20]
                    ],
                },
                ensure_ascii=False,
            ),
        )
        db.add(log_entry)
        await db.commit()
    except Exception:
        pass

    return result
