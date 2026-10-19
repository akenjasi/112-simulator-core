"""Fixed training recordings shared by every DDS ticket; never synthesized at runtime."""
from pathlib import Path

from backend.schemas.dds_exercise import ExercisePlan, STAGES

AUDIO_DIR = Path(__file__).resolve().parents[1] / "static" / "dds_phone"
AUDIO_PREFIX = "/api/dds/audio/"
RESPONDERS = (
    ("ivanov", "Иванов Иван Иванович", "1", "один"),
    ("petrov", "Петров Пётр Петрович", "2", "два"),
    ("sidorov", "Сидоров Алексей Сергеевич", "3", "три"),
    ("smirnov", "Смирнов Андрей Николаевич", "4", "четыре"),
)
POSITION = "Начальник бригады"
STAGE_PHRASES = ("Начало реагирования. Бригада выехала.", "Прибытие. Бригада прибыла на место.",
                 "Проведение работ. Бригада приступила к работам.", "Работы завершены. Задача выполнена.")


def recordings():
    """Authoritative transcripts for asset preparation and instructor review only."""
    result = {}
    for key, name, _, spoken_number in RESPONDERS:
        introduction = f"{POSITION} {name}. Бригада номер {spoken_number}."
        result[f"dds_{key}_reply.wav"] = f"{introduction} Слушаю. Готов принять задание."
        for index, phrase in enumerate(STAGE_PHRASES):
            result[f"dds_{key}_{index}.wav"] = f"{introduction} {phrase}"
    return result


def default_phone_plan(services):
    """One contact per DDS, unique dial numbers, immutable shared recording pool."""
    contacts, reports = [], []
    pool = recordings()
    for index, service in enumerate(dict.fromkeys(services)):
        key, name, brigade, _ = RESPONDERS[index % len(RESPONDERS)]
        contact_id = f"dds-contact-{index}"
        reply = f"dds_{key}_reply.wav"
        contacts.append(dict(id=contact_id, service_name=service, number=str(7000 + index),
                             full_name=name, position=POSITION, brigade=brigade,
                             reply=pool[reply], dispatch_keywords=["направлена"], audio=AUDIO_PREFIX + reply))
        for stage_index, stage in enumerate(STAGES):
            filename = f"dds_{key}_{stage_index}.wav"
            reports.append(dict(id=f"dds-report-{index}-{stage_index}", contact_id=contact_id,
                                status=stage, text=pool[filename], audio=AUDIO_PREFIX + filename,
                                comment_keywords=["задача выполнена"] if stage_index == 3 else []))
    return ExercisePlan(presentation="audio_only", contacts=contacts, reports=reports).model_dump()
