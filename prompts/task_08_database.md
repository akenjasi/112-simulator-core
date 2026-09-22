# ТЗ для ИИ-агента: Создание слоя Базы Данных (SQLAlchemy)

**Контекст:**
Нам нужно научить приложение сохранять матрицы (Bricks) и состояния сессий (State) в базу данных SQLite. Будем использовать асинхронный SQLAlchemy.

**Разрешенные для изменения файлы (создай их):**
1. `backend/models/base.py`
2. `backend/models/domain_02.py`
3. `backend/models/domain_03.py`
4. `backend/db/database.py`

**ЗАПРЕЩЕНО ИЗМЕНЯТЬ:**
- Файлы тестов.

**Требования к реализации:**
1. В `backend/models/base.py` создай `Base = declarative_base()`.
2. В `backend/db/database.py` настрой асинхронный движок (через `aiosqlite`) для локальной БД `sqlite+aiosqlite:///./app.db` и `async_sessionmaker`. Создай зависимость (Dependency) `get_db()`.
3. В `backend/models/domain_02.py` создай таблицу `ScenarioTicketModel` (поля: `id` int, `ticket_uuid` string, `matrix_json` json).
4. В `backend/models/domain_03.py` создай таблицу `SessionStateModel` (поля: `id` int, `session_id` string, `panic_level` int, `asked_intents` string). (Массив интентов будем хранить как строку через запятую или JSON).

**Проверка:**
Запусти `pytest tests/test_database.py -v`.
Доложи о результатах.
