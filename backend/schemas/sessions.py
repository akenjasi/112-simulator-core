from typing import Optional
from pydantic import BaseModel


class SessionStartRequest(BaseModel):
    cadet_id: str


class SessionStartResponse(BaseModel):
    session_id: str
    session_type: str
    status: str

    model_config = {"from_attributes": True}


class SessionStateResponse(BaseModel):
    session_id: str
    status: str
    dialogue_log: list
    dynamic_state: dict

    model_config = {"from_attributes": True}


class MessageRequest(BaseModel):
    text: str


class MessageResponse(BaseModel):
    reply: str
    audio_id: Optional[str] = None
    tts_url: Optional[str] = None


class SubmitCardRequest(BaseModel):
    operator_id: str
    filled_data: dict
    assigned_services: list[str]


class SubmitCardResponse(BaseModel):
    card_id: str
    session_status: str

