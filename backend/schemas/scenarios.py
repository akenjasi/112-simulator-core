from pydantic import BaseModel


class ScenarioCreate(BaseModel):
    settings: dict = {}


class ScenarioResponse(BaseModel):
    scenario_id: str
    settings: dict
    workflow_state: dict

    model_config = {"from_attributes": True}


class ScenarioGenerateResponse(BaseModel):
    job_id: str


class ScenarioCompileResponse(BaseModel):
    success: bool

