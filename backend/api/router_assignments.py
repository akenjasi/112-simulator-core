from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.database import get_db
from backend.models.domain_03 import Assignment
from backend.schemas.assignments import AssignmentCreate, AssignmentResponse

assignments_router = APIRouter(
    prefix="/api/admin/assignments",
    tags=["Admin Assignments"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
router = assignments_router


@assignments_router.get("", response_model=list[AssignmentResponse])
@assignments_router.get(
    "/", response_model=list[AssignmentResponse], include_in_schema=False
)
async def list_assignments(db: AsyncSession = Depends(get_db)):
    stmt = select(Assignment)
    result = await db.execute(stmt)
    return result.scalars().all()


@assignments_router.post("", response_model=AssignmentResponse)
@assignments_router.post(
    "/", response_model=AssignmentResponse, include_in_schema=False
)
async def create_assignment(
    assignment_in: AssignmentCreate, db: AsyncSession = Depends(get_db)
):
    assignment = Assignment(
        scenario_id=assignment_in.scenario_id,
        session_type=assignment_in.session_type,
        assigned_by=assignment_in.assigned_by,
        available_from=assignment_in.available_from,
        deadline=assignment_in.deadline,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment
