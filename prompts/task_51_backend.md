# ТЗ 51: Бэкенд Оценки Карточки (Evaluation Endpoint)

**Роль:** Backend Developer (FastAPI, SQLAlchemy, Python)
**Контекст:** Реализация логики оценки работы оператора (TDD). Тесты уже написаны!

## Задача
Необходимо реализовать эндпоинт `POST /api/v1/sessions/{session_id}/evaluate` в `backend/api/router_sessions.py` (или вынести логику в отдельный модуль).
Он должен принимать JSON карточки, сохранять её, сравнивать с эталоном из `ScenarioTicket` и выставлять баллы.

**Ожидаемый Payload (схема `IncidentCardSubmit`):**
```python
class IncidentCardSubmit(BaseModel):
    ticket_id: str
    time_taken_seconds: int
    caller_name: str
    caller_status: str
    address_string: str
    incident_description: str
    assigned_services: list[str]
    is_refusal_03: bool = False
```

**Ответ (схема `EvaluationResultResponse`):**
```python
class EvaluationResultResponse(BaseModel):
    evaluation_id: str
    scores: dict
    metrics: dict
    errors_list: list[str]
```

## Алгоритм работы (Бизнес-логика):
1. **Подготовка:** Извлечь `ExamSession` и связанный с ним `ScenarioTicket`.
2. **Сохранение:** Создать `IncidentCard` (модель в `domain_04.py`), положив payload в `filled_data` и `assigned_services`. Привязать к сессии.
3. **Оценка (Scores):** 
   - Изначально `total = 100`.
   - **Тайминг:** Норматив 90 секунд. Если `time_taken_seconds > 90`, штраф 10 баллов за каждые полные 10 секунд свыше. Добавить ошибку в `errors_list` (например: "Превышено время обработки вызова").
   - **Службы:** В `ScenarioTicket.content` лежат эталонные службы (`etalon_services`). Если студент не вызвал службу из эталона — штраф 30 баллов и текст "Не вызваны службы: [...]". Если вызвал лишнюю — штраф 5 баллов.
4. **Завершение:** Создать `EvaluationResult` с рассчитанными `scores`, `metrics` и `errors_list`. Обновить статус сессии на `COMPLETED`. Вернуть ответ.

## Важно: TDD
Для тебя уже написан файл с тестами: `tests/test_50_operator_evaluation.py`.
Твоя задача — написать код так, чтобы при запуске `pytest tests/test_50_operator_evaluation.py -v` все тесты прошли успешно! Обрати внимание на требуемую структуру ответа, которую ожидают тесты.

Работай только в папке `backend`. Удачи!
