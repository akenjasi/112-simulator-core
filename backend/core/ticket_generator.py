import uuid
from typing import Any, List

from backend.core.complexity import calculate_complexity
from backend.schemas.generator import ClassifierRow, TicketData


class _SafeFormatDict(dict):
    """Fallback to the original placeholder if a key is not found."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def generate_tickets(classifier_row: ClassifierRow, count: int, faker: Any) -> List[TicketData]:
    """
    Генерирует список билетов (TicketData) на основе строки классификатора и генератора фейковых данных.

    :param classifier_row: Данные строки классификатора (код, название инцидента, службы, маркеры, шаблоны).
    :param count: Количество билетов для генерации.
    :param faker: Инстанс FakeDataGenerator (или его мок).
    :return: Список сформированных объектов TicketData.
    """
    if count <= 0:
        return []

    services = getattr(classifier_row, "services", []) or []
    markers = getattr(classifier_row, "markers", []) or []
    templates = getattr(classifier_row, "templates", []) or []
    incident_name = getattr(classifier_row, "incident_name", "")

    complexity = calculate_complexity(len(services), markers)

    # Кешируем faker.random перед циклом, чтобы продвигать состояние генератора случайных чисел
    rng = getattr(faker, "random", None)

    tickets: List[TicketData] = []
    for _ in range(count):
        person = faker.generate_person()
        address = faker.generate_address()
        phone = faker.generate_phone()
        role = faker.generate_role()

        if templates:
            if rng is not None and hasattr(rng, "choice"):
                template = rng.choice(templates)
            else:
                import random
                template = random.choice(templates)
        else:
            template = ""

        first_name = getattr(person, "first_name", "")
        last_name = getattr(person, "last_name", "")
        middle_name = getattr(person, "middle_name", "")

        fio = " ".join(part for part in [last_name, first_name, middle_name] if part)

        street = getattr(address, "street", "")
        house = getattr(address, "house", "")

        format_data = {
            "role": role,
            "incident_name": incident_name,
            "first_name": first_name,
            "last_name": last_name,
            "middle_name": middle_name,
            "street": street,
            "house": house,
            "phone": phone,
        }

        plot = template.format_map(_SafeFormatDict(format_data))

        ticket = TicketData(
            ticket_id=str(uuid.uuid4()),
            complexity=complexity,
            plot=plot,
            etalon_services=list(services),
            factoids={"situation_1": plot},
            ground_truth={
                "fio": fio,
                "phone": phone,
                "street": street,
                "house": house,
            },
        )
        tickets.append(ticket)

    return tickets
