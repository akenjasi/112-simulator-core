# Домен: Оценка, Классификация и ДДС (Assessment & Dispatch)

Этот домен описывает данные, которые генерируются ПОСЛЕ завершения сессии курсанта. Здесь происходит автоматическая проверка (Evaluator), передача карточки Диспетчеру, подсчёт аналитики и формирование отчётности.

---

## JSON-контракты (Схемы данных)

### 1. Карточка Происшествия (Incident Card)
Создаётся курсантом (Оператором-112) во время сессии `CALL_SIMULATION`. В режиме `CARD_ACTIONS` карточка поступает из пула готовой.

```json
{
  "card_id": "uuid-v4",
  "session_id": "uuid-session",
  "scenario_id": "uuid-scenario",  // Ссылка на ScenarioTicket (для сравнения с ground_truth)
  "operator_id": "uuid-cadet",
  "card_origin": "OPERATOR_FILLED", // "OPERATOR_FILLED" (курсант заполнил) | "POOL" (из пула готовых карточек)

  "filled_data": {
    "address_text": "Тверская, 13",
    "caller_name": "Иванов П.С.",
    "caller_phone": "+79991234567",
    "has_victims": false,
    "incident_description": "Горит мусорный бак",
    "selected_ekp_code": "Пожар мусора на улице"
  },

  "assigned_services": ["101"],     // Коды служб, которые курсант решил вызвать
  "status": "TRANSFERRED_TO_DDS"    // "DRAFT" | "TRANSFERRED_TO_DDS" | "CLOSED"
}
```

### 2. Результат Оценки (Evaluation Result)
Формируется автоматически модулем `Evaluator` путём сравнения `IncidentCard` и `ScenarioTicket.ground_truth`.
Преподаватель может добавить `expert_comment`. Любое изменение оценки фиксируется в `UserActionLog`.

```json
{
  "evaluation_id": "uuid-v4",
  "card_id": "uuid-card",
  "session_id": "uuid-session",
  "evaluated_at": "2026-09-22T12:10:00Z",

  "scores": {
    "total_score": 85,              // Итог из 100
    "address_accuracy": 100,        // Адрес совпал с ground_truth
    "classification_accuracy": 100, // Код ЕКП верный
    "services_accuracy": 50,        // Забыл вызвать полицию
    "reply_accuracy": 80            // Для CARD_ACTIONS: близость текста ответа к gt_dispatcher_reply
  },

  "metrics": {
    "time_taken_sec": 45,
    "time_limit_sec": 30,           // Из ScenarioTicket.settings.timing_limit_sec
    "time_penalty": -15,            // Штраф за превышение норматива
    "time_delta_sec": 15            // Превышение нормы (отрицательное = опередил)
  },

  "grammar": {
    "errors_count": 2,
    "allowed_errors": 1,
    "grammar_errors": [
      {
        "field": "incident_description",
        "original": "Горит мусорный бак на тротуаре горит",
        "suggestion": "На тротуаре горит мусорный бак",
        "error_type": "DUPLICATE_WORD"  // "DUPLICATE_WORD" | "PUNCTUATION" | "SPELLING" | "SYNTAX"
      }
    ]
  },

  "errors_list": [
    "Превышен норматив времени на 15 секунд",
    "Не назначена обязательная служба: 102",
    "Грамматические ошибки в поле описания"
  ],

  "expert_comment": "В целом неплохо, но нужно действовать быстрее.", // Заполняется преподавателем
  "expert_modified_at": null,       // ISO timestamp последней правки преподавателем (для аудита)
  "expert_modified_by": null        // UUID преподавателя
}
```

### 3. Отчёт по Занятию (Session Report)
Агрегирует результаты всех курсантов группы по итогам одного занятия.
Формируется преподавателем по завершении занятия. Используется для экспорта (ТЗ разд. 6, 8, 10).

```json
{
  "report_id": "uuid-v4",
  "assignment_id": "uuid-assignment",
  "group_id": "uuid-group",
  "teacher_id": "uuid-teacher",
  "session_type": "CALL_SIMULATION", // "CALL_SIMULATION" | "CARD_ACTIONS"
  "generated_at": "2026-09-22T14:00:00Z",

  "summary": {
    "total_cadets": 12,
    "completed_count": 10,
    "avg_score": 78.5,
    "avg_time_taken_sec": 38,
    "time_limit_sec": 30,
    "avg_time_delta_sec": 8,        // Среднее превышение норматива
    "grammar_error_rate": 0.42,     // Доля сессий с грамматическими ошибками
    "top_error_types": ["PUNCTUATION", "services_missed"]
  },

  "per_cadet": [
    {
      "cadet_id": "uuid-cadet-1",
      "cadet_name": "Иванов Петр Сергеевич",
      "evaluation_id": "uuid-eval-1",
      "total_score": 85,
      "time_taken_sec": 45,
      "is_time_breached": true,
      "grammar_errors_count": 0,
      "errors_list": ["Превышен норматив"]
    }
  ],

  "ai_insights": {
    "common_mistakes": [
      "70% курсантов не уточнили наличие пострадавших",
      "Средний тайминг превышает норматив на 8 сек"
    ],
    "recommendations": [
      "Провести дополнительное занятие по классификации происшествий",
      "Отработать скоростное заполнение адреса"
    ]
  },

  "export_meta": {
    "is_exported": false,
    "exported_formats": [],         // ["CSV", "PDF"] — заполняется после экспорта
    "last_exported_at": null
  }
}
```

### 4. ИИ-Инсайт по Курсанту (AI Cadet Insight)
Персональные аналитические рекомендации по курсанту, формируются по накопленной истории сессий.
Обновляются автоматически после каждой новой оценки.

```json
{
  "insight_id": "uuid-v4",
  "cadet_id": "uuid-cadet",
  "generated_at": "2026-09-22T14:05:00Z",
  "based_on_sessions": 7,           // Количество сессий в выборке

  "skill_profile": {
    "address_accuracy_avg": 95,
    "classification_accuracy_avg": 72,
    "services_accuracy_avg": 80,
    "avg_time_taken_sec": 40,
    "grammar_error_rate": 0.28
  },

  "weak_areas": ["classification_accuracy", "timing"],
  "strong_areas": ["address_accuracy"],
  "recommendations": [
    "Повторить классификатор ЕКП по разделу 'Пожары'",
    "Отработать укладку в 30-секундный норматив"
  ],
  "trend": "IMPROVING"              // "IMPROVING" | "STABLE" | "DECLINING"
}
```

### 5. Таймер Реагирования ДДС (SLA Task)
Запускается для курсанта-диспетчера, когда карточка падает ему в ленту (режим `CARD_ACTIONS`).

```json
{
  "sla_task_id": "uuid-v4",
  "card_id": "uuid-card",
  "target_department": "DDS_101",
  "dispatcher_id": "uuid-cadet-dispatcher", // Назначается, когда диспетчер берёт в работу

  "timestamps": {
    "received_at": "2026-09-22T12:10:05Z",
    "deadline_at": "2026-09-22T12:10:35Z",  // +30 секунд по умолчанию (ТЗ разд. 8)
    "responded_at": "2026-09-22T12:10:40Z"
  },

  "is_breached": true,                      // true = просрочил
  "breach_delta_sec": 5,                    // На сколько секунд просрочил
  "dispatcher_reply": "Бригада АЦ-40 выехала"
}
```

---

## Поток данных после завершения занятия

```
ExamSession / CardActionSession (COMPLETED)
    │
    ├─→ Evaluator.py сравнивает IncidentCard с ScenarioTicket.ground_truth
    │       └─→ EvaluationResult (auto) + grammar_errors
    │
    ├─→ AIInsight обновляется по истории курсанта
    │
    ├─→ SessionReport агрегируется по группе
    │       └─→ ai_insights заполняются по EvaluationResult всей группы
    │
    └─→ TEACHER добавляет expert_comment → запись в UserActionLog
```
