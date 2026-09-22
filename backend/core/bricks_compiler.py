import os
import re
import json
import uuid
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Gender-neutral phrases as strictly required
INTRO = {
    "Нейтральный": [
        "Алло, слушайте...",
        "Здравствуйте.",
        "Алло.",
    ],
    "Паника": [
        "Алло! Быстрее!",
        "Помогите!",
        "Оператор, скорее!",
        "Алло, 112?!",
    ],
}

IRRITATION = [
    "Да я же уже сказал:",
    "Вы меня вообще слушаете?!",
    "Повторяю еще раз!",
    "Сколько можно спрашивать,",
]

OUTRO = [
    "Понял, жду.",
    "Давайте быстрее только!",
    "Хорошо, мы на месте, встречаем.",
    "Всё, жду.",
]

REQUIRED_INTENTS = ["caller_id", "address", "situation", "victims"]


def map_key_to_intent(key: str) -> Optional[str]:
    """Map raw factoid marker or key to dialogue intent."""
    k = str(key).strip().upper()
    if re.match(r"^AM(\d+)?$", k) or k in ("CALLER_ID", "CALLER", "FIO", "NAME"):
        return "caller_id"
    if re.match(r"^AD(\d+)?$", k) or k in ("ADDRESS", "ADDR"):
        return "address"
    if re.match(r"^(SM|SD|CN|CP)(\d+)?$", k) or k in ("SITUATION", "PLOT"):
        return "situation"
    if re.match(r"^V(\d+)?$", k) or k in ("VICTIMS", "VICTIM"):
        return "victims"
    return None


def compile_ticket(
    ticket_record: Optional[Dict[str, Any]] = None,
    output_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compile raw 14 LLM factoids into a Bricks matrix dialog
    and save to data/modular_dialogue/bricks_ticket_{UUID}_sit_01.json.
    Does NOT generate audio/TTS.
    """
    if ticket_record is None or not isinstance(ticket_record, dict):
        ticket_record = {}

    ticket_uuid = (
        ticket_record.get("ticket_id")
        or ticket_record.get("id")
        or ticket_record.get("ticket_uuid")
        or str(uuid.uuid4())
    )

    ground_truth = ticket_record.get("ground_truth")
    if not isinstance(ground_truth, dict):
        ground_truth = {}

    final_type = str(ticket_record.get("final_type") or "")
    plot = str(ticket_record.get("plot") or "")

    # Extract factoids dict
    raw_factoids = ticket_record.get("factoids")
    if isinstance(raw_factoids, str):
        try:
            raw_factoids = json.loads(raw_factoids)
        except Exception:
            raw_factoids = {}
    if not isinstance(raw_factoids, dict):
        raw_factoids = {}

    factoids_dict: Dict[str, str] = {}
    for k, v in raw_factoids.items():
        if v is not None and str(v).strip():
            factoids_dict[str(k).strip()] = str(v).strip()

    # Also check top-level ticket_record for factoid keys if not present
    known_markers = {
        "AM", "AD", "SM", "SD", "V", "CN", "CP",
        "AM1", "AM2", "AD1", "AD2", "SM1", "SM2",
        "SD1", "SD2", "V1", "V2", "CN1", "CN2", "CP1", "CP2"
    }
    for k, v in ticket_record.items():
        if k.upper() in known_markers and k not in factoids_dict and v is not None and str(v).strip():
            factoids_dict[str(k).strip()] = str(v).strip()

    # Group factoids by intent
    intents_dict: Dict[str, List[Dict[str, Any]]] = {
        "caller_id": [],
        "address": [],
        "situation": [],
        "victims": [],
    }

    for k, val in factoids_dict.items():
        intent = map_key_to_intent(k)
        if intent and intent in intents_dict:
            k_upper = k.upper()
            is_panic = "2" in k_upper or "ПАНИК" in k_upper
            intents_dict[intent].append({
                "key": k,
                "text": val,
                "emotion": "panic" if is_panic else "neutral",
            })

    # Edge cases: missing factoids fallback
    if not intents_dict["caller_id"]:
        fio = ground_truth.get("fio") or ground_truth.get("phone")
        intents_dict["caller_id"].append({
            "key": "AM",
            "text": str(fio).strip() if fio else "Заявитель",
            "emotion": "neutral",
        })

    if not intents_dict["address"]:
        addr_parts = [
            ground_truth.get(part)
            for part in ("okrug", "rayon", "street", "house", "corpus", "stroenie", "flat")
            if ground_truth.get(part)
        ]
        addr_str = ", ".join(addr_parts) if addr_parts else "Адрес не указан"
        intents_dict["address"].append({
            "key": "AD",
            "text": addr_str,
            "emotion": "neutral",
        })

    if not intents_dict["situation"]:
        sit_text = plot or final_type or "Происшествие"
        intents_dict["situation"].append({
            "key": "SM",
            "text": sit_text,
            "emotion": "neutral",
        })

    if not intents_dict["victims"]:
        has_v = ground_truth.get("has_victims")
        vict_text = "Есть пострадавшие" if has_v else "Пострадавших нет"
        intents_dict["victims"].append({
            "key": "V",
            "text": vict_text,
            "emotion": "neutral",
        })

    # Construct bricks list
    bricks: List[Dict[str, Any]] = []

    # 1. INTRO
    for idx, phrase in enumerate(INTRO["Нейтральный"], start=1):
        bricks.append({
            "audio_id": f"brk_intro_neutral_{idx:02d}",
            "role": "INTRO_EMOTION",
            "category": "intro",
            "intent": "intro",
            "text": phrase,
            "emotion": "neutral",
            "intensity": 1,
            "duration_ms": 2000,
            "speech_rate": "normal",
            "subfolder": "bricks",
        })

    for idx, phrase in enumerate(INTRO["Паника"], start=1):
        bricks.append({
            "audio_id": f"brk_intro_panic_{idx:02d}",
            "role": "INTRO_EMOTION",
            "category": "intro",
            "intent": "intro",
            "text": phrase,
            "emotion": "panic",
            "intensity": 3,
            "duration_ms": 2000,
            "speech_rate": "fast",
            "subfolder": "bricks",
        })

    # 2. CORE_FACT
    brick_fact_counters: Dict[str, int] = {intent: 1 for intent in REQUIRED_INTENTS}
    for intent in REQUIRED_INTENTS:
        for item in intents_dict[intent]:
            idx = brick_fact_counters[intent]
            brick_fact_counters[intent] += 1
            emo = item.get("emotion", "neutral")
            bricks.append({
                "audio_id": f"brk_fact_{intent}_{idx:02d}",
                "role": "CORE_FACT",
                "category": intent,
                "intent": intent,
                "factoid_key": item.get("key", ""),
                "text": item["text"],
                "emotion": emo,
                "intensity": 3 if emo == "panic" else 1,
                "duration_ms": 2500,
                "speech_rate": "fast" if emo == "panic" else "normal",
                "subfolder": "bricks",
            })

    # 3. IRRITATION
    for idx, phrase in enumerate(IRRITATION, start=1):
        bricks.append({
            "audio_id": f"brk_irrit_{idx:02d}",
            "role": "IRRITATION_MARKER",
            "category": "irritation",
            "intent": "irritation",
            "text": phrase,
            "emotion": "angry",
            "intensity": 2,
            "duration_ms": 2000,
            "speech_rate": "fast",
            "subfolder": "bricks",
        })

    # 4. OUTRO / RELIEF
    for idx, phrase in enumerate(OUTRO, start=1):
        bricks.append({
            "audio_id": f"brk_relief_{idx:02d}",
            "role": "RELIEF",
            "category": "relief",
            "intent": "outro",
            "text": phrase,
            "emotion": "neutral",
            "intensity": 1,
            "duration_ms": 2000,
            "speech_rate": "normal",
            "subfolder": "bricks",
        })

    # Build matrix representation
    dialog_matrix = {
        intent: [item["text"] for item in items]
        for intent, items in intents_dict.items()
    }

    caller_name = ground_truth.get("fio") or (intents_dict["caller_id"][0]["text"] if intents_dict["caller_id"] else "Заявитель")
    caller_phone = ground_truth.get("phone") or ""
    address_summary = intents_dict["address"][0]["text"] if intents_dict["address"] else ""
    situation_summary = intents_dict["situation"][0]["text"] if intents_dict["situation"] else ""
    has_victims_bool = bool(ground_truth.get("has_victims") or any("ранен" in item["text"].lower() or "погиб" in item["text"].lower() for item in intents_dict["victims"]))

    compiled_data = {
        "version": "2.1.0",
        "ticket_id": ticket_uuid,
        "question_id": 1,
        "metadata": {
            "title": f"Каталог смысловых кирпичиков: Билет {ticket_uuid}",
            "character": {
                "name": caller_name,
                "phone": caller_phone,
                "role": "Заявитель / Очевидец",
                "voice": "ru-RU-DmitryNeural",
                "initial_panic": 50,
            },
            "incident": {
                "category": final_type,
                "situation": situation_summary,
                "address": address_summary,
                "has_victims": has_victims_bool,
            },
        },
        "total_bricks": len(bricks),
        "roles_summary": {
            "INTRO_EMOTION": len([b for b in bricks if b.get("role") == "INTRO_EMOTION"]),
            "CORE_FACT": len([b for b in bricks if b.get("role") == "CORE_FACT"]),
            "IRRITATION_MARKER": len([b for b in bricks if b.get("role") == "IRRITATION_MARKER"]),
            "RELIEF": len([b for b in bricks if b.get("role") == "RELIEF"]),
        },
        "dialog_matrix": dialog_matrix,
        "matrix": dialog_matrix,
        "intents": dialog_matrix,
        "bricks": bricks,
    }

    # Resolve output directory
    if output_dir is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        output_dir = os.path.join(base_dir, "data", "modular_dialogue")

    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"bricks_ticket_{ticket_uuid}_sit_01.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(compiled_data, f, ensure_ascii=False, indent=2)

    logger.info(f"Compiled bricks matrix for ticket {ticket_uuid} -> {out_path}")
    return compiled_data
