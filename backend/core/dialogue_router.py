from __future__ import annotations

from backend.schemas.bricks import Brick, Intent
from backend.schemas.router import SessionState


def process_turn(
    current_state: SessionState,
    matrix_bricks: list[Brick],
    operator_intent: Intent,
) -> tuple[Brick | None, SessionState]:
    selected_brick: Brick | None = None
    for brick in matrix_bricks:
        if brick.intent == operator_intent:
            selected_brick = brick
            break

    new_state = current_state.model_copy(
        deep=True,
        update={
            "asked_intents": [*current_state.asked_intents, operator_intent]
        },
    )

    return selected_brick, new_state
