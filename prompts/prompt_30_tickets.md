# ТЗ 30: База Билетов и Фоновая Генерация (TTS)

**Статус:** Готово к выполнению воркером
**Расположение файлов:**
- `backend/models/domain_02.py` (БД модели билетов)
- `backend/schemas/domain_02.py` (Схемы валидации)
- `backend/api/router_tickets.py` (Эндпоинты Базы билетов)

## Контекст и Архитектура
Реализуем интерфейс "База билетов" для преподавателя.
Билеты генерируются не по одному, а батчами (от 1 до 20 штук). Так как после текстовой генерации билета его чанки ("кирпичики") должны быть прогнаны через локальный движок `SileroTTSV2` (что занимает время), генерация должна уходить в `BackgroundTasks` FastAPI.

## Задачи для Backend-воркера

1. **БД Модель Билета (`domain_02.py`):**
   - Обновить/Создать модель таблицы для сгенерированных билетов (например, `GeneratedTicket`). 
   - Необходимые поля: `id` (UUID), `category` (String), `subcategory` (String, nullable), `complexity` (Integer, 1-3), `plot` (Text), `factoids` (JSON), `ground_truth` (JSON), `etalon_services` (JSON), `created_at` (DateTime).

2. **Схемы Pydantic (`schemas/domain_02.py`):**
   - `TicketGenerateRequest`: `category` (str), `subcategory` (Optional[str]), `count` (int, ge=1, le=20, default=10).
   - `TicketFilterParams`: `category`, `subcategory`, `complexity` (все опциональные).

3. **Эндпоинт `GET /api/tickets`:**
   - Возвращает список всех билетов из БД.
   - Поддерживает фильтрацию по Query-параметрам (category, subcategory, complexity).

4. **Эндпоинт `POST /api/tickets/generate` (Асинхронная задача):**
   - Принимает `TicketGenerateRequest`.
   - Немедленно отвечает `202 Accepted` `{"message": "Генерация начата", "task_id": "uuid"}`.
   - Передает выполнение в функцию `BackgroundTasks`:
     - Вызывает `generate_tickets(...)` (которую мы написали в 27 ТЗ).
     - Сохраняет билеты в БД.
     - Для каждого билета вызывает `bricks_compiler.compile_ticket`, берет полученную `BricksMatrix`.
     - Для каждого кирпичика из матрицы вызывает `tts_engine_v2.synthesize(text)`, чтобы закешировать аудиофайлы на жестком диске.

5. **Эндпоинт `GET /api/tickets/status` (Для честного UI):**
   - Возвращает статус фоновых генераций (например, количество оставшихся в очереди билетов или просто `is_generating: boolean`), чтобы фронтенд мог опрашивать его и показывать честный лоадер.

6. **Ограничения и рекомендации:**
   - Для TTS импортируйте `from backend.core.tts_v2 import tts_engine_v2`.
   - Не заставляйте фронтенд ждать ответа 5 минут (поэтому строго `BackgroundTasks`).
   - Для поиска шаблонов по категории использовать `data/classifier_ekp.json` (загружать его лениво).

## Команда проверки
Запустите:
`pytest tests/test_30_tickets.py -v`
Убедитесь, что лимиты на count (до 20) и сложность (до 3) отрабатывают корректно.
