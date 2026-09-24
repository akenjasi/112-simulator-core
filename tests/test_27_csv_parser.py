import pytest
from io import StringIO
from backend.core.csv_parser import parse_students_csv
from backend.schemas.domain_01 import StudentCSVRow

def test_parse_students_csv_valid():
    csv_content = """first_name,last_name,email
Иван,Иванов,ivan@test.com
Петр,Петров,petr@test.com
"""
    file_obj = StringIO(csv_content)
    
    students = parse_students_csv(file_obj)
    
    assert len(students) == 2
    assert isinstance(students[0], StudentCSVRow)
    assert students[0].first_name == "Иван"
    assert students[0].last_name == "Иванов"
    assert students[0].email == "ivan@test.com"

def test_parse_students_csv_missing_columns():
    csv_content = """first_name,last_name
Иван,Иванов
"""
    file_obj = StringIO(csv_content)
    
    with pytest.raises(ValueError, match="Отсутствуют обязательные колонки: email"):
        parse_students_csv(file_obj)

def test_parse_students_csv_empty():
    csv_content = """first_name,last_name,email"""
    file_obj = StringIO(csv_content)
    
    students = parse_students_csv(file_obj)
    assert len(students) == 0
