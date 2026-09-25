from typing import IO
import csv
from backend.schemas.domain_01 import StudentCSVRow

REQUIRED_COLUMNS = ["last_name", "first_name", "email"]
SUPPORTED_COLUMNS = ["last_name", "first_name", "middle_name", "email"]


def parse_students_csv(file_obj: IO[str]) -> list[StudentCSVRow]:
    reader = csv.DictReader(file_obj)
    if reader.fieldnames is None:
        raise ValueError(f"Отсутствуют обязательные колонки: {', '.join(REQUIRED_COLUMNS)}")

    cleaned_fieldnames = [
        name.strip().lstrip("\ufeff") for name in reader.fieldnames if name is not None
    ]
    reader.fieldnames = cleaned_fieldnames

    missing_cols = [col for col in REQUIRED_COLUMNS if col not in cleaned_fieldnames]
    if missing_cols:
        raise ValueError(f"Отсутствуют обязательные колонки: {', '.join(missing_cols)}")

    students: list[StudentCSVRow] = []
    for row in reader:
        # Ignore empty rows: all values are None, empty or whitespace
        if not any(v and v.strip() for v in row.values() if isinstance(v, str)):
            continue

        middle_val = row.get("middle_name")
        row_data = {
            "last_name": (row.get("last_name") or "").strip(),
            "first_name": (row.get("first_name") or "").strip(),
            "middle_name": middle_val.strip() if middle_val and middle_val.strip() else None,
            "email": (row.get("email") or "").strip(),
        }
        students.append(StudentCSVRow.model_validate(row_data))

    return students


def generate_csv_template() -> str:
    """Generate empty CSV template with header."""
    return "last_name,first_name,middle_name,email\n"

