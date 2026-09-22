# ТЗ для ИИ-агента: Миграция `runtime_router.py` (Этап 2: Классификатор интентов)

**Контекст:** 
Мы продолжаем переносить `runtime_router.py`. Первая часть (чистая функция роутинга) готова. Теперь нужно вынести вторую часть — общение с LLM для понимания намерений оператора 112 (Intent Classifier). 

**Разрешенные для изменения файлы (создай их):**
1. `backend/core/intent_classifier.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Файл тестов: `tests/test_classifier.py`
- Файлы из прошлых этапов (`backend/schemas/bricks.py`, `router.py` и т.д.).

**Требования к реализации:**
1. В `backend/core/intent_classifier.py` реализуй асинхронную функцию `async def classify_intent(operator_text: str) -> Intent`:
   - (Импортируй `Intent` из `backend.schemas.bricks`).
   - Пока реальная LLM (Ollama/vLLM) не подключена, сделай простую заглушку на основе ключевых слов (`if "адрес" in text.lower(): return Intent.address`, `if "пострадавш" in text.lower(): return Intent.victims` и так далее, по умолчанию возвращай `Intent.situation`).
   - Функция обязательно должна быть асинхронной (с заделом на будущий HTTP-запрос к микросервису LLM).

**Проверка:**
Запусти `pytest tests/test_classifier.py -v`.
Доложи о результатах.
