# ТЗ для ИИ-агента: Миграция `factoid_generator.py` (V1 -> V2)

**Контекст:** 
Мы переносим симулятор 112 на новую асинхронную V2 архитектуру (FastAPI, Pydantic V2). 
Мы договорились о "мягком переносе": логика остается прежней (4 фактоида), но архитектура делается гибкой (возвращаем список объектов через Pydantic, вызываем внешнюю LLM асинхронно по HTTP).

**Разрешенные для изменения файлы (создай их):**
1. `backend/schemas/factoids.py`
2. `backend/core/factoids_llm.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Файл тестов: `tests/test_factoids_llm.py`

**Требования к реализации:**
1. В `backend/schemas/factoids.py` создай:
   - `FactoidGenerationRequest` со всеми полями из V1 (`plot`, `street`, `fio` и т.д. — все `Optional[str] = ""` и `ground_truth: Optional[dict] = None`).
   - `Factoid` (поля: `marker: str`, `text: str`).
   - `FactoidsResponse` (поле: `factoids: list[Factoid]`).
2. В `backend/core/factoids_llm.py` реализуй асинхронную функцию-заглушку `async def call_llm_api(prompt: str) -> str`. Внутри она должна просто возвращать строку `"SM1: У нас начался пожар.\nSM2: Всё в дыму!\nSD1: Огонь перекидывается.\nSD2: Ничего не видно!"`. (Позже мы добавим сюда `httpx` для запроса к Ollama/vLLM, пока просто верни строку).
3. В `backend/core/factoids_llm.py` реализуй главную функцию `async def generate_factoids(request: FactoidGenerationRequest) -> FactoidsResponse`:
   - Сформируй промпт из `request`.
   - Вызови `await call_llm_api(prompt)`.
   - Распарси ответ LLM, разбив его на маркер (до двоеточия) и текст (после двоеточия).
   - Верни заполненный `FactoidsResponse`.

**Проверка:**
Запусти тест: `pytest tests/test_factoids_llm.py -v`
Доложи о результатах.
