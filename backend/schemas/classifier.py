"""Pydantic schemas for Classifier Engine."""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ClassifierRecordResponse(BaseModel):
    id: int
    category: str
    group: str
    feature1: Optional[str] = None
    feature2: Optional[str] = None
    feature3: Optional[str] = None
    final_type: str
    base_services: List[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CalculateRequest(BaseModel):
    record_id: Optional[int] = Field(default=None, description="Classifier record ID")
    id: Optional[int] = Field(default=None, description="Alternative field for classifier record ID")
    classifier_id: Optional[int] = Field(default=None, description="Alternative field for classifier record ID")
    final_type: Optional[str] = Field(default=None, description="Incident final type or name")
    category: Optional[str] = Field(default=None, description="Incident category")
    tags: Optional[List[str]] = Field(default_factory=list, description="Incident tags or markers")
    has_victims: bool = Field(default=False, description="Presence of victims")
    is_blocked: bool = Field(default=False, description="Person or door is blocked")
    is_fire: bool = Field(default=False, description="Fire or smoke present")

    def get_record_id(self) -> Optional[int]:
        if self.record_id is not None:
            return self.record_id
        if self.id is not None:
            return self.id
        if self.classifier_id is not None:
            return self.classifier_id
        return None


class CalculateResponse(BaseModel):
    services: List[str] = Field(default_factory=list)
    recommended_services: List[str] = Field(default_factory=list)
    record_id: Optional[int] = None
    base_services: List[str] = Field(default_factory=list)
