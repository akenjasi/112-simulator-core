import pytest
import uuid
from backend.schemas.faker import GeneratedPerson, GeneratedAddress
from backend.core.ticket_generator import generate_tickets
from pydantic import BaseModel

class ClassifierRow(BaseModel):
    code: str
    incident_name: str
    services: list[str]
    markers: list[str]
    templates: list[str]

class TicketData(BaseModel):
    ticket_id: str
    complexity: int
    plot: str
    factoids: dict
    ground_truth: dict
    etalon_services: list[str]

class MockFaker:
    def generate_person(self):
        return GeneratedPerson(first_name="Иван", last_name="Иванов", middle_name="Иванович")
    
    def generate_address(self):
        return GeneratedAddress(
            city="Москва", street="Ленина", house="10", corpus="", structure="", 
            full_address="г. Москва, ул. Ленина, д. 10", lat=55.0, lon=37.0
        )
    
    def generate_phone(self):
        return "+79001234567"
    
    def generate_role(self):
        return "Очевидец"
    
    @property
    def random(self):
        import random
        return random.Random(42)

def test_generate_tickets_structure():
    faker = MockFaker()
    row = ClassifierRow(
        code="01.02",
        incident_name="ДТП",
        services=["01", "02", "03"], # 3 службы -> Сложность 3
        markers=[],
        templates=["Тут машины столкнулись, {incident_name}, срочно помощь нужна!"]
    )
    
    tickets = generate_tickets(classifier_row=row, count=1, faker=faker)
    
    assert len(tickets) == 1
    ticket = tickets[0]
    
    # Проверка структуры для BricksCompiler
    assert ticket.complexity == 3
    assert ticket.etalon_services == ["01", "02", "03"]
    assert ticket.ticket_id
    
    # Ground truth должен содержать данные абонента
    assert ticket.ground_truth["fio"] == "Иванов Иван Иванович"
    assert ticket.ground_truth["phone"] == "+79001234567"
    assert ticket.ground_truth["street"] == "Ленина"
    assert ticket.ground_truth["house"] == "10"
    
    # Factoids должны содержать сгенерированный текст ситуации
    assert "situation_1" in ticket.factoids
    assert "ДТП" in ticket.factoids["situation_1"]
    
    # Plot - полный сгенерированный текст для удобства
    assert "ДТП" in ticket.plot

def test_generate_tickets_multiple_templates():
    faker = MockFaker()
    row = ClassifierRow(
        code="02.01",
        incident_name="Пожар",
        services=["01"],
        markers=[],
        templates=["Шаблон 1 {incident_name}", "Шаблон 2 {incident_name}"]
    )
    
    # Генерируем несколько, чтобы проверить выбор шаблона
    tickets = generate_tickets(classifier_row=row, count=10, faker=faker)
    assert len(tickets) == 10
    
    templates_used = set()
    for t in tickets:
        if "Шаблон 1" in t.plot:
            templates_used.add(1)
        if "Шаблон 2" in t.plot:
            templates_used.add(2)
            
    # Faker's random choice should eventually pick both templates
    assert len(templates_used) == 2
