"""Pydantic schemas for audit logs and system error logs."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserActionLogResponse(BaseModel):
    log_id: str
    user_id: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    action: str
    action_type: Optional[str] = None
    endpoint: Optional[str] = None
    target_entity: Optional[str] = None
    target_id: Optional[str] = None
    ip_address: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class SystemErrorLogResponse(BaseModel):
    id: str
    timestamp: datetime
    error_message: str
    traceback: Optional[str] = None

    model_config = {"from_attributes": True}
