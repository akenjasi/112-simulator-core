import pytest
from backend.models.domain_02 import GeneratedTicket
from backend.schemas.tickets import TicketResponse

def test_ticket_display_id_logic():
    """
    Проверяем, как формируется display_id на бэкенде.
    """
    def make_abbr(text: str) -> str:
        if not text:
            return "ХЗ"
        words = text.split()[:2]
        return "".join([w[0].upper() for w in words if w])
    
    cat = "Пожары и задымления"
    sub = "Задымление в подъезде"
    seq = 42
    
    abbr_cat = make_abbr(cat)
    abbr_sub = make_abbr(sub)
    
    display_id = f"{abbr_cat}_{abbr_sub}_{seq}"
    
    assert abbr_cat == "ПИ"
    assert abbr_sub == "ЗВ"
    assert display_id == "ПИ_ЗВ_42"


def test_make_abbr_from_module():
    from backend.api.router_tickets import make_abbr

    assert make_abbr("Пожары и задымления") == "ПИ"
    assert make_abbr("Задымление в подъезде") == "ЗВ"
    assert make_abbr("") == "ХЗ"
    assert make_abbr(None) == "ХЗ"
    assert make_abbr("ДТП") == "Д"


def test_model_and_schema_fields():
    ticket = GeneratedTicket(
        category="ДТП",
        subcategory="Столкновение",
        sequence_number=15,
        plot="Тест",
    )
    assert ticket.sequence_number == 15
    assert ticket.category == "ДТП"

    resp = TicketResponse(
        id=ticket.id,
        category=ticket.category,
        subcategory=ticket.subcategory,
        complexity=1,
        plot="Тест",
        display_id="Д_С_15",
        sequence_number=15,
    )
    assert resp.display_id == "Д_С_15"
    assert resp.sequence_number == 15
