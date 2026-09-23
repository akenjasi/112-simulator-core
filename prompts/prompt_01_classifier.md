# ТЗ 01: Миграция Справочника-Классификатора (Classifier Engine)

## Контекст
Мы переносим справочник происшествий (EKP) из старого JSON в БД (SQLite/PostgreSQL) в рамках архитектуры V2.

## Разрешенные к редактированию файлы
- `backend/models/domain_06.py` (Создать)
- `backend/core/classifier_rules.py` (Создать)
- `backend/schemas/classifier.py` (Создать)
- `backend/api/router_classifier.py` (Создать)
- `backend/main.py` (Импорт и подключение роутера)
- `seed.py` (Добавить функцию парсинга и загрузки JSON в БД)

## Задача 1: База Данных (domain_06.py)
Создайте модели SQLAlchemy `ClassifierRecord`:
- `id` (Primary key)
- `category` (String, индекс)
- `group` (String, индекс)
- `feature1`, `feature2`, `feature3` (String)
- `final_type` (String)
- `base_services` (JSON - список базовых служб)

В файл `seed.py` добавьте логику, которая при запуске читает старый `data/classifier_ekp.json`, парсит его и наполняет таблицу `ClassifierRecord`, если она пустая.

## Задача 2: Бизнес-логика (Functional Core)
В `backend/core/classifier_rules.py` реализуйте чистую функцию (см. `tests/test_01_classifier.py`):
```python
def calculate_recommended_services(base_services: list[str], has_victims: bool, is_blocked: bool, is_fire: bool) -> list[str]:
```
Она должна возвращать массив служб. Логика: если `has_victims`, добавляет "Служба 103". Если `is_blocked` или `is_fire`, добавляет "Служба 101". Дубликаты нужно исключить.

## Задача 3: API Контроллер
В `backend/api/router_classifier.py` (prefix `/api/classifier`, tags `["Classifier"]`) создайте эндпоинты:
1. `GET /categories` - возвращает `SELECT DISTINCT category FROM classifier_records`
2. `GET /search` - принимает `q` (поиск), `limit`. Делает `ILIKE %q%` по полям `final_type` и `group`.
3. `POST /calculate` - принимает параметры ситуации (схема `CalculateRequest`), достает из БД запись по ID, получает её `base_services`, прогоняет через `calculate_recommended_services` и отдает результат.

## Ограничения
Никакого стейта в памяти! Все через базу данных (асинхронные сессии SQLAlchemy) и чистые функции.
