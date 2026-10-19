"""V2 acceptance against real HTTP handlers and isolated SQLite snapshots."""
import asyncio
from copy import deepcopy
from datetime import timedelta
import uuid

import pytest
from sqlalchemy import select

from backend.core import dds_exercise as t
from backend.core.dds_service_policy import allowed_statuses, WITHOUT_BRIGADE
from backend.schemas.dds_exercise import STAGES
from backend.database import AsyncSessionLocal
from backend.models.domain_02 import ScenarioTicket, GeneratedTicket
from backend.models.domain_03 import ExamSession, Assignment
from backend.tests.test_dds_queue import exercise, launch, base, act, complete, ready
from backend.tests.test_dds_phone_training import phone, prepared
from backend.tests.test_dds_cycle_acceptance import request


async def start(services=('Аварийная служба', '03 Скорая', '04 Газ')):
    users, ids = await exercise(n=1, count=1)
    async with AsyncSessionLocal() as db:
        ticket = await db.get(ScenarioTicket, ids[0])
        content = deepcopy(ticket.content)
        content['incoming_card']['services'] = [{'id': f's{i}', 'name': name} for i, name in enumerate(services)]
        ticket.content = content
        await db.commit()
    _, states = await launch(users, ids)
    return users, ids, states[0], users['cadets'][0]


@pytest.mark.parametrize('current, options', [
    ('Получена службой', ['Принята', 'Не принята']), ('Не принята', ['Принята']),
    ('Принята', ['Начало реагирования', 'Отказ от выполнения работ']),
    ('Начало реагирования', ['Прибытие', 'Отказ от выполнения работ']),
    ('Прибытие', ['Проведение работ', 'Отказ от выполнения работ']),
    ('Проведение работ', ['Работы завершены']), ('Работы завершены', []),
    ('Отказ от выполнения работ', []),
])
def test_transition_table(current, options):
    assert allowed_statuses(current, version=2) == options
    assert allowed_statuses(current, version=2, profile='gas') == options
    medical = [WITHOUT_BRIGADE if s in ('Не принята', 'Отказ от выполнения работ') else s for s in options]
    assert allowed_statuses(current, version=2, profile='medical') == ([] if current == 'Не принята' else medical)


@pytest.mark.asyncio
async def test_departure_is_outgoing_and_services_advance_independently(monkeypatch):
    users, ids, state, user = await start(('Аварийная служба', '04 Газ'))
    assert state['exercise']['version'] == 2
    clock = [t.parse_time(state['received_at'])]
    monkeypatch.setattr(t, 'now_utc', lambda: clock[0])
    for name in ('Аварийная служба', '04 Газ'):
        assert state['allowed_service_statuses'][name] == ['Принята', 'Не принята']
        early = (await act(state, user, service_name=name, status='Прибытие')).json()
        assert not early['last_attempt']['accepted']
        assert not any(a.get('status') == 'Прибытие' for a in early['actions'])
        await act(state, user, service_name=name)
    called = (await phone(state, user, number='7000', service_name='Аварийная служба')).json()
    assert called['exercise']['incoming']['direction'] == 'outgoing'
    assert called['exercise']['outgoing']['Аварийная служба']['report_id'] == 'dds-report-0-0'
    busy = (await phone(state, user, number='7001', service_name='04 Газ')).json()
    assert busy['last_attempt']['reason'] == 'phone_busy'
    missing = (await act(state, user, status='Начало реагирования', order_number='1')).json()
    assert missing['last_attempt']['reason'] == 'report_note'
    await act(state, user, kind='dispatch', who_accepted='Начальник бригады Иванов Иван Иванович', summary='Начало реагирования. Бригада 1 выехала')
    first = (await act(state, user, status='Начало реагирования', order_number='1')).json()
    assert first['exercise']['processed_reports'] == 1
    assert first['allowed_service_statuses']['Аварийная служба'] == ['Прибытие', 'Отказ от выполнения работ']
    await phone(state, user, number='7001', service_name='04 Газ')
    await act(state, user, kind='dispatch', service_name='04 Газ', who_accepted='Начальник бригады Петров Пётр Петрович', summary='Начало реагирования. Бригада 2 выехала')
    await act(state, user, service_name='04 Газ', status='Начало реагирования', order_number='2')
    clock[0] += timedelta(seconds=3)
    loaded = (await request('GET', base(state), user)).json()
    assert loaded['exercise']['incoming']['id'] == 'dds-report-0-1'  # Equal due time: card order.
    assert loaded['exercise']['incoming']['ringing']
    for i in [0, 1]:
        report_id = f'dds-report-{i}-1'
        answers = await asyncio.gather(phone(state, user, 'answer', report_id=report_id), phone(state, user, 'answer', report_id=report_id))
        assert sorted(r.status_code for r in answers) == [200, 409]
        await phone(state, user, 'note', report_id=report_id, note='Ошибка в фамилии и содержании')
        name = ('Аварийная служба', '04 Газ')[i]
        saved = (await act(state, user, service_name=name, status='Прибытие', order_number='99')).json()
        assert saved['last_attempt']['accepted']
        assert saved['exercise']['service_progress'][name]['index'] == 2
    assert len([e for e in saved['exercise']['events'] if e['kind'] == 'answered']) == 2
    assert not saved['can_complete']
    restored = (await request('GET', base(state), user)).json()
    assert restored['exercise']['notes']['dds-report-0-1'] == 'Ошибка в фамилии и содержании'


@pytest.mark.asyncio
async def test_refusal_pause_reaccept_and_medical_terminal_do_not_block_other_services():
    users, ids, state, user = await start()
    await act(state, user, status='Не принята', comment='Не входит в компетенцию; передано в газовую службу')
    loaded = (await request('GET', base(state), user)).json()
    assert loaded['allowed_service_statuses']['Аварийная служба'] == ['Принята']
    assert loaded['exercise']['service_progress']['Аварийная служба']['paused']
    await act(state, user)
    accepted = (await request('GET', base(state), user)).json()
    assert not accepted['exercise']['service_progress']['Аварийная служба']['paused']
    assert (await act(state, user, status='Отказ от выполнения работ', comment='Передано профильной организации')).json()['last_attempt']['accepted']
    name = '03 Скорая'
    assert loaded['allowed_service_statuses'][name] == ['Принята', WITHOUT_BRIGADE]
    for wrong in ('Не принята', 'Отказ от выполнения работ'):
        assert not (await act(state, user, service_name=name, status=wrong, comment='Причина')).json()['last_attempt']['accepted']
    empty = (await act(state, user, service_name=name, status=WITHOUT_BRIGADE, comment='')).json()
    assert not empty['last_attempt']['accepted']
    medical = (await act(state, user, service_name=name, status=WITHOUT_BRIGADE, order_number='', comment='Выезд не требуется; информация передана дежурному')).json()
    assert medical['last_attempt']['accepted']
    await act(state, user, service_name='04 Газ', status='Не принята', comment='Повторная карточка; реагируем по карточке 17')
    done = (await complete(state, user)).json()
    assert done['readonly'] and done['exercise']['processed_reports'] == 0
    assert next(c for c in done['criteria'] if c['key'] == 'stage')['status'] == 'not_completed'
    assert next(c for c in done['criteria'] if c['key'] == 'service')['status'] == 'not_evaluated'
    assert any(a.get('status') == 'Не принята' for a in done['actions'])
    assert all(not options for options in done['allowed_service_statuses'].values())


@pytest.mark.asyncio
async def test_full_v2_cycle_closes_and_requires_final_comment(monkeypatch):
    users, ids, state, user = await start(('Аварийная служба',))
    await ready(state, user)
    done = (await complete(state, user)).json()
    assert done['readonly'] and done['exercise']['processed_reports'] == 4
    events = done['exercise']['events']
    assert len([e for e in events if e['kind'] == 'dialed']) == 1
    assert len([e for e in events if e['kind'] == 'answered']) == 3
    assert len(done['exercise']['notes']) == 4
    assert all(c['status'] == 'completed' for c in done['criteria'])


@pytest.mark.asyncio
async def test_self_training_gets_immediate_assessment_without_a_teacher_grade():
    from backend.models.domain_04 import TicketResult
    users, ids = await exercise(n=1, count=1)
    user = users['cadets'][0]
    launched = await request('POST', '/api/dds/training', user,
                             json={'ticket_ids': ids, 'request_id': str(uuid.uuid4())})
    assert launched.status_code == 200, launched.text
    state = launched.json()
    assert state['assessment']['status'] == 'in_progress'
    await ready(state, user)
    done = (await complete(state, user)).json()
    assert done['assessment'] == {
        'source': 'rules', 'version': 1, 'status': 'passed', 'completed_criteria': 5,
        'corrected_criteria': 0, 'total_criteria': 5, 'mistakes_count': 0, 'recommendations': [],
    }
    assert done['is_self_training'] and done['lesson_status'] == 'COMPLETED'
    assert done['score'] is None
    async with AsyncSessionLocal() as db:
        result = await db.scalar(select(TicketResult).where(TicketResult.session_id == state['session_id']))
        assert result.score_total is None
        before = deepcopy((await db.get(ExamSession, state['session_id'])).dynamic_state)
    for _ in range(2):
        loaded = (await request('GET', base(state), user)).json()
        assert loaded['assessment'] == done['assessment']
    async with AsyncSessionLocal() as db:
        assert (await db.get(ExamSession, state['session_id'])).dynamic_state == before
    assert (await request('GET', base(state), users['outsider'])).status_code == 403


@pytest.mark.asyncio
async def test_late_confirmation_feedback_is_available_without_an_error_event(monkeypatch):
    _, _, state, user = await start(('Аварийная служба', '04 Газ'))
    await act(state, user, service_name='04 Газ')
    monkeypatch.setattr(t, 'now_utc', lambda: t.parse_time(state['received_at']) + timedelta(seconds=45))
    await ready(state, user)
    result = (await complete(state, user)).json()['assessment']
    assert result['status'] == 'needs_review' and result['completed_criteria'] == 4
    assert result['mistakes_count'] == 0
    assert result['recommendations'][0]['criterion'] == 'confirmation'
    assert '30 секунд' in result['recommendations'][0]['text']
    assert 'Аварийная служба' in result['recommendations'][0]['text']
    assert '04 Газ' not in result['recommendations'][0]['text']


@pytest.mark.asyncio
async def test_assessment_keeps_corrected_mistakes_and_card_queue_isolation():
    users, ids = await exercise(n=1, count=2)
    _, states = await launch(users, ids)
    state, user = states[0], users['cadets'][0]
    await act(state, user, status='Прибытие')
    await ready(state, user)
    next_card = (await complete(state, user)).json()
    assert next_card['card_id'] != state['card_id']
    assert next_card['assessment']['status'] == 'in_progress'
    assert next_card['assessment']['mistakes_count'] == 0
    archived = (await request('GET', base(state) + f"/cards/{state['card_id']}", user)).json()
    assessment = archived['assessment']
    assert assessment['status'] == 'needs_review'
    assert assessment['corrected_criteria'] == 1 and assessment['completed_criteria'] == 4
    assert assessment['mistakes_count'] == 1
    assert assessment['recommendations'][0]['criterion'] == 'stage'
    assert 'после исправления' in assessment['recommendations'][0]['text']


@pytest.mark.asyncio
async def test_stopping_a_training_does_not_claim_success_or_invent_a_grade():
    _, _, state, user = await start(('Аварийная служба',))
    result = await request('POST', base(state) + '/finish', user, json={})
    assert result.status_code == 200, result.text
    assessment = result.json()['assessment']
    assert assessment['status'] == 'incomplete' and assessment['completed_criteria'] == 0
    assert any('недостаточно данных' in item['text'] for item in assessment['recommendations'])
    assert result.json()['score'] is None


@pytest.mark.asyncio
async def test_completed_card_with_an_inaccurate_accepted_record_needs_review():
    _, _, state, user = await start(('Аварийная служба',))
    await act(state, user)
    await phone(state, user, number='7000', service_name='Аварийная служба')
    saved = await act(state, user, kind='dispatch', who_accepted='Пупкин', summary='Бригада 99 выехала')
    assert saved.json()['last_attempt']['accepted']
    await act(state, user, status='Начало реагирования', order_number='1')
    await ready(state, user)
    done = (await complete(state, user)).json()
    assert done['card_submitted_at']
    assert done['assessment']['status'] == 'needs_review'
    assert done['assessment']['mistakes_count'] > 0
    assert next(c for c in done['criteria'] if c['key'] == 'accuracy')['status'] == 'not_completed'
    assert any(r['criterion'] == 'accuracy' for r in done['assessment']['recommendations'])


@pytest.mark.asyncio
async def test_catalog_replacement_preserves_v1_session_and_retargets_waiting_lesson():
    from backend.core.dds_ticket_replacement import replace_catalog
    users, ids = await exercise(n=1, count=2)
    async with AsyncSessionLocal() as db:
        for old_id in ids:
            ticket = await db.get(ScenarioTicket, old_id)
            content = deepcopy(ticket.content)
            content['dds_exercise'] = prepared(['Аварийная служба'])
            ticket.content = content
        await db.commit()
    _, states = await launch(users, ids)
    state, user = states[0], users['cadets'][0]
    assert state['exercise']['version'] == 1
    async with AsyncSessionLocal() as db:
        waiting = Assignment(group_id=users['group_id'], target_role='DISPATCHER_DDS', scenario_id=ids[0], card_pool_ids=ids)
        db.add(waiting)
        await db.commit()
        waiting_id = waiting.assignment_id
        session = await db.get(ExamSession, state['session_id'])
        before = deepcopy(session.dynamic_state['dds'])
    async with AsyncSessionLocal() as db:
        mapping = await replace_catalog(db, ticket_ids=ids)
        assert set(ids) <= set(mapping)
        await db.commit()
    async with AsyncSessionLocal() as db:
        for old_id in ids:
            assert (await db.get(ScenarioTicket, old_id)).is_deleted
            replacement = await db.get(ScenarioTicket, mapping[old_id])
            assert replacement.content['dds_exercise']['version'] == 2
            assert (await db.get(GeneratedTicket, mapping[old_id])).plot == replacement.content['incoming_card']['description']
        waiting = await db.get(Assignment, waiting_id)
        assert waiting.scenario_id == mapping[ids[0]] and waiting.card_pool_ids == [mapping[i] for i in ids]
        session = await db.get(ExamSession, state['session_id'])
        assert session.dynamic_state['dds'] == before
        assert all(i in session.dynamic_state['_gradebook_snapshots'] for i in ids)
    assert (await request('GET', base(state), user)).json()['incoming_card'] == state['incoming_card']
    await ready(state, user)
    next_card = (await complete(state, user)).json()
    assert next_card['ticket_id'] == ids[1] and next_card['exercise']['version'] == 1
    archived = (await request('GET', base(state)+f"/cards/{state['card_id']}", user)).json()
    assert archived['readonly'] and archived['exercise']['processed_reports'] == 4


@pytest.mark.asyncio
async def test_catalog_replacement_failure_rolls_back_before_hiding_any_ticket(monkeypatch):
    from backend.core import dds_ticket_replacement as replacement
    from sqlalchemy import func
    users, ids = await exercise(n=1, count=2)
    original = replacement.validated_plan
    calls = [0]
    def fail_after_first(raw, services):
        calls[0] += 1
        if calls[0] == 2:
            raise ValueError('Synthetic validation failure')
        return original(raw, services)
    monkeypatch.setattr(replacement, 'validated_plan', fail_after_first)
    async with AsyncSessionLocal() as db:
        before = await db.scalar(select(func.count()).select_from(ScenarioTicket))
        with pytest.raises(ValueError, match='Synthetic'):
            await replacement.replace_catalog(db, ticket_ids=ids)
        await db.rollback()
        assert await db.scalar(select(func.count()).select_from(ScenarioTicket)) == before
        for i in ids:
            assert not (await db.get(ScenarioTicket, i)).is_deleted


@pytest.mark.asyncio
async def test_final_comment_is_mandatory_and_refusal_cannot_follow_work(monkeypatch):
    users, ids, state, user = await start(('04 Газ',))
    clock = [t.parse_time(state['received_at'])]
    monkeypatch.setattr(t, 'now_utc', lambda: clock[0])
    name = '04 Газ'
    await act(state, user, service_name=name)
    await phone(state, user, number='7000', service_name=name)
    await act(state, user, service_name=name, kind='dispatch', who_accepted='Начальник бригады Иванов Иван Иванович', summary='Бригада 1. Начало реагирования. Выехала')
    await act(state, user, service_name=name, status='Начало реагирования', order_number='1')
    for i, status in enumerate(STAGES[1:], 1):
        clock[0] += timedelta(seconds=3)
        await phone(state, user, 'answer', report_id=f'dds-report-0-{i}')
        await phone(state, user, 'note', report_id=f'dds-report-0-{i}', note='Записано с ошибкой')
        if i == 3:
            no_comment = (await act(state, user, service_name=name, status=status, order_number='1', comment='')).json()
            assert no_comment['last_attempt']['reason'] == 'result_comment'
            assert no_comment['exercise']['processed_reports'] == 3
            refused = (await act(state, user, service_name=name, status='Отказ от выполнения работ', order_number='1', comment='Причина')).json()
            assert not refused['last_attempt']['accepted']
            assert refused['allowed_service_statuses'][name] == ['Работы завершены']
        saved = (await act(state, user, service_name=name, status=status, order_number='1', comment='123' if i == 3 else '')).json()
        assert saved['last_attempt']['accepted']
    assert saved['can_complete']
    assert next(c for c in saved['criteria'] if c['key']=='accuracy')['status'] == 'not_completed'
