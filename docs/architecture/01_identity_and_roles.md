# Домен: Пользователи, Группы и Доступ (Identity & Roles)

Этот домен описывает ролевую модель и структуру данных для пользователей, необходимую для выполнения требований ТЗ по управлению учебным процессом и маршрутизации карточек.

## JSON-контракты (Схемы данных)

### 1. Объект Пользователя (User)
Описывает преподавателей, курсантов и системных администраторов.

```json
{
  "user_id": "uuid-v4",
  "username": "ivanov_ps",
  "password_hash": "argon2_hash...",
  "role": "CADET", // Возможные значения: "ADMIN", "TEACHER", "CADET"
  "full_name": "Иванов Петр Сергеевич",

  // Поля специализации (актуальны для CADET и TEACHER)
  "specialization": "DDS_104", // "DDS_101" (Пожарные), "DDS_102" (Полиция), "DDS_103" (Скорая), "DDS_104" (Газ), "DDS_GORMОСТ", "DDS_HOUSING", "OPERATOR_112"
  "group_ids": ["group-uuid-1", "group-uuid-2"], // Для CADET — группы обучения; для TEACHER — курируемые группы

  // Безопасность сессии (ТЗ разд. 5, 9)
  "last_login": "2026-09-22T11:55:00Z",
  "failed_login_attempts": 0,       // Счётчик неудачных попыток входа
  "locked_until": null,             // ISO timestamp: null = не заблокирован, иначе — до этого времени
  "password_changed_at": "2026-09-01T00:00:00Z",

  "created_at": "2026-09-22T12:00:00Z",
  "is_active": true
}
```

### 2. Учебная группа (Student Group)
Объединяет курсантов. Преподаватель назначает задания (Assignments) на группу.

```json
{
  "group_id": "uuid-v4",
  "group_name": "Поток 2026 - Операторы 112",
  "department": "DDS_104",          // Ведомственная принадлежность группы — для маршрутизации карточек
  "teacher_id": "uuid-teacher",     // ID куратора (TEACHER)
  "cadet_ids": ["uuid-cadet-1", "uuid-cadet-2"],
  "created_at": "2026-09-22T12:00:00Z",
  "is_active": true                 // false = архивная группа, не отображается в активных занятиях
}
```

### 3. Журнал действий пользователя (UserActionLog)
Аудит-лог всех значимых событий. Хранится минимум 6 месяцев (ТЗ разд. 9 — Безопасность).
Записывается сервисом автоматически — прямой записи из клиента нет.

```json
{
  "log_id": "uuid-v4",
  "user_id": "uuid-v4",
  "role": "TEACHER",
  "action": "SCENARIO_APPROVED",   // Типы: LOGIN, LOGOUT, LOGIN_FAILED, SCENARIO_CREATED, SCENARIO_APPROVED,
                                   //       SESSION_STARTED, SESSION_ENDED, GRADE_MODIFIED,
                                   //       USER_BLOCKED, USER_CREATED, REPORT_EXPORTED, BACKUP_TRIGGERED
  "target_entity": "ScenarioTicket",
  "target_id": "uuid-scenario",
  "ip_address": "192.168.1.42",
  "details": "Утверждён сценарий 'Пожар мусора'",
  "timestamp": "2026-09-22T12:30:00Z"
}
```

## Матрица прав доступа (RBAC)

| Действие | ADMIN | TEACHER | CADET |
|---|---|---|---|
| Создание / блокировка `User` | ✅ | ❌ | ❌ |
| Назначение ролей | ✅ | ❌ | ❌ |
| Просмотр `UserActionLog` | ✅ | ❌ | ❌ |
| Настройка браузерной аудио-эмуляции / конфигурация системы | ✅ | ❌ | ❌ |
| Создание / редактирование `ScenarioTicket` | ❌ | ✅ | ❌ |
| Создание / архивирование `StudentGroup` | ❌ | ✅ | ❌ |
| Создание `Assignment` | ❌ | ✅ | ❌ |
| Чтение `EvaluationResult` своих групп | ❌ | ✅ | только своих |
| Запись `expert_comment` | ❌ | ✅ | ❌ |
| Изменение `EvaluationResult` (оценки) | ❌ | только с аудит-записью | ❌ |
| Создание `ExamSession` | ❌ | ❌ | ✅ |
| Создание `IncidentCard` | ❌ | ❌ | ✅ |
| Чтение `ReferenceMaterial` | ❌ | ✅ | ✅ |
| Экспорт отчётов (CSV/PDF) | ✅ | ✅ | ❌ |

> **Ограничения ADMIN:** не может изменять `EvaluationResult`, `ScenarioTicket` и оценки курсантов.
> Удаление критически важных данных — только после резервного копирования.
>
> **Ограничения TEACHER:** изменение оценок фиксируется в `UserActionLog` (аудит).
> Не может вмешиваться в работу других преподавателей.
>
> **Ограничения CADET:** видит только свои задания, результаты и материалы.
> Не имеет доступа к данным других курсантов.
