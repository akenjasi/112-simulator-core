def calculate_complexity(services_count: int, markers: list[str]) -> int:
    """
    Рассчитывает уровень сложности билета по принципу 'Functional Core'.

    Логика:
    - Уровень 3: services_count >= 3 ИЛИ в markers есть строки (case-insensitive),
      содержащие 'угроза' или 'пострадавш'. (Наивысший приоритет)
    - Уровень 2: services_count == 2 ИЛИ в markers есть строки,
      содержащие 'инфраструктур' или 'перекрыт'.
    - Уровень 1: во всех остальных случаях.
    """
    markers_lower = [str(m).lower() for m in (markers or [])]

    # Level 3: highest priority
    has_level_3_marker = any("угроза" in m or "пострадавш" in m for m in markers_lower)
    if services_count >= 3 or has_level_3_marker:
        return 3

    # Level 2
    has_level_2_marker = any("инфраструктур" in m or "перекрыт" in m for m in markers_lower)
    if services_count == 2 or has_level_2_marker:
        return 2

    # Level 1: default
    return 1
