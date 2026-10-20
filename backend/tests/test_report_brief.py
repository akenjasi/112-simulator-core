"""Short CPU summaries: verified input selection, cache identity and safe publication."""
import asyncio
from copy import deepcopy
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import func, select

from backend.core.dds_report_llm import DDSLLMSettings, DDSReportGenerationError
from backend.core.report_brief import (FORMAT, ORDER, facts_text, freeze_brief,
                                      model_input, system_prompt, validate_summary)
from backend.core.report_cutover import cutover
from backend.core.report_inference import generate_report
from backend.core.report_prefix import prefix_filename, restore_prefix
from backend.core import report_worker, reports
from backend.models.domain_03 import Assignment, ExamSession, AIGroupAdvice, AIStudentAdvice
from backend.models.dds_report_job import LegacyDDSReportJob
from backend.models.report_job import ReportJob
from backend.tests.test_report_scheduler import store, seed


def snapshot():
    return freeze_brief({"summary": {"sessions": 1, "total_cards": 2, "completed_cards": 2,
                        "incomplete_cards": 0, "mistakes": 0},
        "criteria": {k + ":completed": 2 for k in ORDER}, "grades": [0, 80],
        "semantic": {"version": 1, "comparisons": [{"PRIVATE_UUID": "PRIVATE_TRANSCRIPT"}] * 36}})


def test_priority_uses_completion_then_failure_rate_then_corrected_and_stable_ties():
    data = snapshot()
    data["criteria"].update({"confirmation:not_completed": 2, "confirmation:completed": 8,
                            "accuracy:not_completed": 1, "accuracy:completed": 1})
    assert "точность" in model_input(data, "student")["priority"]
    data["summary"]["incomplete_cards"] = 1
    assert model_input(data, "student")["priority"] == "Не все карточки завершены."
    data["summary"]["incomplete_cards"] = 0
    data["criteria"] = {"stage:completed_after_correction": 1, "accuracy:completed_after_correction": 1}
    assert "порядок этапов" in model_input(data, "student")["priority"]


def test_success_unknown_and_grades_are_not_conflated_or_sent_to_model():
    data = snapshot()
    assert model_input(data, "student")["priority"] is None
    data["criteria"]["stage:not_evaluated"] = 1
    assert "неполна" in model_input(data, "student")["priority"]
    assert "Средний сохранённый балл: 40 из 100" in facts_text(data)
    for role in ("student", "teacher"):
        text = json.dumps(model_input(data, role))
        assert "PRIVATE" not in text and "grades" not in text and "semantic" not in text
        assert "Пример без затруднений" in system_prompt(role)
        assert "карточки службой" in system_prompt(role)


def test_missing_protocols_cannot_make_a_whole_attempt_successful():
    data = snapshot()
    data["summary"]["protocols"] = 1
    assert "недостаточно" in model_input(data, "student")["outcome"]


@pytest.mark.asyncio
async def test_invented_overview_is_rejected_even_if_runtime_ignores_schema():
    value = json.dumps({"overview": "Все задания провалены.", "recommendation": "Повторите полный цикл."}, ensure_ascii=False)
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200,
            text="data: " + json.dumps({"choices": [{"delta": {"content": value}, "finish_reason": "stop"}]}) + "\n\n"))) as http:
        with pytest.raises(DDSReportGenerationError, match="проверку фактов"):
            await generate_report(snapshot(), "student", client=http, settings=DDSLLMSettings())


@pytest.mark.asyncio
async def test_cancel_closes_stream_without_publishing_partial_summary():
    started, closed = asyncio.Event(), asyncio.Event()
    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            started.set()
            yield b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
            await asyncio.Event().wait()
        async def aclose(self):
            closed.set()
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, stream=Stream()))) as http:
        task = asyncio.create_task(generate_report(snapshot(), "student", client=http, settings=DDSLLMSettings()))
        await asyncio.wait_for(started.wait(), 2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert closed.is_set()


@pytest.mark.parametrize("role", ["student", "lesson"])
@pytest.mark.asyncio
async def test_one_call_for_36_records_and_plain_short_output(role):
    calls = []
    original = snapshot()
    def handler(request):
        payload = json.loads(request.content)
        calls.append(payload)
        assert payload["max_tokens"] == 128 and payload["chat_template_kwargs"] == {"enable_thinking": False}
        assert "PRIVATE" not in payload["messages"][1]["content"]
        assert set(json.loads(payload["messages"][1]["content"])) == {"outcome", "strengths", "priority", "practice"}
        text = json.dumps({"overview": payload["response_format"]["json_schema"]["schema"]["properties"]["overview"]["enum"][0], "recommendation": "Переходите к карточке с двумя службами."}, ensure_ascii=False)
        return httpx.Response(200, text='data: ' + json.dumps({"choices": [{"delta": {"content": text}, "finish_reason": "stop"}]}) + '\n\ndata: [DONE]\n\n')
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        result = await generate_report(original, role, client=http, settings=DDSLLMSettings())
    assert len(calls) == 1 and result["analysis_text"].count(".") == 2
    assert original == snapshot()


@pytest.mark.asyncio
async def test_truncated_result_is_not_published():
    answer = {"choices": [{"delta": {"content": "Незавершённый ответ"}, "finish_reason": "length"}]}
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, text="data: " + json.dumps(answer) + "\n\n"))) as http:
        with pytest.raises(DDSReportGenerationError, match="не завершена"):
            await generate_report(snapshot(), "student", client=http, settings=DDSLLMSettings())


@pytest.mark.parametrize("text", ["Одно предложение.", "Первое. Второе. Третье.", "Первое. Второе без конца",
    "Первое предложение. " + "слово " * 60 + "Конец."])
def test_invalid_summary_is_rejected(text):
    with pytest.raises(DDSReportGenerationError):
        validate_summary(text)


def test_prefix_identity_changes_for_weights_build_context_and_exact_template():
    identity = ["prompt", "a" * 64, "b11723", 8192, "rendered-prefix"]
    first = prefix_filename(*identity)
    for index, value in enumerate(["changed", "b" * 64, "b11724", 4096, "changed-template"]):
        changed = identity.copy(); changed[index] = value
        assert prefix_filename(*changed) != first


@pytest.mark.asyncio
async def test_prefix_cache_saves_only_system_and_rebuilds_missing_state():
    requests = []; restored = False
    def handler(request):
        nonlocal restored
        payload = json.loads(request.content) if request.content else None
        requests.append((request.url.path, payload))
        if request.url.path == "/props": return httpx.Response(200, json={"build_info": "b11723"})
        if request.url.path == "/v1/models": return httpx.Response(200, json={"data": [{"id": "dds-qwen", "meta": {"n_params": 4205751296, "n_ctx": 8192}}]})
        if request.url.path == "/apply-template":
            return httpx.Response(200, json={"prompt": payload["messages"][0]["content"] + "\nUSER:" + payload["messages"][1]["content"]})
        if "restore" in str(request.url): return httpx.Response(200 if restored else 404, json={"n_restored": 384})
        if "save" in str(request.url):
            restored = True
            return httpx.Response(200, json={})
        assert payload["n_predict"] == 0 and payload["cache_prompt"] is False
        assert payload["prompt"] == "SYSTEM_EXAMPLES\nUSER:"
        return httpx.Response(200, text='data: {}\n\ndata: [DONE]\n\n')
    settings = DDSLLMSettings(slot_cache=True)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await restore_prefix(http, settings, "SYSTEM_EXAMPLES")
        await restore_prefix(http, settings, "SYSTEM_EXAMPLES")
    assert sum(path == "/completion" for path, _ in requests) == 1


@pytest.mark.asyncio
async def test_cutover_is_idempotent_preserves_coursework_and_prevents_reimport(store):
    await seed(store)
    async with store() as db:
        db.add_all([ReportJob(job_id="old", lesson_id="lesson", status="completed", report_text="old"),
                    ReportJob(job_id="pending", scope_key="session:session", kind="session_demo", status="generating", snapshot=snapshot()),
                    LegacyDDSReportJob(job_id="legacy", lesson_id="lesson", status="completed", report_text="old"),
                    AIStudentAdvice(cadet_id="cadet", analysis_text="old", model_used="old"),
                    AIGroupAdvice(group_id="group", analysis_text="old", model_used="old")])
        await db.commit()
        before = {m.__tablename__: await db.scalar(select(func.count()).select_from(m)) for m in (Assignment, ExamSession)}
        preview = await cutover(db)
        assert sum(preview.values()) == 4
        assert await db.get(ReportJob, "old")
        backup = []
        counts = await cutover(db, apply=True, backup=backup.append)
        await db.commit()
        assert counts == preview and backup
        assert not await db.get(ReportJob, "old")
        assert (await db.get(ReportJob, "pending")).status == "pending"
        await reports.import_legacy(db)
        assert not await db.get(ReportJob, "legacy")
        assert await cutover(db, apply=True) == {"already_applied": True}
        for m in (Assignment, ExamSession):
            assert await db.scalar(select(func.count()).select_from(m)) == before[m.__tablename__]


@pytest.mark.asyncio
async def test_immediate_admission_bypasses_idle_but_still_protects_learning_and_ram(store, monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setenv("DDS_REPORT_MODE", "demo")
    worker = report_worker.ReportWorker(store, SimpleNamespace(sample=lambda: (90, 8 * 1024**3)))
    monkeypatch.setattr(report_worker, "runtime_sleeping", AsyncMock(return_value=False))
    async with store() as db:
        assert await worker.admission(db) is None
        worker.monitor.sample = lambda: (90, 100 * 1024**2)
        assert await worker.admission(db) == "memory_low"
        db.add(Assignment(status="ACTIVE", target_role="DISPATCHER_DDS")); await db.commit()
        assert await worker.admission(db) == "learning_active"
