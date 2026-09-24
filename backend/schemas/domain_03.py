from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, model_validator


class ComplexityLevel(str, Enum):
    level_1 = "level_1"
    level_2 = "level_2"
    level_3 = "level_3"
    mixed = "mixed"


COMPLEXITY_ERROR_LIMITS = {
    ComplexityLevel.level_1: 0,
    ComplexityLevel.level_2: 1,
    ComplexityLevel.level_3: 2,
    ComplexityLevel.mixed: 2,
}


from typing import Optional, List, Union


class SessionConfigCreate(BaseModel):
    group_id: Union[int, str]
    categories: list[str] = Field(default_factory=list)
    complexity: ComplexityLevel
    distribution_mode: Optional[str] = "live_stream"
    error_limit: Optional[int] = None
    time_limit_seconds: Optional[int] = 30

    @model_validator(mode="after")
    def set_default_error_limit(self) -> "SessionConfigCreate":
        if self.error_limit is None:
            self.error_limit = COMPLEXITY_ERROR_LIMITS.get(self.complexity, 2)
        if self.time_limit_seconds is None:
            self.time_limit_seconds = 30
        return self

    model_config = {"from_attributes": True}


class SessionConfigResponse(BaseModel):
    session_id: Optional[str] = None
    group_id: Optional[Union[int, str]] = None
    categories: list[str] = Field(default_factory=list)
    complexity: ComplexityLevel
    distribution_mode: Optional[str] = "live_stream"
    error_limit: int
    time_limit_seconds: int
    status: Optional[str] = "active"

    model_config = {"from_attributes": True}
