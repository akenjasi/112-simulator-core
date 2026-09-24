from typing import IO
import csv
from backend.schemas.domain_01 import StudentCSVRow

REQUIRED_COLUMNS = ["first_name", "last_name", "email"]


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

        row_data = {
            k: (v.strip() if isinstance(v, str) else v)
            for k, v in row.items()
            if k in REQUIRED_COLUMNS
        }
        students.append(StudentCSVRow.model_validate(row_data))

    return students
