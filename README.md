# 112 Simulator V2 Backend

Серверная часть для симулятора оператора службы 112 (Вторая версия).
Проект переписан на современный асинхронный стек с использованием FastAPI и SQLAlchemy (SQLite/PostgreSQL). Основной упор сделан на JSON-форматы для взаимодействия, интеграцию AI-модулей (генерация сценариев, ведение диалога) и модульную архитектуру.

## Технологический стек
- **Python 3.11+**
- **FastAPI** — основной веб-фреймворк для API.
- **SQLAlchemy (Async)** — ORM для работы с базой данных (aiosqlite для локальной разработки).
- **Pydantic V2** — строгая типизация, валидация данных и JSON-схемы.
- **Pytest & pytest-asyncio** — автоматизированное тестирование асинхронных и синхронных модулей.

## Архитектура диалогового движка (V2 Engine)

Диалоговый движок симулирует звонящего заявителя и построен по принципу **Functional Core, Imperative Shell** (изолированная чистая бизнес-логика без привязки к ФС и тяжелым библиотекам инференса):

```
[Генерация сценария / Factoids]
          │  backend/core/factoids_llm.py (async, HTTP к LLM)
          ▼
    FactoidsResponse (SM1, SM2, SD1, SD2)
          │
          │  backend/core/bricks_compiler.py (чистая функция)
          ▼
    BricksMatrix (каталог реплик с интентами и эмоциями)
          │
          ▼
[Рантайм звонка (Turn Loop)]
1. Реплика оператора (текст)
   ──► backend/core/intent_classifier.py (async, классификация интента 0–9)
2. (SessionState, intent_id, BricksMatrix)
   ──► backend/core/dialogue_router.py (чистая функция process_turn)
   ──► (reply_text, updated_SessionState)
3. reply_text
   ──► backend/core/tts_engine.py (async, HTTP к микросервису TTS)
   ──► audio_bytes (стриминг / сохранение через фоновые задачи)
```

### Ключевые модули ядра (`backend/core/`)
1. **`factoids_llm.py`** — асинхронная генерация смысловых фактоидов сценария (описание ситуации, детали в нейтральном и паническом тоне). Вход/выход типизированы через схемы `backend/schemas/factoids.py`.
2. **`bricks_compiler.py`** — чистая функция `compile_ticket`, которая детерминированно компилирует фактоиды и ground truth билета в структуру `BricksMatrix` (`backend/schemas/bricks.py`). Не обращается к диску.
3. **`intent_classifier.py`** — асинхронная классификация намерения оператора (`classify_intent`) в одну из 10 категорий (0: greeting, 1: address, 2: address_details, 3: situation, 4: victims, 5: caller_id, 6: phone, 7: repeat, 8: bureaucracy, 9: outro).
4. **`dialogue_router.py`** — чистая функция `process_turn`, рассчитывающая реакцию заявителя, динамику уровня паники, штрафы за бюрократические вопросы и реакцию на повторы. Состояние сессии (`SessionState`) обновляется иммутабельно.
5. **`tts_engine.py`** — асинхронный синтез речи (`generate_audio`), возвращающий сырые байты аудио. Не зависит от локального Torch/Silero и файлов на диске.

## Быстрый старт

1. Установите зависимости:
   ```bash
   pip install -r requirements.txt
   ```
2. Создайте файл `.env` из примера:
   ```bash
   cp .env.example .env
   ```
3. Запустите сервер локально:
   ```bash
   ./run.sh
   ```
   Сервер будет доступен по адресу `http://localhost:8000`. 
   Swagger UI документация: `http://localhost:8000/docs`.

4. Наполнение базы данных тестовыми данными:
   ```bash
   python seed.py
   ```

## Запуск тестов
```bash
pytest -v
```
Все тесты изолированы и не требуют подключенных внешних сервисов (LLM/TTS мокированы).
