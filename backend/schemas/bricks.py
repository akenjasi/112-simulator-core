from enum import Enum
from typing import List, Dict
from pydantic import BaseModel, Field


class Emotion(str, Enum):
    neutral = "neutral"
    panic = "panic"


class Intent(str, Enum):
    intro = "intro"
    caller_id = "caller_id"
    address = "address"
    situation = "situation"
    victims = "victims"
    outro = "outro"


class Brick(BaseModel):
    audio_id: str
    role: str
    category: str
    intent: Intent
    text: str
    emotion: Emotion
    intensity: int
    duration_ms: int
    speech_rate: str
    subfolder: str


class BricksMatrix(BaseModel):
    ticket_uuid: str
    bricks: List[Brick]


class TicketData(BaseModel):
    ticket_id: str
    plot: str = ""
    factoids: Dict[str, str] = Field(default_factory=dict)
    ground_truth: Dict[str, str] = Field(default_factory=dict)
