"""Pydantic schemas for admin endpoints (healthcheck, backup, backups listing)."""

from typing import Optional
from pydantic import BaseModel


class HealthCheckResponse(BaseModel):
    cpu_percent: float
    ram_percent: float
    db_status: str


class BackupResponse(BaseModel):
    backup_file: str
    status: str
    filename: Optional[str] = None
    size_bytes: Optional[int] = None
    created_at: Optional[str] = None


class BackupItem(BaseModel):
    filename: str
    created_at: str
    size_bytes: int


class BackupsListResponse(BaseModel):
    backups: list[BackupItem]


class IntegrityDeviationSchema(BaseModel):
    path: str
    reason: str
    details: Optional[str] = None


class IntegrityCheckResponse(BaseModel):
    status: str
    checked_at: str
    manifest_digest: Optional[str] = None
    checked_files_count: int
    deviations: list[IntegrityDeviationSchema] = []
    scope_summary: Optional[str] = None
    error: Optional[str] = None
