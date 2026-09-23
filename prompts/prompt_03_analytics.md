# ТЗ 03: Дашборд аналитики (Aggregated Analytics API)

## Контекст
Для защиты проекта мы создаем мощный аналитический модуль. Вместо простых PDF-отчетов мы делаем JSON API для построения красивых дашбордов на фронтенде (графики, тренды, тепловые карты). 
Логика базируется на SQL-агрегации "на лету" из таблиц `evaluation_results`, `incident_cards` и `exam_sessions`.

## Разрешенные к редактированию файлы
- `backend/core/analytics_engine.py` (Создать)
- `backend/schemas/analytics.py` (Создать)
- `backend/api/router_analytics.py` (Создать)
- `backend/main.py` (Подключить роутер)

## Задача 1: Core логика (Агрегация)
В `backend/core/analytics_engine.py` реализуйте чистые функции (см. `tests/test_03_analytics.py`):
1. `build_error_heatmap(records: list[dict]) -> dict`: принимает плоский список ошибок с привязкой к категории сценария и возвращает двумерный словарь (какая ошибка в какой категории встречается чаще всего).
2. `calculate_trends(records: list[dict]) -> dict`: группирует средний балл целевого курсанта и средний балл группы по датам (session_date), чтобы фронтенд мог построить линейный график прогресса.

## Задача 2: Pydantic Схемы
В `backend/schemas/analytics.py` опишите структуры ответов для фронтенда:
- `HeatmapResponse`
- `TrendResponse`
- `LeaderboardResponse` (список объектов: Имя курсанта, Значение метрики).

## Задача 3: API Контроллер (SQL-агрегация)
В `backend/api/router_analytics.py` (prefix `/api/analytics`, tags `["Analytics"]`) создайте эндпоинты:
1. `GET /heatmap` (фильтры: `group_id`). Выполняет SQL-запрос с JOIN между сессиями, карточками и оценками. Извлекает `category` и массив `errors_list`. Передает в `build_error_heatmap` и возвращает.
2. `GET /trends/{user_id}` (фильтры: `group_id`). Извлекает историю оценок курсанта и среднюю оценку всей группы в те же дни. Передает в `calculate_trends`.
3. `GET /leaderboard` (фильтры: `group_id`, `metric_name`). Агрегирует среднее значение указанной метрики (например, `time_to_first_dispatch_sec` из `sla_metrics` или `final_score`) для каждого курсанта в группе, сортирует (ASC/DESC в зависимости от метрики) и отдает ТОП-10.

## Ограничения
- Использовать асинхронные сессии `SQLAlchemy` (`select`, `join`, `group_by`).
- Не тянуть всю базу в память Python! Основная фильтрация и группировка должна происходить на уровне базы данных, насколько это возможно.
