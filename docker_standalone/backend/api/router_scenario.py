from fastapi import APIRouter, Depends

from backend.core.bricks_compiler import compile_ticket
from backend.core.deps import require_role
from backend.core.factoids_llm import generate_factoids
from backend.schemas.bricks import BricksMatrix, TicketData
from backend.schemas.factoids import FactoidGenerationRequest, FactoidsResponse

router = APIRouter(
    prefix="/api/v1/scenario",
    tags=["Scenario"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
scenario_router = router


@router.post("/generate_factoids", response_model=FactoidsResponse)
async def api_generate_factoids(request: FactoidGenerationRequest) -> FactoidsResponse:
    return await generate_factoids(request)


@router.post("/compile_ticket", response_model=BricksMatrix)
def api_compile_ticket(data: TicketData) -> BricksMatrix:
    return compile_ticket(data)
