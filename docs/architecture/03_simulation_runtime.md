# Домен: Рантайм Экзамена и Сессии (Simulation Runtime)

Этот домен описывает структуры данных, живущие в оперативной памяти (или Redis) в момент прохождения занятия курсантом.

ТЗ разд. 10 описывает **два принципиально разных типа практических занятий**, каждый из которых имеет собственную структуру сессии:
- **`CALL_SIMULATION`** — курсант принимает имитированный звонок и заполняет карточку (Сценарий 2 ТЗ)
- **`CARD_ACTIONS`** — курсант получает готовые карточки из пула и совершает с ними действия оператора ДДС (Сценарий 3 ТЗ)

---

## JSON-контракты (Схемы данных)

### 1. Назначение (Assignment)
Связывает утвержденный сценарий с учебной группой или конкретным курсантом.

```json
{
  "assignment_id": "uuid-v4",
  "scenario_id": "uuid-scenario",   // null если тип CARD_ACTIONS с динамическим пулом
  "card_pool_ids": ["uuid-s1", "uuid-s2", "uuid-s3"], // Для CARD_ACTIONS: явный пул карточек
  "session_type": "CALL_SIMULATION", // "CALL_SIMULATION" | "CARD_ACTIONS"
  "card_pool_source": null,          // null | "AI_GENERATED" | "CADET_CARD" | "MIXED" — режим авто-выборки пула (ТЗ сценарий 3)
  "mode": "TRAINING",                // "TRAINING" — обучение (подсказки разрешены)
                                     // "EXAM" — аттестация (подсказки отключены, строгий тайминг)
  "group_id": "uuid-group",          // Назначение на группу
  "cadet_id": null,                  // Назначение на конкретного курсанта (null если на группу)
  "assigned_by": "uuid-teacher",
  "available_from": "2026-09-22T09:00:00Z", // Открывается не раньше этой даты
  "deadline": "2026-10-01T23:59:59Z",
  "is_active": true
}
```

### 2. Сессия типа CALL_SIMULATION (ExamSession)
Живёт в ОЗУ / Redis. Отслеживает каждое слово и каждую секунду вызова.

> **Архитектурное решение:** Звонок эмулируется в браузере через Web Audio API + гарнитуру.
> Никакого локального SIP-сервера нет. TTS-аудио (из `ai_content.audio_cache_refs`) воспроизводится
> фронтендом напрямую. Курсант надевает гарнитуру и слышит «звонящего» — это браузерная эмуляция.

```json
{
  "session_id": "uuid-v4",
  "session_type": "CALL_SIMULATION",
  "assignment_id": "uuid-assignment",
  "cadet_id": "uuid-cadet",
  "status": "IN_PROGRESS", // "INITIALIZED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED"
  "start_time": "2026-09-22T12:05:00Z",
  "end_time": null,

  // Браузерная эмуляция звонка (Web Audio API + гарнитура, без SIP/VoIP сервера)
  // TTS-аудио воспроизводится из ScenarioTicket.ai_content.audio_cache_refs
  "browser_call": {
    "call_status": "ACTIVE",        // "RINGING" | "ACTIVE" | "ENDED"
    "tts_source": "ai_factoids",    // Аудио из ai_content.audio_cache_refs сценария
    "audio_record_path": "/media/sessions/uuid-session/call.wav" // Запись сессии (опционально)
  },

  "dynamic_state": {
    "current_panic_level": 50,   // Меняется в зависимости от тона курсанта (0–100)
    "asked_intents": [0, 3],     // Категории вопросов, которые курсант уже задал
    "cliche_violations": 0       // Счётчик канцелярского языка
  },

  "dialogue_log": [
    {
      // Реплика оператора
      "timestamp": "2026-09-22T12:05:05Z",
      "speaker": "CADET",
      "text": "Система-112, что у вас случилось?",
      "detected_intent": 3,          // Цифра 0–9 из классификатора Qwen 0.8B
      "intent_name": "situation"      // Текстовый ключ intent
    },
    {
      // Ответ бота-заявителя
      "timestamp": "2026-09-22T12:05:07Z",
      "speaker": "BOT",
      "text": "Кухня полыхает, всё в дыму, дышать нечем!",
      "audio_id": "brk_fact_situation_02",  // ID кирпичика из BricksMatrix
      "emotion": "panic",                    // "neutral" | "panic" | "angry"
      "state": "panic",                      // Состояние бота: "grounded" | "panic" | "раздражение"
      "panic_level": 65,                     // Текущий уровень паники (0–100)
      "event": "details_revealed",           // Семантическое событие
      "semantic_event": "DIALOGUE"           // "DIALOGUE" | "IRRITATION" | "CLICHE_RAGE"
    }
  ],

  // Буферизация при сбоях сети (ТЗ разд. 7: «до 30 сек без потери данных»)
  "offline_buffer": {
    "is_buffering": false,         // true = сеть недоступна, данные накапливаются локально
    "buffered_since": null,        // ISO timestamp начала буферизации
    "pending_events": []           // Несинхронизированные события для отправки при восстановлении
  }
}
```

### 3. Сессия типа CARD_ACTIONS (CardActionSession)
Курсант получает карточки из пула по одной и совершает действия оператора ДДС.
Этот режим реализует Сценарий 3 ТЗ разд. 10.

```json
{
  "session_id": "uuid-v4",
  "session_type": "CARD_ACTIONS",
  "assignment_id": "uuid-assignment",
  "cadet_id": "uuid-cadet",
  "status": "IN_PROGRESS", // "INITIALIZED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED"
  "start_time": "2026-09-22T13:00:00Z",
  "end_time": null,

  "card_queue": {
    "total_cards": 10,                          // Всего карточек в пуле для этой сессии
    "current_card_index": 2,                    // Текущая позиция
    "remaining_scenario_ids": ["uuid-s3", "..."] // Очередь оставшихся сценариев (перемешана случайно)
  },

  "card_results": [
    {
      "scenario_id": "uuid-s1",
      "card_id": "uuid-card-1",       // IncidentCard, с которой работал курсант
      "action_taken": "TRANSFERRED_TO_DDS_101", // Что сделал курсант с карточкой
      "dispatcher_reply_text": "Бригада АЦ-40 выехала", // Введённый текст ответа
      "time_taken_sec": 22,
      "time_limit_sec": 30,
      "is_time_breached": false,
      "timestamp": "2026-09-22T13:00:22Z"
    }
  ],

  // Буферизация при сбоях — аналогично ExamSession
  "offline_buffer": {
    "is_buffering": false,
    "buffered_since": null,
    "pending_events": []
  }
}
```

### 4. Справочный Материал (Reference Material)
Документация, доступная курсанту во время сессии. Привязывается к сценариям через `reference_material_ids`.

```json
{
  "material_id": "uuid-v4",
  "title": "Инструкция по опросу при ДТП",
  "content_html": "<p>Алгоритм действий...</p>",
  "category": "ДТП",             // Для фильтрации по теме занятия
  "tags": ["маршрутизация", "скорая", "полиция"],
  "created_by": "uuid-teacher",
  "created_at": "2026-09-22T10:00:00Z",
  "is_active": true
}
```

---

## Пояснения к session_type

| `session_type` | Что делает курсант | Откуда звонок |
|---|---|---|
| `CALL_SIMULATION` | Надевает гарнитуру, принимает браузерный звонок, заполняет карточку | Браузер воспроизводит TTS-аудио из `ai_content.audio_cache_refs` через Web Audio API |
| `CARD_ACTIONS` | Получает готовую карточку из пула, совершает действие оператора ДДС + вводит текст ответа | Нет звонка; карточки из пула `card_queue` |

Преподаватель завершает оба типа занятий в любой момент (`ABORTED`). После завершения система формирует `SessionReport`.
