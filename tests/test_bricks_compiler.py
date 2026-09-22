import pytest
from backend.schemas.bricks import TicketData
from backend.core.bricks_compiler import compile_ticket

def test_compile_ticket_basic():
    ticket_data = TicketData(
        ticket_id="test-uuid-123",
        plot="Пожар на кухне",
        factoids={
            "SM1": "У нас пожар", 
            "SM2": "Горим!", 
            "SD1": "Много дыма", 
            "SD2": "Огонь перекидывается на обои"
        },
        ground_truth={
            "fio": "Смирнова Анна",
            "phone": "89991112233",
            "street": "Ленина",
            "house": "45"
        }
    )
    
    matrix = compile_ticket(ticket_data)
    
    assert matrix.ticket_uuid == "test-uuid-123", "UUID тикета должен сохраниться"
    assert len(matrix.bricks) > 0, "Матрица не должна быть пустой"
    
    intents = [b.intent.value for b in matrix.bricks]
    assert "greeting" in intents, "Должны быть сгенерированы интро-реплики"
    assert "situation" in intents, "Фактоиды должны превратиться в брики ситуации"
    assert "caller_id" in intents, "ФИО должно превратиться в брик caller_id"
    assert "address" in intents, "Адрес должен превратиться в брик address"
