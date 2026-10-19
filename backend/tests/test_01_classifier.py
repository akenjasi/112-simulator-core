import pytest
from backend.core.classifier_rules import calculate_recommended_services

def test_calculate_services_base():
    # Базовые службы из БД
    base_services = ["Служба 102"]
    
    # Без усложняющих факторов
    result = calculate_recommended_services(
        base_services=base_services,
        has_victims=False,
        is_blocked=False,
        is_fire=False
    )
    
    assert "Служба 102" in result
    assert "Служба 103" not in result

def test_calculate_services_with_victims():
    base_services = ["Служба 102"]
    
    result = calculate_recommended_services(
        base_services=base_services,
        has_victims=True,  # Есть пострадавшие
        is_blocked=False,
        is_fire=False
    )
    
    assert "Служба 102" in result
    assert "Служба 103" in result # Должна добавиться скорая

def test_calculate_services_blocked_door():
    base_services = ["Служба 103"]
    
    result = calculate_recommended_services(
        base_services=base_services,
        has_victims=True,
        is_blocked=True, # Заблокирована дверь
        is_fire=False
    )
    
    assert "Служба 103" in result
    assert "Служба 101" in result # Спасатели для вскрытия
