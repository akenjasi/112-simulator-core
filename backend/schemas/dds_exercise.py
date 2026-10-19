"""Versioned, generator-compatible prepared DDS exercise contract."""
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

STAGES = ("Начало реагирования", "Прибытие", "Проведение работ", "Работы завершены")


class Contact(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=64)
    service_name: str = Field(min_length=1, max_length=255)
    number: str = Field(min_length=1, max_length=24, pattern=r"^[0-9+*#-]+$")
    full_name: str = Field(min_length=1, max_length=255)
    position: str = Field(min_length=1, max_length=255)
    brigade: str = Field(min_length=1, max_length=64)
    reply: str = Field(min_length=1, max_length=1000)
    dispatch_keywords: list[str] = Field(min_length=1, max_length=10)
    audio: str | None = None

    @field_validator("audio")
    @classmethod
    def local_audio(cls, value):
        if value is not None and not re.fullmatch(r"/audio/tts/[a-zA-Z0-9_-]+\.wav", value):
            raise ValueError("Only bundled /audio/tts/*.wav assets are allowed")
        return value

    @field_validator("dispatch_keywords")
    @classmethod
    def keywords(cls, values):
        if any(not word.strip() or len(word) > 100 for word in values):
            raise ValueError("Keywords must be nonempty, at most 100 characters")
        return [word.strip() for word in values]


class Report(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=64)
    contact_id: str = Field(min_length=1, max_length=64)
    status: Literal["Начало реагирования", "Прибытие", "Проведение работ", "Работы завершены"]
    text: str = Field(min_length=1, max_length=2000)
    comment_keywords: list[str] = Field(default_factory=list, max_length=10)
    audio: str | None = None
    _audio = field_validator("audio")(Contact.local_audio.__func__)
    _keywords = field_validator("comment_keywords")(Contact.keywords.__func__)


class ExercisePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    source: Literal["prepared"] = "prepared"
    contacts: list[Contact] = Field(min_length=1, max_length=100)
    reports: list[Report] = Field(min_length=4, max_length=400)

    @model_validator(mode="after")
    def consistent(self):
        ids = [c.id for c in self.contacts]
        numbers = [c.number for c in self.contacts]
        if len(set(ids)) != len(ids) or len(set(numbers)) != len(numbers):
            raise ValueError("Contact IDs and numbers must be unique")
        if len({r.id for r in self.reports}) != len(self.reports):
            raise ValueError("Report IDs must be unique")
        for service in {c.service_name for c in self.contacts}:
            if sum(c.service_name == service for c in self.contacts) > 10:
                raise ValueError("At most 10 contacts per DDS")
        by_id = {c.id: c for c in self.contacts}
        if any(r.contact_id not in by_id for r in self.reports):
            raise ValueError("Unknown report contact")
        for service in {c.service_name for c in self.contacts}:
            if [r.status for r in self.reports if by_id[r.contact_id].service_name == service] != list(STAGES):
                raise ValueError("Each DDS must have the four ordered report stages")
        for report in self.reports:
            if report.status == STAGES[-1] and not report.comment_keywords:
                raise ValueError("Final report requires result keywords")
        return self


class PhoneCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_id: str = Field(min_length=1, max_length=128)
    card_id: str = Field(min_length=1)
    operation: Literal["dial", "answer", "audio"]
    service_name: str | None = Field(None, max_length=255)
    number: str | None = Field(None, max_length=24)
    report_id: str | None = Field(None, max_length=64)
    call_id: str | None = Field(None, max_length=128)
    audio_result: Literal["played", "unavailable"] | None = None

    @model_validator(mode="after")
    def required(self):
        if self.operation == "dial" and (not self.number or not self.service_name):
            raise ValueError("Dial requires number and selected service")
        if self.operation == "answer" and not self.report_id:
            raise ValueError("Answer requires report_id")
        if self.operation == "audio" and (not self.call_id or not self.audio_result):
            raise ValueError("Audio acknowledgement requires call_id and audio_result")
        return self
