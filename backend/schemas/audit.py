"""Pydantic schemas for audit logs."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserActionLogResponse(BaseModel):
    log_id: str
    user_id: Optional[str] = None
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
