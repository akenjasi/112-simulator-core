from typing import Literal
from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.deps import get_current_user, require_role
from backend.core.student_workspace import workspace
from backend.database import get_db
from backend.models.domain_01 import User


class CurrentActivity(BaseModel):
    session_id: str
    lesson_id: str
    ticket_id: str | None
    kind: Literal["teacher", "self_training"]
    teacher_name: str | None
    group_name: str | None
    started_at: datetime | None
    session_status: str
    completed_cards: int
    total_cards: int
    has_activity: bool


class StudentWorkspace(BaseModel):
    activities: list[CurrentActivity]
    can_start_training: bool


router = APIRouter(prefix="/api/dds", tags=["DDS student workspace"])


@router.get("/student-workspace", response_model=StudentWorkspace,
            dependencies=[Depends(require_role("CADET", "STUDENT"))])
async def get_workspace(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await workspace(db, user)
