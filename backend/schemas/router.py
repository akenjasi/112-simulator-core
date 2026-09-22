from pydantic import BaseModel, Field


class SessionState(BaseModel):
    panic_level: int = 50
    asked_intents: list[str] = Field(default_factory=list)
