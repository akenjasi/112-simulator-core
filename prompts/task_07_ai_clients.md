# ТЗ для ИИ-агента: Подключение реального ИИ (LLM API)

**Контекст:**
Нам нужно заменить временные заглушки в `core`-модулях на реальные HTTP-запросы к внешнему API (Ollama/vLLM/OpenAI) с использованием библиотеки `httpx`.

**Разрешенные для изменения файлы:**
1. `backend/core/factoids_llm.py`
2. `backend/core/intent_classifier.py`
3. `backend/core/tts_engine.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Файлы тестов.

**Требования к реализации:**
1. В `backend/core/factoids_llm.py` перепиши `async def call_llm_api(prompt: str) -> str`:
   - Сделай POST-запрос через `httpx.AsyncClient` на эндпоинт `http://localhost:11434/v1/chat/completions` (формат OpenAI API).
   - Передай prompt в `messages`.
   - Верни строку `content` из ответа (`response.json()["choices"][0]["message"]["content"]`).
2. В `backend/core/intent_classifier.py` перепиши `classify_intent`:
   - Сделай такой же HTTP запрос к LLM, попросив ее классифицировать интент и вернуть ОДНО слово на английском (соответствующее `Intent` Enum).
   - Распарси ответ в `Intent`.
3. В `backend/core/tts_engine.py` перепиши `generate_audio`:
   - Сделай POST-запрос к абстрактному `http://localhost:8001/tts`.
   - Верни `response.content` (байты).

**Проверка:**
Запусти `pytest tests/test_ai_clients.py -v`.
Доложи о результатах.
