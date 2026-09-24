import pytest
from backend.core.complexity import calculate_complexity

def test_complexity_level_1():
    # 1 служба, нет маркеров
    assert calculate_complexity(services_count=1, markers=[]) == 1

def test_complexity_level_2_multiple_services():
    # 2 службы, нет маркеров
    assert calculate_complexity(services_count=2, markers=[]) == 2

def test_complexity_level_2_with_infrastructure_marker():
    # 1 служба, но есть маркер инфраструктуры (например, "перекрытие движения")
    assert calculate_complexity(services_count=1, markers=["перекрытие движения"]) == 2

def test_complexity_level_3_multiple_services():
    # 3 службы
    assert calculate_complexity(services_count=3, markers=[]) == 3

def test_complexity_level_3_with_threat_marker():
    # 1 служба, но есть маркер "угроза людям" или "пострадавшие"
    assert calculate_complexity(services_count=1, markers=["угроза людям"]) == 3
    assert calculate_complexity(services_count=2, markers=["пострадавшие"]) == 3

def test_complexity_level_3_overrides_2():
    # 2 службы (уровень 2), но есть маркер угрозы (уровень 3)
    assert calculate_complexity(services_count=2, markers=["перекрытие движения", "пострадавшие"]) == 3


def test_profile_type_enum():
    from backend.schemas.domain_01 import ProfileType as SchemaProfileType
    from backend.models.domain_01 import ProfileType as ModelProfileType

    assert SchemaProfileType.OPERATOR_112.value == "OPERATOR_112"
    assert SchemaProfileType.DISPATCHER_DDS.value == "DISPATCHER_DDS"
    assert ModelProfileType.OPERATOR_112 == SchemaProfileType.OPERATOR_112
    assert ModelProfileType.DISPATCHER_DDS == SchemaProfileType.DISPATCHER_DDS


def test_group_schema_no_profile():
    from backend.schemas.domain_01 import Group as GroupSchema

    group = GroupSchema(group_name="Test Group")
    assert group.group_name == "Test Group"
    assert not hasattr(group, "profile") or "profile" not in group.model_fields


def test_group_model_no_profile():
    from backend.models.domain_01 import Group as GroupModel, StudentGroup

    assert GroupModel is StudentGroup
    group = GroupModel(group_name="Test Group")
    assert group.group_name == "Test Group"
    assert not hasattr(group, "profile")

