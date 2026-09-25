from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AssignmentCreate(BaseModel):
    scenario_id: str
    session_type: str
    assigned_by: str
    available_from: datetime
    deadline: datetime


class AssignmentResponse(BaseModel):
    assignment_id: str
    scenario_id: Optional[str] = None
    session_type: str
    assigned_by: str
    available_from: datetime
    deadline: datetime

    model_config = {"from_attributes": True}
