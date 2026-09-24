import pytest
from pydantic import ValidationError
from backend.schemas.domain_03 import SessionConfigCreate, ComplexityLevel

def test_session_config_valid():
    config = SessionConfigCreate(
        group_id=1,
        categories=["Пожары", "Медицина"],
        complexity=ComplexityLevel.mixed,
        error_limit=2,
        time_limit_seconds=30
    )
    assert config.group_id == 1
    assert config.complexity == ComplexityLevel.mixed

def test_session_config_invalid_complexity():
    with pytest.raises(ValidationError):
        SessionConfigCreate(
            group_id=1,
            categories=["Пожары"],
            complexity="level_99", # Invalid enum
            error_limit=0,
            time_limit_seconds=30
        )

def test_session_config_default_limits():
    # Проверка наследования лимитов в зависимости от сложности, если не переданы явно
    # Это может быть реализовано в validator-ах Pydantic
    config_level_1 = SessionConfigCreate(
        group_id=1,
        categories=["ДТП"],
        complexity=ComplexityLevel.level_1
    )
    # Для уровня 1 по умолчанию 0 ошибок
    assert config_level_1.error_limit == 0
    
    config_level_3 = SessionConfigCreate(
        group_id=1,
        categories=["ДТП"],
        complexity=ComplexityLevel.level_3
    )
    # Для уровня 3 по умолчанию 2 ошибки
    assert config_level_3.error_limit == 2
