import io

import openpyxl
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.api import router_reports
from backend.core.deps import get_current_user
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import User
from backend.models.domain_02 import ScenarioTicket


@pytest.fixture
async def excel_client():
    previous = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: User(
        user_id="excel-teacher", username="excel-teacher", role="TEACHER", is_active=True,
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = previous


@pytest.mark.asyncio
async def test_excel_export_without_pdf_preserves_grades(excel_client, monkeypatch):
    def fail_pdf(*args, **kwargs):
        pytest.fail("Excel export must not call the PDF renderer")

    monkeypatch.setattr(router_reports, "generate_pdf_from_html", fail_pdf)
    response = await excel_client.post("/api/reports/generate", json={
        "format": "excel",
        "custom_records": [
            {"cadet_name": "Оцененный курсант", "ticket_id": "Билет 1", "final_score": 63.5},
            {"cadet_name": "Непроверенный курсант", "ticket_id": "Билет 2", "final_score": None},
        ],
    })
    assert response.status_code == 200
    task_id = response.json()["task_id"]
    try:
        status = await excel_client.get(f"/api/reports/status/{task_id}")
        assert status.json()["status"] == "ready"
        assert status.json()["file_path"] is None
        download = await excel_client.get(f"/api/reports/download/{task_id}?format=excel")
        assert download.status_code == 200
        sheet = openpyxl.load_workbook(io.BytesIO(download.content)).active
        assert sheet["C5"].value == 63.5
        assert sheet["C6"].value is None
        assert sheet["D5"].value is None
        assert sheet["C7"].value == 63.5
    finally:
        task = router_reports.TASKS.pop(task_id)
        from pathlib import Path
        for key in ("file_path", "csv_path", "excel_path"):
            if task.get(key):
                Path(task[key]).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_import_numeric_excel_service_and_reject_legacy_format(excel_client):
    old_file = await excel_client.post("/api/tickets/import/upload", files={
        "file": ("old.xls", b"legacy format", "application/vnd.ms-excel"),
    })
    assert old_file.status_code == 400
    assert ".xlsx" in old_file.json()["detail"]

    workbook = openpyxl.Workbook()
    workbook.active.append(["Название", "Описание", "Номер звонящего", "Текст абонента", "Целевая служба"])
    workbook.active.append(["Числовой код Excel", "", "", "Нужен врач", 3])
    stream = io.BytesIO()
    workbook.save(stream)
    response = await excel_client.post("/api/tickets/import/upload", files={
        "file": ("numeric.xlsx", stream.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    })
    assert response.status_code == 200
    assert response.json()["success_count"] == 1
    async with AsyncSessionLocal() as db:
        ticket = await db.scalar(select(ScenarioTicket).where(ScenarioTicket.title == "Числовой код Excel"))
        assert ticket.settings["etalon_services"] == ["03 Скорая"]
