"""Independent regression probes for the group/catalog review; reviewer-owned."""
from copy import deepcopy
import pytest
from backend.core.dds_cycle import matches_dds_ticket_filters
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import StudentGroup
from backend.models.domain_02 import ScenarioTicket
from tests.test_dds_cycle_acceptance import setup_group, request, INCOMING

@pytest.mark.asyncio
@pytest.mark.parametrize('path', ['/api/admin/groups', '/api/admin/groups/', '/api/v1/groups', '/api/v1/groups/', '/api/groups', '/api/groups/'])
async def test_teacher_group_aliases_are_scoped(path):
    d = await setup_group()
    own = await request('GET', path, d['teacher'])
    foreign = await request('GET', path, d['other'])
    admin = await request('GET', path, d['admin'])
    cadet = await request('GET', path, d['cadets'][0])
    assert own.status_code == foreign.status_code == admin.status_code == 200
    assert d['group_id'] in {g['group_id'] for g in own.json()}
    assert d['group_id'] not in {g['group_id'] for g in foreign.json()}
    assert d['group_id'] in {g['group_id'] for g in admin.json()}
    assert cadet.status_code == 403

@pytest.mark.asyncio
async def test_group_creation_cannot_override_teacher_owner():
    d = await setup_group()
    r = await request('POST', '/api/v1/groups', d['teacher'], json={'group_name':'Review group', 'teacher_id':d['other'][0]})
    assert r.status_code == 200, r.text
    assert r.json()['teacher_id'] == d['teacher'][0]

@pytest.mark.asyncio
async def test_missing_owner_is_not_claimed():
    d = await setup_group()
    async with AsyncSessionLocal() as db:
        group = StudentGroup(group_name='Unassigned review', teacher_id=None)
        db.add(group); await db.commit(); gid = group.group_id
    r = await request('GET', '/api/v1/groups', d['teacher'])
    assert gid not in {g['group_id'] for g in r.json()}
    r = await request('POST', '/api/v1/lessons', d['teacher'], json={'group_id':gid, 'target_role':'DISPATCHER_DDS','ticket_id':d['ticket_id']})
    assert r.status_code == 403

@pytest.mark.parametrize('classification', [{}, {'section':'ЖКХ','title':'Водопровод'}, {'section':'ЖКХ','class':'Авария'}])
def test_nonmatching_subcategory_is_excluded_even_with_missing_metadata(classification):
    incoming = deepcopy(INCOMING); incoming['classification'] = classification
    ticket = ScenarioTicket(category='ЖКХ', content={'incoming_card':incoming}, settings={'subcategory':'Водопровод'})
    assert not matches_dds_ticket_filters(ticket, subcategory='Газоснабжение')

@pytest.mark.asyncio
async def test_dds_api_rejects_unrelated_subcategory():
    d = await setup_group()
    async with AsyncSessionLocal() as db:
        t = await db.get(ScenarioTicket, d['ticket_id'])
        incoming = deepcopy(INCOMING); incoming['classification']['class'] = ''
        t.content = {'incoming_card': incoming}; await db.commit()
    r = await request('GET', '/api/dds/tickets?subcategory=Газоснабжение', d['teacher'])
    assert r.status_code == 200
    assert d['ticket_id'] not in {t['ticket_id'] for t in r.json()}

@pytest.mark.asyncio
async def test_catalog_complexity_matches_bank_display():
    d = await setup_group()
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, d['ticket_id'])
        ticket.complexity = 3; ticket.settings = {}; await db.commit()
    bank = await request('GET', '/api/v1/tickets?complexity=3', d['teacher'])
    dds = await request('GET', '/api/dds/tickets?complexity=3', d['teacher'])
    assert bank.status_code == dds.status_code == 200
    b = next(t for t in bank.json() if t['ticket_id'] == d['ticket_id'])
    c = next(t for t in dds.json() if t['ticket_id'] == d['ticket_id'])
    assert b['complexity'] == c['complexity'] == 3

@pytest.mark.asyncio
@pytest.mark.parametrize('source', ['columns', 'settings', 'classification'])
async def test_bank_detail_counts_and_dds_share_ticket_metadata(source):
    d = await setup_group()
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, d['ticket_id'])
        incoming = deepcopy(INCOMING)
        incoming['classification']['section'] = 'Review category'
        incoming['classification']['title'] = 'Review subcategory'
        ticket.content = {'incoming_card':incoming}
        ticket.category = 'Review category' if source == 'columns' else None
        ticket.complexity = 3
        ticket.settings = {'category':'Review category','subcategory':'Review subcategory','complexity':2} if source == 'settings' else {}
        await db.commit()
    level = 2 if source == 'settings' else 3
    params = f'?category=Review%20category&subcategory=Review%20subcategory&complexity={level}'
    bank = await request('GET','/api/v1/tickets'+params,d['teacher'])
    dds = await request('GET','/api/dds/tickets'+params,d['teacher'])
    detail = await request('GET','/api/v1/tickets/'+d['ticket_id'],d['teacher'])
    counts = await request('GET',f'/api/v1/tickets/counts?complexity={level}',d['teacher'])
    assert bank.status_code == dds.status_code == detail.status_code == counts.status_code == 200
    b = next(t for t in bank.json() if t['ticket_id'] == d['ticket_id'])
    c = next(t for t in dds.json() if t['ticket_id'] == d['ticket_id'])
    for t in [b,c,detail.json()]:
        assert (t['category'],t['subcategory'],t['complexity']) == ('Review category','Review subcategory',level)
    assert any(c['category']=='Review category' and c['subcategories'].get('Review subcategory',0)>0 for c in counts.json())
    rejected = await request('GET',f'/api/dds/tickets?category=Review%20category&complexity={1}',d['teacher'])
    assert d['ticket_id'] not in {t['ticket_id'] for t in rejected.json()}
