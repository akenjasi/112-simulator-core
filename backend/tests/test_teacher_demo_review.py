"""Regression coverage for teacher review and the shared submission gate."""
import pytest

from backend.database import AsyncSessionLocal
from backend.models.domain_03 import ExamSession
from backend.tests.test_teacher_grading_acceptance import fixture, request, detail, endpoint, isolated_tables


async def test_closed_unsubmitted_dds_card_explains_the_same_gate_as_grade_write():
    data = await fixture(active=True)
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, data['session'])
        session.status = 'COMPLETED'
        await db.commit()
    record = await detail(data)
    assert record['can_grade'] is False
    assert 'не завершена' in record['grading_block_reason']
    response = await request('POST', endpoint(data), data, json={'score': 40, 'reason': 'Проверка'})
    assert response.status_code == 409


async def test_first_grade_is_distinct_from_revision_and_preserves_revision_reason():
    data = await fixture()
    assert (await detail(data))['can_grade'] is True
    response = await request('POST', endpoint(data), data, json={'score': 95, 'reason': 'Первичная проверка'})
    assert response.status_code == 200
    record = await detail(data)
    assert record['is_grade_revision'] is False
    assert record['revision_reason'] is None
    response = await request('POST', endpoint(data), data, json={'score': 96, 'reason': 'Уточнена оценка'})
    assert response.status_code == 200
    record = await detail(data)
    assert record['is_grade_revision'] is True
    assert record['revision_reason'] == 'Уточнена оценка'


async def test_review_exposes_selected_card_criteria_without_inventing_an_ai_grade():
    data = await fixture()
    checks = [{'key': key, 'label': key, 'status': 'completed', 'evidence': []}
              for key in ('confirmation', 'service', 'stage', 'accuracy', 'completion')]
    async with AsyncSessionLocal() as db:
        session = await db.get(ExamSession, data['session'])
        state = dict(session.dynamic_state)
        state['dds'] = {**state['dds'], 'criteria': checks}
        session.dynamic_state = state
        await db.commit()
    record = await detail(data)
    assert record['dds_criteria'] == checks
    assert record['dds_events'] == []
    assert record['automatic_score'] is None


async def test_demo_mode_promotes_a_preexisting_memory_wait_only_after_explicit_request(monkeypatch):
    import asyncio
    from backend.core import report_demo
    from backend.models.report_job import ReportJob
    data = await fixture()
    calls = []
    async def inference(snapshot, kind, **kwargs):
        calls.append((snapshot, kind))
        return {'analysis_text': 'Свежие рекомендации занятия', 'model_used': 'test-model'}
    monkeypatch.setenv('DDS_REPORT_MODE', 'demo')
    monkeypatch.setattr(report_demo, 'generate_report', inference)
    async with AsyncSessionLocal() as db:
        db.add(ReportJob(scope_key='lesson:' + data['lesson'], lesson_id=data['lesson'], kind='lesson',
            owner_id=data['owner'], status='pending', waiting_reason='memory_low',
            snapshot={'summary': {'sessions': 1}}))
        await db.commit()
    path = f"/api/ai-analytics/lessons/{data['lesson']}/report"
    current = await request('GET', path, data)
    assert current.json()['execution_mode'] == 'demo'
    assert current.json()['status'] == 'pending' and not calls
    response = await request('POST', path, data, json={})
    assert response.status_code == 202
    await asyncio.gather(*list(report_demo._tasks.values()))
    result = (await request('GET', path, data)).json()
    assert result['status'] == 'completed' and result['report_text'] == 'Свежие рекомендации занятия'
    assert len(calls) == 1


@pytest.mark.parametrize("personal,kind", [(True, "student"), (False, "lesson")])
async def test_successful_demo_prompt_does_not_treat_missing_marks_as_missing_data(monkeypatch, personal, kind):
    monkeypatch.setenv("DDS_REPORT_MODE", "demo")
    import json
    import httpx
    from backend.core.report_inference import generate_report
    from backend.core.dds_report_llm import DDSLLMSettings
    snapshot = {'summary': {'sessions': 1, 'total_cards': 1, 'completed_cards': 1,
        'incomplete_cards': 0, 'mistakes': 0, 'sessions_with_score': 0},
        'criteria': {key + ':completed': 1 for key in ('confirmation', 'service', 'stage', 'accuracy', 'completion')},
        'warnings': ['Сессий без числовой оценки: 1.']}
    def handler(request):
        payload = json.loads(request.content)
        schema = payload['response_format']['json_schema']['schema']
        assert schema['properties']['recommendations']['items']['properties']['target_id']['enum'] == ['further_practice']
        model_data = json.loads(payload['messages'][1]['content'])
        assert 'sessions_with_score' not in model_data['summary']
        assert 'warnings' not in model_data
        assert 'данных достаточно' in payload['messages'][0]['content']
        answer = json.dumps({'recommendations': [{'target_id': 'further_practice',
            'text': 'Потренируйтесь обрабатывать две службы одновременно.'}]})
        chunk = {'choices': [{'delta': {'content': answer}, 'finish_reason': 'stop'}]}
        return httpx.Response(200, content=('data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n').encode())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await generate_report(snapshot, kind, personal=personal, client=client, settings=DDSLLMSettings())
    assert 'Прохождений без числовой оценки: 1.' in result['analysis_text']
    assert 'две службы одновременно' in result['analysis_text']
