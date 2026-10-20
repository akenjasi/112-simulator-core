"""Immediate demo lifecycle against real HTTP handlers and isolated SQLite."""
import asyncio
from copy import deepcopy
import json
import uuid

import httpx
import pytest
from sqlalchemy import select, delete

from backend.core import report_demo, report_worker, reports
from backend.core.dds_report_llm import DDSLLMSettings, DDSReportGenerationError
from backend.core.report_inference import generate_report, personal_recommendations, personal_targets
from backend.database import AsyncSessionLocal
from backend.models.domain_03 import ExamSession
from backend.models.report_job import ReportJob
from backend.tests.test_dds_cycle_acceptance import request
from backend.tests.test_dds_queue import exercise, launch, base, ready, complete, act


@pytest.fixture
async def immediate(monkeypatch):
    monkeypatch.setenv('DDS_REPORT_MODE', 'demo')
    async with AsyncSessionLocal() as db:
        await db.execute(delete(ReportJob)); await db.commit()
    calls = []
    release = asyncio.Event()

    async def inference(snapshot, kind, **kwargs):
        calls.append((deepcopy(snapshot), kind, kwargs))
        await release.wait()
        return {'analysis_text': 'Персональные рекомендации на основе протокола.', 'model_used': 'test-runtime'}

    monkeypatch.setattr(report_worker, 'generate_report', inference)
    yield calls, release
    release.set()
    await report_demo.stop_demo_reports()


async def settle():
    worker = report_worker.ReportWorker()
    async with AsyncSessionLocal() as db:
        ids = list((await db.scalars(select(ReportJob.job_id).where(ReportJob.status == "pending").order_by(ReportJob.created_at, ReportJob.job_id))).all())
    for job_id in ids:
        await asyncio.wait_for(worker.process_single_job(job_id), 5)


async def get_job(session_id):
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(ReportJob).where(ReportJob.scope_key == 'session:' + session_id))


@pytest.mark.asyncio
async def test_self_training_launches_immediately_persists_and_reads_never_infer(immediate):
    calls, release = immediate
    users, ids = await exercise(n=1, count=1)
    user = users['cadets'][0]
    started = await request('POST', '/api/dds/training', user,
                            json={'ticket_ids': ids, 'request_id': str(uuid.uuid4())})
    state = started.json()
    assert state['report_mode'] == 'demo'
    await ready(state, user)
    done = await complete(state, user)
    assert done.status_code == 200
    path = f"/api/ai-analytics/sessions/{state['session_id']}/recommendation"
    current = await request('GET', path, user)
    assert current.json()['status'] == 'generating'
    job = await get_job(state['session_id'])
    assert job.kind == 'session_demo' and job.status == 'pending'
    await complete(state, user)
    await request('POST', path, user, json={'retry': True})
    release.set()
    await settle()
    assert len(calls) == 1 and calls[0][1] == 'student'
    assert calls[0][0]['summary']['sessions'] == 1
    assert calls[0][0]['summary']['sessions_with_score'] == 0
    for _ in range(2):
        result = (await request('GET', path, user)).json()
        assert result['status'] == 'completed' and result['model_used'] == 'test-runtime'
        assert 'snapshot' not in result and 'source_revisions' not in result
    await request('POST', path, user, json={'retry': True})
    await settle()
    assert len(calls) == 1
    assert (await request('GET', path, users['outsider'])).status_code == 403
    assert (await request('POST', path, users['other'], json={})).status_code == 403
    assert (await request('GET', path)).status_code == 401


@pytest.mark.asyncio
async def test_teacher_end_launches_individual_and_group_reports_without_grades(immediate):
    calls, release = immediate
    users, ids = await exercise(n=2, count=1)
    lesson, states = await launch(users, ids)
    assert (await request('GET', f'/api/v1/lessons/{lesson}', users['teacher'])).json()['report_mode'] == 'demo'
    await ready(states[0], users['cadets'][0])
    await complete(states[0], users['cadets'][0])
    path = f"/api/ai-analytics/sessions/{states[0]['session_id']}/recommendation"
    assert (await request('GET', path, users['cadets'][0])).json()['status'] == 'awaiting_lesson'
    assert (await request('POST', path, users['cadets'][0], json={})).status_code == 409
    assert await get_job(states[0]['session_id']) is None
    await act(states[1], users['cadets'][1], status='Прибытие')
    stopped = await request('POST', f'/api/v1/lessons/{lesson}/stop', users['teacher'])
    assert stopped.status_code == 200, stopped.text
    release.set()
    await settle()
    assert len(calls) == 3
    personal = [snapshot for snapshot, kind, options in calls if kind == 'student']
    assert len(personal) == 2 and all(len(snapshot['participants']) == 1 for snapshot in personal)
    assert sorted(p['summary']['completed_cards'] for p in personal) == [0, 1]
    assert sorted(p['summary']['mistakes'] for p in personal) == [0, 1]
    assert all(p['summary']['sessions_with_score'] == 0 for p in personal)
    for index, state in enumerate(states):
        own = (await request('GET', f"/api/ai-analytics/sessions/{state['session_id']}/recommendation", users['cadets'][index])).json()
        assert own['status'] == 'completed'
        assert (await request('GET', f"/api/ai-analytics/sessions/{state['session_id']}/recommendation", users['cadets'][1-index])).status_code == 403
    group_path = f'/api/ai-analytics/lessons/{lesson}/personal-reports'
    group = await request('GET', group_path, users['teacher'])
    assert len(group.json()['reports']) == 2
    assert (await request('GET', group_path, users['other'])).status_code == 403
    assert (await request('GET', group_path, users['cadets'][0])).status_code == 403
    await request('POST', f'/api/v1/lessons/{lesson}/stop', users['teacher'])
    await settle()
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_failure_preserves_training_and_explicit_retry_preserves_snapshot(immediate, monkeypatch):
    users, ids = await exercise(n=1, count=1)
    user = users['cadets'][0]
    async def fail(*args, **kwargs):
        raise DDSReportGenerationError('PRIVATE_CONFIGURATION')
    monkeypatch.setattr(report_worker, 'generate_report', fail)
    state = (await request('POST', '/api/dds/training', user,
                          json={'ticket_ids': ids, 'request_id': str(uuid.uuid4())})).json()
    stopped = await request('POST', base(state) + '/finish', user, json={})
    assert stopped.status_code == 200 and stopped.json()['session_status'] == 'COMPLETED'
    await settle()
    path = f"/api/ai-analytics/sessions/{state['session_id']}/recommendation"
    failed = (await request('GET', path, user)).json()
    assert failed['status'] == 'failed' and 'PRIVATE' not in json.dumps(failed)
    assert failed['report_text'] is None
    job = await get_job(state['session_id'])
    snapshot = job.snapshot
    unchanged = await request('POST', path, user, json={})
    assert unchanged.json()['attempt'] == 1
    async def succeed(*args, **kwargs):
        return {'analysis_text': 'Повторите полный цикл.', 'model_used': 'test-runtime'}
    monkeypatch.setattr(report_worker, 'generate_report', succeed)
    async with AsyncSessionLocal() as db:
        row = await db.get(ExamSession, state['session_id'])
        data = deepcopy(row.dynamic_state)
        data['ignored_private_change'] = 'SHOULD_NOT_CHANGE_FROZEN_REPORT'
        row.dynamic_state = data
        await db.commit()
    retry = await request('POST', path, user, json={'retry': True})
    assert retry.status_code == 202
    await settle()
    new = await get_job(state['session_id'])
    assert new.status == 'completed' and new.attempt == 2 and new.snapshot == snapshot


@pytest.mark.asyncio
async def test_demo_tick_uses_shared_worker_and_checks_admission(immediate, monkeypatch):
    from unittest.mock import AsyncMock
    worker = report_worker.ReportWorker()
    async with AsyncSessionLocal() as db:
        db.add(ReportJob(job_id="demo-pending", scope_key="demo-test", snapshot={"summary": {"sessions": 1}}))
        await db.commit()
    admission = AsyncMock(return_value=None)
    monkeypatch.setattr(worker, "admission", admission)
    generate = AsyncMock()
    monkeypatch.setattr(worker, "process_single_job", generate)
    reconcile = AsyncMock()
    monkeypatch.setattr(report_worker, "reconcile_reports", reconcile)
    await worker.tick()
    await worker.generation_task
    admission.assert_awaited_once()
    generate.assert_awaited_once_with("demo-pending")
    reconcile.assert_not_awaited()


@pytest.mark.asyncio
async def test_restart_returns_interrupted_demo_to_durable_queue(immediate):
    async with AsyncSessionLocal() as db:
        job = ReportJob(scope_key='session:' + str(uuid.uuid4()), kind='session_demo', status='generating',
                        snapshot={'frozen': True})
        db.add(job); await db.commit()
        await reports.initialize_reports(db)
        await db.refresh(job)
        assert job.status == 'pending' and job.attempt == 2
        assert job.snapshot == {'frozen': True}


@pytest.mark.asyncio
async def test_queued_mode_does_not_start_personal_inference(monkeypatch):
    monkeypatch.setenv('DDS_REPORT_MODE', 'queued')
    users, ids = await exercise(n=1, count=1)
    user = users['cadets'][0]
    state = (await request('POST', '/api/dds/training', user,
                         json={'ticket_ids': ids, 'request_id': str(uuid.uuid4())})).json()
    await request('POST', base(state) + '/finish', user, json={})
    path = f"/api/ai-analytics/sessions/{state['session_id']}/recommendation"
    assert (await request('GET', path, user)).json()['status'] == 'disabled'
    assert (await request('POST', path, user, json={'retry': True})).status_code == 409
    assert await get_job(state['session_id']) is None


def test_personal_targets_distinguish_corrected_missing_and_success():
    assert personal_targets({'summary': {}, 'criteria': {'stage:completed_after_correction': 1}})[0]['target_id'] == 'stage'
    assert personal_targets({'summary': {}, 'criteria': {'service:not_evaluated': 1}}) == [{'target_id': 'limited_data'}]
    assert personal_targets({'summary': {}, 'criteria': {'stage:completed': 1}}) == [{'target_id': 'further_practice'}]
    targets = [{'target_id': 'accuracy'}]
    for value in ['not json', '{}', '{"recommendations":[]}',
                  '{"recommendations":[{"target_id":"stage","text":"Повторите этапы."}]}',
                  '{"recommendations":[{"target_id":"accuracy","text":"Совет","score":0}]}']:
        with pytest.raises(DDSReportGenerationError):
            personal_recommendations(value, targets)


@pytest.mark.asyncio
async def test_personal_inference_uses_checked_json_references_and_publishes_verified_facts():
    snapshot = {'summary': {'sessions': 1, 'total_cards': 1, 'completed_cards': 1, 'mistakes': 1},
                'criteria': {'accuracy:not_completed': 1}, 'mistakes': {'record_accuracy': 1},
                'period': {'start': '2026-10-20T09:00:00Z', 'end': '2026-10-20T09:30:00Z'},
                'source_revisions': {'private_revision': 'value'}}
    captured = []
    def handler(request):
        payload = json.loads(request.content)
        captured.append(payload)
        answer = json.dumps({'recommendations': [{'target_id': 'accuracy', 'text': 'Сверяйте номер бригады с услышанным сообщением.'}]}, ensure_ascii=False)
        chunk = {'choices': [{'delta': {'content': answer}, 'finish_reason': 'stop'}]}
        return httpx.Response(200, content=('data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n\n').encode())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await generate_report(snapshot, 'student', personal=True, client=client, settings=DDSLLMSettings())
    assert 'accuracy:not_completed' in captured[0]['messages'][1]['content']
    assert 'source_revisions' not in captured[0]['messages'][1]['content']
    period = json.loads(captured[0]['messages'][1]['content'])['period']
    assert period['end'] == '2026-10-20T12:30:00+03:00' and 'last_day_inclusive' not in period
    assert 'Точность записей — не выполнено: 1.' in result['analysis_text']
    assert 'Сверяйте номер бригады' in result['analysis_text']
