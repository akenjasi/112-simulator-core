"""Pydantic schemas for admin endpoints (healthcheck, backup)."""

from pydantic import BaseModel


class HealthCheckResponse(BaseModel):
    cpu_percent: float
    ram_percent: float
    db_status: str


class BackupResponse(BaseModel):
    backup_file: str
    status: str
