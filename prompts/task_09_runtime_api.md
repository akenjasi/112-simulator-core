# ТЗ для ИИ-агента: Создание Runtime API (Звонок)

**Контекст:**
БД готова, ядро готово. Осталось написать эндпоинт, который будет принимать запросы во время самого звонка.

**Разрешенные для изменения файлы:**
1. `backend/api/router_call.py`
2. `backend/main.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Файлы тестов.
- `backend/core/*`

**Требования к реализации:**
1. В `backend/api/router_call.py` создай `APIRouter(prefix="/api/v1/call")`.
2. Реализуй `POST /process_turn`:
   - Принимает JSON: `session_id` (str), `operator_text` (str).
   - Классифицирует интент через `await classify_intent(operator_text)`.
   - В идеале должен загружать стейт из БД, прогонять через `process_turn` роутера, возвращать текст, генерировать аудио через `generate_audio` и сохранять стейт. (Для тестов достаточно просто вернуть структуру ответа `{"text": "реплика", "audio_url": "..."}`).
3. В `backend/main.py` подключи `router_call`.

**Проверка:**
Запусти `pytest tests/test_runtime_api.py -v`.
Доложи о результатах.
