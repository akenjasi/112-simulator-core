# ТЗ для ИИ-агента: Создание API-слоя (FastAPI)

**Контекст:**
Ядро (Core) симулятора 112 полностью мигрировано на V2 архитектуру. Теперь нам нужно сделать "обертку" вокруг ядра — HTTP API слой, чтобы фронтенд мог взаимодействовать с бэкендом. 
Мы начнем с создания основного файла приложения и роутера для работы со сценариями (Offline часть).

**Разрешенные для изменения файлы (создай их):**
1. `backend/main.py`
2. `backend/api/router_scenario.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Любые файлы в папках `backend/core/` и `backend/schemas/`.
- Файл тестов `tests/test_api.py`.

**Требования к реализации:**
1. В `backend/api/router_scenario.py` создай `APIRouter(prefix="/api/v1/scenario")`.
2. В этом роутере реализуй два POST-эндпоинта, которые будут служить мостом между HTTP и нашими Core-функциями:
   - `POST /generate_factoids`: Принимает на вход `FactoidGenerationRequest` (импортируй из `backend.schemas.factoids`), вызывает `await generate_factoids(request)` (импортируй из `backend.core.factoids_llm`) и возвращает результат.
   - `POST /compile_ticket`: Принимает `TicketData` (импортируй из `backend.schemas.bricks`), вызывает синхронный `compile_ticket(data)` (импортируй из `backend.core.bricks_compiler`) и возвращает результат.
3. В `backend/main.py` инициализируй FastAPI приложение:
   - Добавь CORS middleware (`CORSMiddleware`), чтобы разрешить запросы с фронтенда (`allow_origins=["*"]`, `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`).
   - Добавь тестовый эндпоинт `GET /health`, возвращающий `{"status": "ok"}`.
   - Подключи роутер из `router_scenario.py` к приложению через `app.include_router(...)`.

**Проверка:**
Запусти `pytest tests/test_api.py -v`.
Доложи о результатах.
