"""Review regression: known AI scores survive legacy TicketResult overrides."""
import pytest

from backend.database import AsyncSessionLocal
from backend.models.domain_04 import TicketResult
from tests.test_teacher_grading_acceptance import fixture, request, endpoint, detail, isolated_tables


@pytest.mark.parametrize('regrade', [False, True])
async def test_known_ai_score_survives_expert_grade_in_separate_ticket_result(regrade):
    data = await fixture(ai=84)
    async with AsyncSessionLocal() as db:
        result = TicketResult(session_id=data['session'], ticket_id=data['ticket'], score_total=91,
                              is_passed=True, is_appealed=True, status='COMPLETED',
                              teacher_comment='Прежняя экспертная оценка')
        db.add(result)
        await db.commit()
    if regrade:
        response = await request('POST', endpoint(data), data, json={'score': 73.5, 'reason': 'Повторный разбор'})
        assert response.status_code == 200, response.text
    saved = await detail(data)
    assert saved['score'] == (73.5 if regrade else 91)
    assert saved['expert_score'] == saved['score']
    assert saved['automatic_score'] == 84, 'Unmodified AI evaluation is known and must not become null'
