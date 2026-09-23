"""Functional core for classifier calculation rules."""

from typing import List, Optional


def calculate_recommended_services(
    base_services: Optional[List[str]],
    has_victims: bool = False,
    is_blocked: bool = False,
    is_fire: bool = False,
) -> List[str]:
    """Calculate recommended emergency and municipal services for an incident.

    Logic:
    - Starts with base_services
    - If has_victims is True, adds 'Служба 103'
    - If is_blocked is True or is_fire is True, adds 'Служба 101'
    - Eliminates duplicates preserving order
    """
    services: List[str] = list(base_services) if base_services else []

    if has_victims:
        services.append("Служба 103")

    if is_blocked or is_fire:
        services.append("Служба 101")

    # Deduplicate while preserving order of insertion
    return list(dict.fromkeys(services))
