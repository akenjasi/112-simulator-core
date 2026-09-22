# ТЗ для ИИ-агента: Миграция `bricks_compiler.py` (V1 -> V2)

**Контекст:** 
Мы переносим симулятор 112 на V2 архитектуру. Компилятор Bricks (матрицы диалога) берет сгенерированные фактоиды и данные тикета (заявителя) и генерирует из них структурированное дерево ответов для звонка. 
Ранее он сохранял результат в JSON-файл. Теперь это должна быть "чистая функция", возвращающая строго типизированный Pydantic-объект, который позже другой слой сохранит в БД.

**Разрешенные для изменения файлы (создай их):**
1. `backend/schemas/bricks.py`
2. `backend/core/bricks_compiler.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Файл тестов: `tests/test_bricks_compiler.py`

**Требования к реализации:**
1. В `backend/schemas/bricks.py` создай:
   - `Emotion` (str, Enum): `neutral`, `panic`.
   - `Intent` (str, Enum): `intro`, `caller_id`, `address`, `situation`, `victims`, `outro`.
   - `Brick` (BaseModel): поля `audio_id: str`, `role: str`, `category: str`, `intent: Intent`, `text: str`, `emotion: Emotion`, `intensity: int`, `duration_ms: int`, `speech_rate: str`, `subfolder: str`.
   - `BricksMatrix` (BaseModel): поля `ticket_uuid: str`, `bricks: list[Brick]`.
   - `TicketData` (BaseModel): поля `ticket_id: str`, `plot: str = ""`, `factoids: dict[str, str] = {}`, `ground_truth: dict[str, str] = {}`.
2. В `backend/core/bricks_compiler.py` реализуй синхронную функцию `def compile_ticket(data: TicketData) -> BricksMatrix`:
   - Функция должна собрать базовый массив `Brick` объектов.
   - Как минимум, захардкодь добавление 1-2 вступительных фраз (intent="intro", текст "Алло, слушайте...", "Помогите!").
   - Переложи все ключи/значения из `data.factoids` в брики с `intent="situation"`. Ключ (например "SM1") запиши в `audio_id` или сгенерируй свой, а значение в `text`. Эмоцию определяй по наличию двойки в ключе (например, "SM2" - panic).
   - Если в `data.ground_truth` есть `fio` или `phone` - создай брик для `caller_id`.
   - Если есть `street` - создай брик для `address`.
   - Остальные поля заполняй заглушками (например `intensity=1`, `duration_ms=2000`, `speech_rate="normal"`, `subfolder="bricks"`, `role="CORE"`, `category="fact"`).
   - Верни заполненный `BricksMatrix`.

**Проверка:**
Запусти `pytest tests/test_bricks_compiler.py -v`.
Доложи о результатах.
