"""Additional independent review cases; original acceptance files stay frozen."""
from datetime import datetime, timezone

from backend.database import AsyncSessionLocal
from backend.models.domain_03 import ExamSession
from backend.models.domain_04 import EvaluationResult, TicketResult
from tests.test_teacher_grading_acceptance import fixture, request, endpoint, detail, isolated_tables


async def test_legacy_expert_grade_is_not_relabelled_as_original_ai_score():
    data = await fixture(ai=84)
    async with AsyncSessionLocal() as db:
        ev = await db.get(EvaluationResult, data['record'])
        ev.is_appealed = True
        ev.expert_modified_by = data['owner']
        ev.expert_modified_at = datetime.now(timezone.utc)
        await db.commit()
    response = await request('POST', endpoint(data), data, json={'score': 73.5, 'reason': 'Повторный разбор'})
    assert response.status_code == 200, response.text
    saved = await detail(data)
    assert saved['automatic_score'] is None, 'The historical AI score is unknown, not the old expert score'
    assert saved['expert_score'] == 73.5


async def test_ticket_result_override_exposes_expert_score_and_author_when_ai_exists():
    data = await fixture(ai=84)
    async with AsyncSessionLocal() as db:
        tr = TicketResult(session_id=data['session'], ticket_id=data['ticket'], score_total=84, is_passed=True, status='COMPLETED')
        db.add(tr)
        await db.commit()
        data['record'] = tr.result_id
    response = await request('POST', endpoint(data), data, json={'score': 73.5, 'reason': 'Экспертное решение'})
    assert response.status_code == 200, response.text
    saved = await detail(data)
    assert saved['score'] == 73.5
    assert saved['automatic_score'] == 84
    assert saved['expert_score'] == 73.5
    assert saved['expert_modified_by'] == data['owner']
    assert saved['expert_modified_at']


async def test_grading_by_evaluation_alias_updates_the_same_attempt_as_result_alias():
    data = await fixture(ai=84)
    async with AsyncSessionLocal() as db:
        tr = TicketResult(session_id=data['session'], ticket_id=data['ticket'], score_total=91,
                          is_passed=True, is_appealed=True, status='COMPLETED', teacher_comment='Прежняя экспертная оценка')
        db.add(tr)
        await db.commit()
        result_id = tr.result_id
    response = await request('POST', endpoint(data), data, json={'score': 73.5, 'reason': 'Уточнение экспертной оценки'})
    assert response.status_code == 200, response.text
    assert (await detail(data, result_id))['score'] == 73.5, 'Success response must update the effective grade of this attempt'
    assert response.json()['old_score'] == 91
    assert (await detail(data, data['card']))['score'] == 73.5


async def test_completed_but_unsubmitted_dds_attempt_is_not_eligible_for_first_grade():
    data = await fixture()
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, data['session'])
        session.status = 'COMPLETED'
        session.dynamic_state = {'dds': {'incoming_card': {}, 'actions': []}}
        await db.commit()
    response = await request('POST', endpoint(data), data, json={'score': 73.5, 'reason': 'Попытка оценить несданное'})
    assert response.status_code == 409, response.text
    assert (await detail(data))['score'] is None
