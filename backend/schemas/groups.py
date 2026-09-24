from typing import Optional
from pydantic import BaseModel
from backend.models.domain_01 import ProfileType


class GroupCreate(BaseModel):
    group_name: str
    department: Optional[str] = None
    profile: ProfileType = ProfileType.OPERATOR_112


class GroupResponse(BaseModel):
    model_config = {"from_attributes": True}

    group_id: str
    group_name: str
    profile: ProfileType = ProfileType.OPERATOR_112
    department: Optional[str] = None
    cadet_ids: list[str] = []
