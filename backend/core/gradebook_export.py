"""The same saved journal rows and metadata for printable and spreadsheet exports."""

import csv
import io
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from backend.core.reports_engine import spreadsheet_literal


MOSCOW = ZoneInfo("Europe/Moscow")
HEADERS = ["ФИО курсанта", "Группа", "Занятие", "Дата занятия", "Билет / задание",
           "Балл / 100", "Статус оценивания"]
KEYS = ["cadet_name", "group_name", "lesson_title", "lesson_date", "ticket_id",
        "final_score", "assessment_status"]


def build_gradebook_context(records, generated_at):
    rows = []
    for record in records:
        date = None
        if record.get("lesson_date"):
            try:
                date = datetime.fromisoformat(str(record["lesson_date"]).replace("Z", "+00:00"))
                date = (date if date.tzinfo else date.replace(tzinfo=timezone.utc)).astimezone(MOSCOW)
                date = date.replace(tzinfo=None)
            except ValueError:
                pass
        score = record.get("final_score")
        rows.append({
            **{key: str(record.get(key) or "Не указано")
               for key in ("cadet_name", "group_name", "lesson_title", "ticket_id")},
            "lesson_date": date,
            "lesson_date_text": date.strftime("%d.%m.%Y") if date else "Не указана",
            "final_score": score,
            "assessment_status": "Оценено" if score is not None else "Нет оценки",
        })
    scores = [row["final_score"] for row in rows if row["final_score"] is not None]
    return {"rows": rows, "generated_at": generated_at,
            "generated_at_text": generated_at.strftime("%d.%m.%Y %H:%M МСК"),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "graded_count": len(scores), "pending_count": len(rows) - len(scores)}


def generate_gradebook_excel(context):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.page import PageMargins

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Журнал оценок"
    sheet.merge_cells("A1:G1")
    sheet["A1"] = "СИСТЕМА-112: ЖУРНАЛ ОЦЕНОК"
    sheet["A1"].font = Font(size=16, bold=True, color="FFFFFF")
    sheet["A1"].fill = PatternFill("solid", fgColor="1E3A8A")
    sheet.row_dimensions[1].height = 32
    sheet.merge_cells("A2:G2")
    sheet["A2"] = f"Сформировано: {context['generated_at_text']} | Записей: {len(context['rows'])}"
    sheet.merge_cells("A3:G3")
    average = context["avg_score"]
    sheet["A3"] = (f"Оценено: {context['graded_count']} | Без оценки: {context['pending_count']} | "
                   f"Средний балл: {average if average is not None else 'Нет оценок'} / 100")
    sheet.append(HEADERS)
    for cell in sheet[4]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2563EB")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for row in context["rows"]:
        sheet.append([spreadsheet_literal(row[key]) for key in KEYS])
        index = sheet.max_row
        sheet.cell(index, 4).number_format = "dd.mm.yyyy"
        sheet.cell(index, 6).number_format = "0.0"
        if row["lesson_date"] is None:
            sheet.cell(index, 4, "Не указана")
        for cell in sheet[index]:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if index % 2:
                cell.fill = PatternFill("solid", fgColor="F1F5F9")
        for column in (4, 6):
            sheet.cell(index, column).alignment = Alignment(horizontal="center", vertical="top", wrap_text=True)
        # All wrapped text remains visible, including unusually long names/titles.
        widths = [32, 22, 28, 16, 40, 15, 22]
        lines = max(sum(max(1, (len(line) + width - 1) // width)
                        for line in str(row[key] or "").split("\n"))
                    for key, width in zip(KEYS, widths))
        sheet.row_dimensions[index].height = max(30, lines * 16)
    for column, width in zip("ABCDEFG", [34, 24, 30, 18, 42, 17, 24]):
        sheet.column_dimensions[column].width = width
    sheet.row_dimensions[4].height = 30
    sheet.freeze_panes = "A5"
    sheet.auto_filter.ref = f"A4:G{sheet.max_row}"
    sheet.print_title_rows = "1:4"
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.page_margins = PageMargins(left=0.3, right=0.3, top=0.4, bottom=0.4)
    sheet.oddFooter.center.text = "Страница &P из &N"
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def generate_gradebook_csv(context):
    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=";")
    writer.writerow(HEADERS)
    for row in context["rows"]:
        writer.writerow([spreadsheet_literal(row["lesson_date_text"] if key == "lesson_date" else row[key])
                         for key in KEYS])
    return output.getvalue()
