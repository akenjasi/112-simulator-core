import pytest
import random
import os
from backend.core.faker import FakeDataGenerator
from backend.schemas.faker import GeneratedPerson, GeneratedAddress

# Создадим фиктивный файл адресов для тестов
@pytest.fixture(autouse=True)
def setup_mock_data(tmp_path):
    import json
    mock_address = [
        {
            "id": 2302215,
            "country": "Россия",
            "region": "Москва",
            "city": "Москва",
            "object_type": "здание",
            "okrug": "СВАО",
            "district": "Бутырский",
            "street": "Большая Новодмитровская улица",
            "house": "23",
            "corpus": "",
            "structure": "7",
            "full_address": "г. Москва, Большая Новодмитровская улица, д. 23, стр. 7",
            "lat": 55.802781,
            "lon": 37.584084
        }
    ]
    
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    os.makedirs(data_dir, exist_ok=True)
    file_path = os.path.join(data_dir, "moscow_112_addresses.json")
    
    # Сохраняем только если файла нет, чтобы не затереть настоящий
    if not os.path.exists(file_path):
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(mock_address, f, ensure_ascii=False)

@pytest.fixture
def generator():
    # Инициализация с сидом для воспроизводимости тестов
    return FakeDataGenerator(seed=42)

def test_generate_person(generator):
    person = generator.generate_person()
    assert isinstance(person, GeneratedPerson)
    assert isinstance(person.first_name, str)
    assert isinstance(person.last_name, str)
    assert isinstance(person.middle_name, str)
    
    # Проверка детерминированности
    gen2 = FakeDataGenerator(seed=42)
    person2 = gen2.generate_person()
    assert person.first_name == person2.first_name
    assert person.last_name == person2.last_name

def test_generate_role(generator):
    role = generator.generate_role()
    assert role in ["Пострадавший", "Очевидец", "Родственник", "Знакомый", "Сотрудник"]

def test_generate_phone(generator):
    phone = generator.generate_phone()
    assert phone.startswith("+79")
    assert len(phone) == 12 # +7 (2 символа) + 10 цифр
    assert phone[1:].isdigit()

def test_generate_car_plate(generator):
    plate = generator.generate_car_plate()
    assert len(plate.split()) == 2 # Пример: А123ВЕ 77
    letters = plate[0] + plate[4:6]
    assert all(c in 'АВЕКМНОРСТУХ' for c in letters)
    digits = plate[1:4]
    assert digits.isdigit()

def test_generate_address(generator):
    address = generator.generate_address()
    assert isinstance(address, GeneratedAddress)
    assert address.city == "Москва"
    assert address.street
    assert address.house
    assert address.full_address
