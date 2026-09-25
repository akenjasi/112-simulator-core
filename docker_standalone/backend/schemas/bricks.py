from enum import Enum
from typing import List, Dict
from pydantic import BaseModel, Field


class Emotion(str, Enum):
    neutral = "neutral"
    panic = "panic"


class Intent(str, Enum):
    greeting = "greeting"          # 0
    address = "address"            # 1
    address_details = "address_details"  # 2
    situation = "situation"        # 3
    victims = "victims"            # 4
    caller_id = "caller_id"        # 5
    phone = "phone"                # 6
    repeat = "repeat"              # 7
    bureaucracy = "bureaucracy"    # 8
    outro = "outro"                # 9


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
