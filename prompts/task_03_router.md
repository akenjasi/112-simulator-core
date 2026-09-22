# ТЗ для ИИ-агента: Миграция `runtime_router.py` (Этап 1: Чистая функция роутинга)

**Контекст:** 
Мы переносим симулятор 112 на V2 архитектуру. Старый `runtime_router.py` сочетал в себе LLM-классификатор, хранилище состояния и выбор реплики.
Теперь мы делаем "Functional Core". Роутер — это чистая функция, которая принимает текущее состояние (State), список реплик (Matrix) и Интент оператора (уже распознанный другим модулем), а возвращает выбранную реплику и обновленный State.

**Разрешенные для изменения файлы (создай их):**
1. `backend/schemas/router.py`
2. `backend/core/dialogue_router.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Файл тестов: `tests/test_router.py`
- Файлы из прошлых этапов (`backend/schemas/bricks.py` и т.д.).

**Требования к реализации:**
1. В `backend/schemas/router.py` создай:
   - Pydantic-модель `SessionState`. Поля: `panic_level: int = 50`, `asked_intents: list[str] = []` (в будущем мы ее расширим, пока достаточно этого).
2. В `backend/core/dialogue_router.py` реализуй функцию `def process_turn(current_state: SessionState, matrix_bricks: list[Brick], operator_intent: Intent) -> tuple[Brick | None, SessionState]`:
   - (Не забудь импортировать `Brick` и `Intent` из `backend.schemas.bricks`).
   - Функция должна найти в массиве `matrix_bricks` первый попавшийся брик, у которого `intent == operator_intent`.
   - Если нашла — возвращает его, если нет — `None`.
   - Функция должна вернуть **новый** объект `SessionState`, скопировав данные из `current_state` и добавив `operator_intent` в список `asked_intents`.
   - ВАЖНО: Не изменяй `current_state` напрямую (иммутабельность).

**Проверка:**
Запусти `pytest tests/test_router.py -v`.
Доложи о результатах.
