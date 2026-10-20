"""Stable catalog identities across list, detail, edit and approval responses."""
import pytest
from backend.database import AsyncSessionLocal
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.tests.test_dds_cycle_acceptance import request, setup_group

@pytest.mark.asyncio
async def test_unnumbered_ticket_labels_are_unique_and_stable_across_mutations():
    users = await setup_group()
    async with AsyncSessionLocal() as db:
        generated = [GeneratedTicket(category='ЖКХ', subcategory='Телефон ДДС', complexity=1, plot='Учебная авария', sequence_number=seq) for seq in (None, 0, 7)]
        legacy = ScenarioTicket(title='Телефон ДДС', category='ЖКХ', settings={'category':'ЖКХ', 'subcategory':'Телефон ДДС'}, content={})
        db.add_all([*generated, legacy]); await db.commit()
        ids = [t.id for t in generated] + [legacy.scenario_id]
    listing = (await request('GET','/api/v1/tickets',users['teacher'])).json()
    labels = {item['ticket_id']:item['display_id'] for item in listing}
    assert labels[ids[0]] == ids[0]
    assert labels[ids[1]] == ids[1]
    assert labels[ids[2]] == 'Ж_ТД_7'
    assert labels[ids[3]] == ids[3]
    for ticket_id in ids:
        detail = await request('GET', f'/api/v1/tickets/{ticket_id}', users['teacher'])
        assert detail.status_code == 200, detail.text
        assert detail.json()['display_id'] == labels[ticket_id]
    edited = await request('PATCH',f'/api/v1/tickets/{ids[0]}',users['teacher'],json={'plot':'Изменённая учебная авария'})
    assert edited.status_code == 200, edited.text
    assert edited.json()['display_id'] == ids[0]
