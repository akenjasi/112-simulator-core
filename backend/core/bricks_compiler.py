import logging
from typing import List
from backend.schemas.bricks import Brick, BricksMatrix, Emotion, Intent, TicketData

logger = logging.getLogger(__name__)


def compile_ticket(data: TicketData) -> BricksMatrix:
    """
    Compile ticket factoids and applicant data into a structured BricksMatrix.
    """
    bricks: List[Brick] = []

    # 1. Intro phrases
    bricks.append(
        Brick(
            audio_id="brk_intro_01",
            role="CORE",
            category="fact",
            intent=Intent.greeting,
            text="Алло, слушайте...",
            emotion=Emotion.neutral,
            intensity=1,
            duration_ms=2000,
            speech_rate="normal",
            subfolder="bricks",
        )
    )
    bricks.append(
        Brick(
            audio_id="brk_intro_02",
            role="CORE",
            category="fact",
            intent=Intent.greeting,
            text="Помогите!",
            emotion=Emotion.panic,
            intensity=1,
            duration_ms=2000,
            speech_rate="normal",
            subfolder="bricks",
        )
    )

    # 2. Factoids -> situation
    for key, text in data.factoids.items():
        is_panic = "2" in str(key)
        emotion = Emotion.panic if is_panic else Emotion.neutral
        bricks.append(
            Brick(
                audio_id=str(key),
                role="CORE",
                category="fact",
                intent=Intent.situation,
                text=str(text),
                emotion=emotion,
                intensity=1,
                duration_ms=2000,
                speech_rate="normal",
                subfolder="bricks",
            )
        )

    # 3. Caller ID
    gt = data.ground_truth or {}
    if "fio" in gt and gt["fio"]:
        bricks.append(
            Brick(
                audio_id="brk_caller_fio",
                role="CORE",
                category="fact",
                intent=Intent.caller_id,
                text=str(gt["fio"]),
                emotion=Emotion.neutral,
                intensity=1,
                duration_ms=2000,
                speech_rate="normal",
                subfolder="bricks",
            )
        )
    if "phone" in gt and gt["phone"]:
        bricks.append(
            Brick(
                audio_id="brk_caller_phone",
                role="CORE",
                category="fact",
                intent=Intent.caller_id,
                text=str(gt["phone"]),
                emotion=Emotion.neutral,
                intensity=1,
                duration_ms=2000,
                speech_rate="normal",
                subfolder="bricks",
            )
        )

    # 4. Address
    if "street" in gt and gt["street"]:
        street_text = str(gt["street"])
        if gt.get("house"):
            street_text = f"{street_text}, {gt['house']}"
        bricks.append(
            Brick(
                audio_id="brk_address_01",
                role="CORE",
                category="fact",
                intent=Intent.address,
                text=street_text,
                emotion=Emotion.neutral,
                intensity=1,
                duration_ms=2000,
                speech_rate="normal",
                subfolder="bricks",
            )
        )

    return BricksMatrix(
        ticket_uuid=data.ticket_id,
        bricks=bricks,
    )
