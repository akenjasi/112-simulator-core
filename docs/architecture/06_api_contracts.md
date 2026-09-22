# Домен 06: API-Контракты (Эндпоинты)

Этот домен закрывает три зазора архитектуры и описывает **все HTTP/SSE эндпоинты**,
связывающие домены 01–05 в единую систему.

> **Стек:** FastAPI. Все v2-пути — `/api/v2/...`.
> **Принцип:** HTTP-команды мутируют состояние. SSE сообщает о прогрессе и изменениях.
> Каждое состояние — server-owned, не зависит от того, подключён ли браузер.

---

## Зазор 1 ✅ Автокомпиляция BricksMatrix

**Решение:** компиляция происходит на сервере после завершения SSE-генерации,
независимо от состояния браузерного соединения. Клиент получает итоговое событие,
но если соединение оборвалось — компиляция всё равно выполнится.
Дополнительный recovery-эндпоинт позволяет перезапустить компиляцию вручную.

### Поток генерации + компиляции

```
POST /api/v2/scenarios/{scenario_id}/generate
→ Запускает генерацию. Возвращает job_id.

GET /api/v2/scenarios/{scenario_id}/events         (SSE)
→ Стриминг прогресса:

  event: status
  data: {"text": "Инициализация модели..."}

  event: factoid
  data: {"marker": "SM1", "text": "У нас начался пожар в квартире, горит кухня."}

  event: factoid
  data: {"marker": "SM2", "text": "Кухня полыхает, всё в дыму, дышать нечем!"}

  event: factoid
  data: {"marker": "SD1", "text": "Дым уже пошёл в коридор."}

  event: factoid
  data: {"marker": "SD2", "text": "Ничего не видно, вся мебель горит!"}

  event: compiled
  data: {"ticket_id": "uuid", "bricks_file": "bricks_ticket_uuid_sit_01.json",
          "total_bricks": 18, "tts_compiled": false, "status": "READY_FOR_PREVIEW"}
  ← stream ends

→ Сервер устанавливает workflow_state.status = "DRAFT", preview_confirmed = false
```

### Recovery-эндпоинт (если браузер отключился)

```
POST /api/v2/scenarios/{scenario_id}/compile
→ Идемпотентный. Перезапускает compile_ticket() из сохранённых factoids.
→ Полезен при отладке и ошибках сети.

Response 200:
{
  "ticket_id": "uuid",
  "bricks_file": "bricks_ticket_uuid_sit_01.json",
  "total_bricks": 18,
  "status": "READY_FOR_PREVIEW"
}

Response 422 (BRICKS_NOT_COMPILED если factoids ещё не сгенерированы):
{
  "error": "FACTOIDS_MISSING",
  "message": "Сначала запустите генерацию: POST /scenarios/{id}/generate"
}
```

---

## Зазор 2 ✅ Жизненный цикл сессии

**Решение:** преподаватель открывает занятие для группы (одна команда).
Каждый курсант сам инициирует свою сессию. Сервер управляет состояниями.

### 2a. Преподаватель открывает занятие

```
POST /api/v2/assignments/{assignment_id}/open
Auth: TEACHER

Response 200:
{
  "assignment_id": "uuid-assignment",
  "session_type": "CALL_SIMULATION",
  "opened_at": "2026-09-22T13:00:00Z",
  "cadets_expected": 12,
  "status": "WAITING_FOR_CADETS"
}

Error 409 (уже открыто):
{ "error": "ASSIGNMENT_ALREADY_OPEN" }
```

### 2b. Курсант начинает свою сессию

```
POST /api/v2/assignments/{assignment_id}/sessions/start
Auth: CADET

Response 200:
{
  "session_id": "uuid-session",
  "session_type": "CALL_SIMULATION",
  "ticket_id": "uuid-ticket",
  "card_queue_total": null,          // null для CALL_SIMULATION; число для CARD_ACTIONS

  "initial_phrase": {
    "text": "Алло! Быстрее!",
    "audio_id": "brk_intro_panic_01",
    "tts_url": "/api/v2/tts/brk_intro_panic_01",
    "emotion": "panic"
  },

  "call_status": "RINGING",
  "timing_limit_sec": 30,
  "started_at": "2026-09-22T13:01:00Z"
}

Error 409 (занятие не открыто):
{ "error": "ASSIGNMENT_NOT_OPEN", "message": "Преподаватель ещё не открыл занятие" }

Error 409 (курсант уже имеет активную сессию — идемпотентность):
{ "error": "SESSION_ALREADY_EXISTS", "session_id": "uuid-existing" }
```

### 2c. Реплика оператора → ответ бота

```
POST /api/v2/sessions/{session_id}/message
Auth: CADET

Request:
{ "text": "Система-112, что у вас случилось?" }

Response 200:
{
  "reply": "Кухня полыхает, всё в дыму, дышать нечем!",
  "audio_id": "brk_fact_situation_02",
  "tts_url": "/api/v2/tts/brk_fact_situation_02",
  "emotion": "panic",
  "state": "panic",
  "panic_level": 65,
  "intent": "situation",
  "event": "details_revealed",
  "semantic_event": "DIALOGUE",
  "revealed": {
    "address": false, "victims": false, "details": true, "name": false
  },
  "penalty": null
}

Error 409: { "error": "SESSION_ALREADY_COMPLETED" }
```

### 2d. Курсант отправляет карточку (CALL_SIMULATION)

```
POST /api/v2/sessions/{session_id}/submit_card
Auth: CADET

Request:
{
  "address_text": "Тверская, 13",
  "caller_name": "Иванов П.С.",
  "caller_phone": "+79991234567",
  "has_victims": false,
  "incident_description": "Горит мусорный бак",
  "selected_ekp_code": "П-001-003",
  "assigned_services": ["101"]
}

Response 200:
{
  "card_id": "uuid-card",
  "session_status": "COMPLETED",
  "evaluation_id": "uuid-eval",
  "quick_result": {
    "total_score": 85,
    "time_taken_sec": 42,
    "time_limit_sec": 30,
    "is_time_breached": true,
    "grammar_errors_count": 0
  }
}
```

### 2e. Действие с карточкой (CARD_ACTIONS)

```
POST /api/v2/sessions/{session_id}/card_action
Auth: CADET

Request:
{
  "card_id": "uuid-card",
  "action_taken": "TRANSFERRED_TO_DDS_101",
  "dispatcher_reply_text": "Бригада АЦ-40 выехала"
}

Response 200:
{
  "card_result_saved": true,
  "time_taken_sec": 22,
  "is_time_breached": false,
  "next_card": {                            // null если карточки кончились
    "card_id": "uuid-card-next",
    "scenario_id": "uuid-scenario-next",
    "incident_data": { /* заполненная карточка из пула */ },
    "card_index": 3,
    "total_cards": 10
  }
}
```

### 2f. Преподаватель завершает занятие досрочно

```
POST /api/v2/assignments/{assignment_id}/close
Auth: TEACHER

Request:
{ "reason": "Досрочное завершение" }   // опционально

Response 200:
{
  "closed_at": "2026-09-22T13:25:00Z",
  "sessions_completed": 10,
  "sessions_aborted": 2,
  "report_id": "uuid-report"            // SessionReport создан автоматически
}
```

---

## Зазор 3 ✅ Live-мониторинг преподавателя (SSE)

**Решение:** SSE (односторонний поток, сервер → учитель).
Интерактивные команды (пауза, вмешательство) — отдельные HTTP POST.
SSE поддерживает `Last-Event-ID` для переподключения и heartbeat каждые 15с.

```
GET /api/v2/assignments/{assignment_id}/monitor
Auth: TEACHER
Headers: Accept: text/event-stream

// Первое событие — снимок текущего состояния (snapshot)
event: snapshot
id: 1
data: {
  "assignment_id": "uuid",
  "status": "OPEN",
  "sessions": [
    {"cadet_id": "uuid-1", "cadet_name": "Иванов П.С.",
      "session_id": "uuid-s1", "status": "IN_PROGRESS",
      "elapsed_sec": 18, "panic_level": 50,
      "revealed": {"address": false, "victims": false, "details": true, "name": false}},
    {"cadet_id": "uuid-2", "cadet_name": "Петрова А.И.",
      "session_id": null, "status": "NOT_STARTED"}
  ]
}

// Курсант подключился
event: cadet_joined
id: 2
data: {"cadet_id": "uuid-2", "cadet_name": "Петрова А.И.",
        "session_id": "uuid-s2", "joined_at": "2026-09-22T13:01:30Z"}

// Обновление после каждого message
event: session_update
id: 3
data: {"session_id": "uuid-s1", "cadet_id": "uuid-1",
        "panic_level": 65, "elapsed_sec": 23,
        "revealed": {"address": true, "victims": false, "details": true, "name": false},
        "cliche_violations": 0, "status": "IN_PROGRESS"}

// Карточка сдана
event: card_submitted
id: 4
data: {"session_id": "uuid-s1", "cadet_id": "uuid-1",
        "total_score": 85, "time_taken_sec": 42, "is_time_breached": true}

// Heartbeat (каждые 15 секунд, чтобы SSE-соединение не разорвалось)
event: heartbeat
id: 5
data: {"ts": "2026-09-22T13:02:00Z"}

// Занятие завершено (или закрыто досрочно)
event: assignment_closed
id: 6
data: {"assignment_id": "uuid", "report_id": "uuid-report",
        "completed": 10, "aborted": 2, "closed_at": "2026-09-22T13:25:00Z"}
```

---

## Полный список эндпоинтов

### Сценарии

```
GET    /api/v2/scenarios                               # Список (фильтр: status, category)
POST   /api/v2/scenarios                               # Создать черновик (TEACHER)
GET    /api/v2/scenarios/{id}                          # Полный ScenarioTicket
PATCH  /api/v2/scenarios/{id}                          # Редактировать (TEACHER, DRAFT/EDITED)
POST   /api/v2/scenarios/{id}/generate                 # Запустить генерацию (↑ Зазор 1)
GET    /api/v2/scenarios/{id}/events                   # SSE прогресса генерации
POST   /api/v2/scenarios/{id}/compile                  # Recovery компиляция (Зазор 1)
GET    /api/v2/scenarios/{id}/preview                  # Предпросмотр (→ preview_confirmed=true)
PATCH  /api/v2/scenarios/{id}/approve                  # Утвердить (TEACHER)
PATCH  /api/v2/scenarios/{id}/archive                  # В архив
POST   /api/v2/scenarios/import                        # Пакетный импорт JSON-файла (→ ImportJob)
GET    /api/v2/import-jobs/{job_id}                    # Статус задачи импорта
```

### Назначения

```
GET    /api/v2/assignments                             # Список заданий (по роли)
POST   /api/v2/assignments                             # Создать назначение (TEACHER)
GET    /api/v2/assignments/{id}                        # Детали
POST   /api/v2/assignments/{id}/open                   # Открыть занятие (Зазор 2a)
POST   /api/v2/assignments/{id}/close                  # Завершить досрочно (Зазор 2f)
GET    /api/v2/assignments/{id}/monitor                # SSE мониторинг (Зазор 3)
```

### Сессии

```
POST   /api/v2/assignments/{id}/sessions/start         # Начать сессию (CADET) (Зазор 2b)
GET    /api/v2/sessions/{id}                           # Текущее состояние сессии
POST   /api/v2/sessions/{id}/message                   # Реплика оператора (Зазор 2c)
POST   /api/v2/sessions/{id}/submit_card               # Сдать карточку — CALL (Зазор 2d)
POST   /api/v2/sessions/{id}/card_action               # Действие с карточкой — CARD (Зазор 2e)
```

### TTS

```
GET    /api/v2/tts/{audio_id}                          # WAV по audio_id (Silero MD5-кеш)
```

### Оценки и отчёты

```
GET    /api/v2/evaluations/{id}                        # Результат оценки
PATCH  /api/v2/evaluations/{id}/comment                # expert_comment (TEACHER → аудит)
GET    /api/v2/reports/{id}                            # Отчёт по занятию
GET    /api/v2/reports/{id}/export?format=csv          # Экспорт CSV
GET    /api/v2/reports/{id}/export?format=pdf          # Экспорт PDF
GET    /api/v2/cadets/{cadet_id}/insight               # AIInsight по курсанту
```

### Пользователи и аудит (ADMIN)

```
GET    /api/v2/users                                   # Список пользователей
POST   /api/v2/users                                   # Создать пользователя
PATCH  /api/v2/users/{id}/block                        # Заблокировать
PATCH  /api/v2/users/{id}/unblock                      # Разблокировать
GET    /api/v2/audit-log                               # UserActionLog (с пагинацией)
```

### Справочные материалы

```
GET    /api/v2/materials                               # Список (TEACHER + CADET)
POST   /api/v2/materials                               # Загрузить (TEACHER)
GET    /api/v2/materials/{id}                          # Полный контент
```

---

## Стандарт ошибок

```json
{
  "error": "ASSIGNMENT_NOT_OPEN",
  "message": "Преподаватель ещё не открыл занятие",
  "http_status": 409
}
```

| Код ошибки | HTTP | Когда |
|---|---|---|
| `FORBIDDEN_ROLE` | 403 | Действие недоступно для этой роли |
| `ASSIGNMENT_NOT_OPEN` | 409 | Курсант стартует до открытия занятия |
| `ASSIGNMENT_ALREADY_OPEN` | 409 | Двойное открытие |
| `SESSION_ALREADY_EXISTS` | 409 | Курсант уже имеет активную сессию (→ вернуть существующую) |
| `SESSION_ALREADY_COMPLETED` | 409 | Попытка действия в завершённой сессии |
| `SCENARIO_NOT_APPROVED` | 422 | Назначение неутверждённого сценария |
| `FACTOIDS_MISSING` | 422 | compile без предварительной генерации |
| `BRICKS_NOT_COMPILED` | 422 | Старт сессии до компиляции BricksMatrix |
| `LLM_NOT_READY` | 503 | Модель ещё загружается (первый запуск) |
