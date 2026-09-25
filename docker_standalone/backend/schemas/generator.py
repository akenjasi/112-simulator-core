import uuid
from typing import Any, Dict, List
from pydantic import BaseModel, Field

from backend.schemas.bricks import TicketData as BaseTicketData
from backend.schemas.faker import GeneratedPerson



class ClassifierRow(BaseModel):
    code: str
    incident_name: str
    services: List[str] = Field(default_factory=list)
    markers: List[str] = Field(default_factory=list)
    templates: List[str] = Field(default_factory=list)


class TicketData(BaseTicketData):
    ticket_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    complexity: int
    plot: str = ""
    factoids: Dict[str, Any] = Field(default_factory=dict)
    ground_truth: Dict[str, Any] = Field(default_factory=dict)
    etalon_services: List[str] = Field(default_factory=list)
