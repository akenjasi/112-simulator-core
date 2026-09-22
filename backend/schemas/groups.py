from typing import Optional
from pydantic import BaseModel


class GroupCreate(BaseModel):
    group_name: str
    department: Optional[str] = None


class GroupResponse(BaseModel):
    model_config = {"from_attributes": True}

    group_id: str
    group_name: str
    department: Optional[str] = None
    cadet_ids: list[str] = []
