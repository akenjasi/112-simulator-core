# ТЗ: Экспорт отчетности (Excel, PDF)
**Роль:** Backend & Frontend Developer

## Контекст
В системе уже есть генерация CSV и базовая PDF (через HTML) в `backend/api/router_reports.py` и `reports_engine.py`. Но для преподавателей требуется выгрузка в **полноценный Excel (XLSX)** с нормальным форматированием таблиц.

## Задачи Backend (FastAPI):
1. Установить библиотеку `openpyxl` (добавить в `requirements.txt`).
2. В модуле `backend/core/reports_engine.py` написать функцию `generate_excel_from_data(cadets_data: List[Dict]) -> bytes`, которая создает красивый XLSX-файл (в памяти через `io.BytesIO`).
3. В `backend/api/router_reports.py` в эндпоинте `/api/reports/generate` (или фоновой задаче) добавить поддержку генерации Excel.
4. В эндпоинте `/api/reports/download` добавить обработку `format=excel`, возвращающую `StreamingResponse` или `FileResponse` с `media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`.
5. Убедиться, что тест `tests/test_70_export_excel.py` (или аналогичные) проходит.

## Задачи Frontend (Next.js):
1. На странице `frontend_react/app/teacher/analytics/page.tsx` (или где выводятся списки студентов) добавить кнопку "Экспорт в Excel".
2. При клике кнопка должна дергать API и инициировать скачивание файла браузером.

## Ограничения
- Не блокируйте Event Loop при генерации Excel (используйте `asyncio.to_thread`).
