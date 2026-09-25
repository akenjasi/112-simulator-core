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


class CadetSessionStats(BaseModel):
    cadet_id: str
    cadet_name: str
    status: str = "IN_PROGRESS"
    current_ticket: Optional[str] = None
    in_progress: int = 0
    passed: int = 0
    failed: int = 0
    progress: int = 0
    score: Optional[int] = None
    last_activity: Optional[str] = None


class SessionStatsResponse(BaseModel):
    session_id: str
    session_name: Optional[str] = "Занятие по сценариям вызовов"
    group_name: Optional[str] = "Группа курсантов"
    status: str = "active"
    overall_progress: int = 0
    total_cadets: int = 0
    total_in_progress: int = 0
    total_passed: int = 0
    total_failed: int = 0
    cadets: list[CadetSessionStats] = []

