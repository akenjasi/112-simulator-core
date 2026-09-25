def calculate_complexity(services: list[str], markers: list[str]) -> int:
    """
    Рассчитывает уровень сложности билета по принципу 'Functional Core'.

    Логика:
    Считаем только базовые экстренные службы (01, 02, 03, 04) для оценки масштаба.
    Остальные службы (ЦОДД, ФСБ и т.д.) идут как дополнительные и не повышают базовую сложность сами по себе.
    
    - Уровень 3: core_services >= 3 ИЛИ в markers есть угроза жизни ('угроза', 'пострадавш', 'взрыв', 'опасн').
    - Уровень 2: core_services == 2 ИЛИ в markers есть угроза инфраструктуре ('инфраструктур', 'перекрыт').
    - Уровень 1: во всех остальных случаях.
    """
    markers_lower = [str(m).lower() for m in (markers or [])]
    
    core_prefixes = ('01', '02', '03', '04')
    core_services = sum(1 for s in (services or []) if any(str(s).strip().startswith(p) for p in core_prefixes))

    # Level 3: highest priority
    has_level_3_marker = any(word in m for m in markers_lower for word in ['угроза', 'пострадавш', 'взрыв', 'опасн'])
    if core_services >= 3 or has_level_3_marker:
        return 3

    # Level 2
    has_level_2_marker = any(word in m for m in markers_lower for word in ['инфраструктур', 'перекрыт'])
    if core_services == 2 or has_level_2_marker:
        return 2

    # Level 1: default
    return 1
