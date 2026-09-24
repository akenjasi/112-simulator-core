# ТЗ 27: Конфигурация Занятия (Сценарий 3)

**Статус:** Готово к выполнению воркером
**Расположение файлов:**
- `backend/schemas/domain_03.py` (Схемы сессии)
- `backend/models/domain_03.py` (Модели сессии)

## Контекст
Реализуем Сценарий 3: Настройка занятия. Преподаватель задает конфигурацию (сложность, категории инцидентов, лимиты времени и ошибок), и эта конфигурация фиксируется в базе данных при создании новой учебной сессии.

## Задачи для воркера

1. **Создать Enum `ComplexityLevel` (в `backend/schemas/domain_03.py`):**
   - Значения: `level_1`, `level_2`, `level_3`, `mixed`.

2. **Создать схему Pydantic `SessionConfigCreate`:**
   - `group_id` (int)
   - `categories` (list[str])
   - `complexity` (ComplexityLevel)
   - `error_limit` (int, опционально)
   - `time_limit_seconds` (int, опционально, по умолчанию 30)
   
   **Валидатор (model_validator):**
   - Если `error_limit` не передан, он должен устанавливаться автоматически в зависимости от `complexity`:
     - `level_1` -> 0
     - `level_2` -> 1
     - `level_3` или `mixed` -> 2

3. **Создать/Обновить модель SQLAlchemy `ExamSession` (или `TrainingSession`) в `backend/models/domain_03.py`:**
   - Добавить колонки для хранения настроек (можно хранить `categories` как JSON/ARRAY, а `complexity` как Enum/String).
   - Поля `error_limit` (Integer) и `time_limit_seconds` (Integer).

## Команда проверки
Запустите:
`pytest tests/test_27_session_schema.py -v`
Убедитесь, что логика дефолтных лимитов работает корректно.
