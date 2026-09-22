import pytest
from backend.schemas.router import SessionState
from backend.schemas.bricks import Intent, Brick, Emotion
from backend.core.dialogue_router import process_turn

def test_process_turn_basic():
    # Начальный стейт
    state = SessionState(panic_level=50, asked_intents=[])
    
    # Фейковая матрица
    matrix_bricks = [
        Brick(
            audio_id="1", role="CORE", category="fact", 
            intent=Intent.address, text="Ленина 45", 
            emotion=Emotion.neutral, intensity=1, 
            duration_ms=1000, speech_rate="normal", subfolder=""
        )
    ]
    
    # Эмулируем, что LLM классифицировала вопрос оператора как запрос адреса
    next_brick, new_state = process_turn(
        current_state=state, 
        matrix_bricks=matrix_bricks, 
        operator_intent=Intent.address
    )
    
    # Проверяем, что роутер выдал правильную реплику
    assert next_brick is not None, "Роутер должен найти реплику"
    assert next_brick.intent == Intent.address, "Роутер должен вернуть реплику с нужным интентом"
    assert next_brick.text == "Ленина 45"
    
    # Проверяем, что стейт обновился (Functional Core - новый стейт возвращается из функции)
    assert Intent.address in new_state.asked_intents, "Интент должен быть добавлен в историю стейта"
    assert state.asked_intents == [], "Оригинальный стейт не должен быть мутирован"
