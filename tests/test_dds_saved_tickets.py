"""Real ticket formats and independent services in the student's persistent flow."""
from copy import deepcopy
import uuid

import pytest
from sqlalchemy import func, select

from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard
from backend.core.dds_cycle import incoming_card_from_ticket
from tests.test_dds_cycle_acceptance import INCOMING, action, request, setup_group, start, state
from backend.database import AsyncSessionLocal


def legacy_ticket():
    return ScenarioTicket(title='Газ и пожар', settings={'plot':'Учебная утечка газа', 'category':'ЖКХ',
        'etalon_services':['04 Газ','01 Пожарные']},
        ground_truth={'fio':'Учебный заявитель','phone':'000','street':'Учебная улица','house':'7','SECRET':'hidden'},
        ai_content={'secret':'hidden'}, workflow_state={'status':'active'})


@pytest.mark.asyncio
@pytest.mark.parametrize('legacy', [False, True])
@pytest.mark.parametrize('endpoint', ['/api/v1/sessions/demo','/api/v2/sessions/demo'])
async def test_selected_saved_ticket_supplies_exact_services_without_new_ticket_or_secrets(legacy,endpoint):
    users=await setup_group(1)
    incoming=deepcopy(INCOMING)
    incoming['services'] += [{'id':'gas','name':'04 Газ','status':'Получена службой'}]
    ticket=legacy_ticket() if legacy else ScenarioTicket(title='Две службы',content={'incoming_card':incoming},ground_truth={'SECRET':'hidden'})
    async with AsyncSessionLocal() as db:
        db.add(ticket); await db.commit()
        ticket_id=ticket.scenario_id
        before=await db.scalar(select(func.count()).select_from(ScenarioTicket))
        expected=incoming_card_from_ticket(ticket)
    launch=await request('POST',endpoint,users['cadets'][0],json={'target_role':'DISPATCHER_DDS','ticket_id':ticket_id})
    assert launch.status_code==200,launch.text
    session_id=launch.json()['session_id']
    assert launch.json()['ticket_id']==ticket_id
    assert launch.json()['redirect_url'].startswith('/dds/journal?focus_session_id=')
    base=f'/api/dds/sessions/{session_id}'
    loaded=await request('GET',base,users['cadets'][0]); assert loaded.status_code==200,loaded.text
    assert loaded.json()['incoming_card']==expected
    assert 'SECRET' not in loaded.text and 'hidden' not in loaded.text
    names=[item['name'] for item in expected['services']]
    for status in ['Принята','Начало реагирования','Прибытие','Проведение работ','Работы завершены']:
        if status == 'Работы завершены':
            dispatched=await request('POST',base+'/actions',users['cadets'][0],json=action(
                service_name=names[0],kind='dispatch',status=None,who_accepted='Учебная бригада',summary='Направлена на место'))
            assert dispatched.status_code==200,dispatched.text
        saved=await request('POST',base+'/actions',users['cadets'][0],json=action(service_name=names[0],status=status))
        assert saved.status_code==200,saved.text
        assert saved.json()['allowed_service_statuses'][names[1]]==['Принята','Не принята']
    second=await request('POST',base+'/actions',users['cadets'][0],json=action(service_name=names[1],status='Принята'))
    assert second.status_code==200,second.text
    restored=await request('GET',base,users['cadets'][0])
    assert restored.json()['incoming_card']==expected and len(restored.json()['actions'])==7
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ScenarioTicket))==before
        card=await db.get(IncidentCard,restored.json()['card_id'])
        assert card.assigned_services[names[0]]['status']=='Работы завершены'
        assert card.assigned_services[names[1]]['status']=='Принята'


@pytest.mark.asyncio
async def test_legacy_ticket_works_in_teacher_catalog_and_assignment_snapshot():
    users=await setup_group(1)
    async with AsyncSessionLocal() as db:
        ticket=await db.get(ScenarioTicket,users['ticket_id'])
        source=legacy_ticket()
        ticket.content={}; ticket.settings=source.settings; ticket.ground_truth=source.ground_truth
        await db.commit()
    catalog=await request('GET','/api/dds/tickets',users['teacher'])
    assert users['ticket_id'] in [item['ticket_id'] for item in catalog.json()]
    _,sessions=await start(users)
    assert [s['name'] for s in sessions[0]['incoming_card']['services']]==['04 Газ','01 Пожарные']
    assert 'SECRET' not in str(sessions)


@pytest.mark.asyncio
async def test_invalid_explicit_ticket_does_not_create_a_fallback_session():
    users=await setup_group(1)
    async with AsyncSessionLocal() as db:
        before=await db.scalar(select(func.count()).select_from(ExamSession))
    for ident in [users['bad_ticket_id'],str(uuid.uuid4())]:
        r=await request('POST','/api/v1/sessions/demo',users['cadets'][0],json={'ticket_id':ident})
        assert r.status_code==404,r.text
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ExamSession))==before


@pytest.mark.asyncio
async def test_default_launch_uses_a_saved_active_ticket_instead_of_creating_a_fixed_accident(monkeypatch):
    users=await setup_group(1)
    async with AsyncSessionLocal() as db:
        saved=legacy_ticket(); db.add(saved); await db.commit(); ident=saved.scenario_id
        before=await db.scalar(select(func.count()).select_from(ScenarioTicket))
    def choose(candidates):
        assert all((ticket.workflow_state or {}).get('status') in ('active','published') for ticket in candidates)
        return next(ticket for ticket in candidates if ticket.scenario_id==ident)
    monkeypatch.setattr('secrets.choice',choose)
    result=await request('POST','/api/v1/sessions/demo',users['cadets'][0],json={})
    assert result.status_code==200,result.text
    assert result.json()['ticket_id']==ident
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ScenarioTicket))==before


def test_invalid_structured_card_cannot_fall_back_to_a_legacy_etalon():
    ticket=legacy_ticket(); ticket.content={'incoming_card':{'description':'Broken'}}
    with pytest.raises(ValueError):
        incoming_card_from_ticket(ticket)
