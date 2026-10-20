"""Semantic review must cite the right received report and saved trainee answer."""
from copy import deepcopy
import json
from types import SimpleNamespace

import httpx
import pytest

from backend.core.dds_report_llm import DDSLLMSettings, DDSReportGenerationError
from backend.core.report_evidence import collect_semantic_evidence
from backend.core.report_inference import generate_report
from backend.core.report_semantic import system_prompt, validate_review


@pytest.fixture(autouse=True)
def isolated_semantic_cache(monkeypatch):
    import asyncio
    import backend.core.report_semantic as semantic
    semantic._review_cache.clear()
    monkeypatch.setattr(semantic, "_inference_lock", asyncio.Lock())
    yield
    semantic._review_cache.clear()


def example_session():
    source = "Начальник бригады Иванов Иван Иванович. Бригада номер один. Прибытие. Бригада прибыла на место."
    return SimpleNamespace(session_id="session-1", cadet_id="cadet-1", ticket_id="ticket-1", dynamic_state={
        "_gradebook_snapshots": {"ticket-1": {"etalon": {"blocked": True, "fio": "PRIVATE_APPLICANT", "phone": "PRIVATE_PHONE"}}},
        "dds": {"card_id": "card-1", "incoming_card": {"description": "ДТП. Водитель заблокирован.",
            "caller": {"name": "PRIVATE_APPLICANT", "address": "Учебная улица, 1"}, "phones": {"aon": "PRIVATE_PHONE"}},
            "exercise": {"version": 2, "outgoing": {}, "plan": {
                "contacts": [{"id": "contact-1", "service_name": "Пожарные"}],
                "reports": [{"id": "report-1", "contact_id": "contact-1", "text": source}]},
                "notes": {"report-1": "Иванов Иван Иванович. Бригада 2 прибыла."},
                "events": [{"id": "received-1", "kind": "answered", "report_id": "report-1", "text": source},
                    {"id": "note-1", "kind": "note", "report_id": "report-1", "note": "Иванов Иван Иванович. Бригада 2 прибыла."}]}}})


def review():
    return {"correct": [{"expected_quote": "Иванов Иван Иванович", "actual_quote": "Иванов Иван Иванович",
        "explanation": "ФИО докладчика сохранено верно."}], "issues": [{"kind": "distortion",
        "expected_quote": "Бригада номер один", "actual_quote": "Бригада 2", "explanation": "Номер бригады искажён.",
        "correction": "Начальник бригады Иванов Иван Иванович. Бригада 1 прибыла на место.",
        "practice": "Записывайте номер сразу после прослушивания и сверяйте с докладом."}], "limitations": []}


def snapshot(session=None):
    return {"summary": {"sessions": 1, "total_cards": 1, "completed_cards": 1},
        "semantic": {"version": 1, **collect_semantic_evidence(session or example_session())}}


def sse(value, finish="stop"):
    return httpx.Response(200, text="data: " + json.dumps({"choices": [{"delta": {"content": json.dumps(value, ensure_ascii=False)},
        "finish_reason": finish}]}) + "\n\ndata: [DONE]\n\n")


def test_frozen_sources_keep_incident_facts_and_notes_without_applicant_identity():
    session = example_session()
    original = deepcopy(session.dynamic_state)
    data = collect_semantic_evidence(session)
    unit = data["comparisons"][0]
    assert "заблокирован" in unit["context"]["card"]["text"]
    assert "blocked" in unit["context"]["etalon"]["text"]
    assert unit["actual"]["text"] == "Иванов Иван Иванович. Бригада 2 прибыла."
    assert unit["expected"]["ref"].endswith("/event/received-1")
    assert "PRIVATE" not in json.dumps(data)
    assert session.dynamic_state == original


def test_unreceived_report_is_never_presented_as_heard_by_cadet():
    session = example_session()
    session.dynamic_state["dds"]["exercise"]["events"] = []
    data = collect_semantic_evidence(session)
    assert not data["comparisons"]
    assert "не подтверждено" in " ".join(data["limitations"])


def test_first_phone_form_uses_received_reply_and_is_not_an_outgoing_audio_recording():
    session = example_session()
    ex = session.dynamic_state["dds"]["exercise"]
    ex["outgoing"] = {"Пожарные": {"report_id": "report-1"}}
    ex["events"] = [{"id": "call-1", "kind": "dialed", "service_name": "Пожарные", "report_id": "report-1",
        "text": "Бригада один выехала."}, {"id": "dispatch-1", "kind": "action",
        "action": {"kind": "dispatch", "service_name": "Пожарные", "who_accepted": "Иванов", "summary": "Бригада 1 выехала."}}]
    data = collect_semantic_evidence(session)
    assert len(data["comparisons"]) == 1
    assert data["comparisons"][0]["task"] == "dispatch"
    assert data["comparisons"][0]["expected"]["text"] == "Бригада один выехала."
    assert "Нельзя требовать пересказа" in system_prompt("dispatch", "student")


def test_one_discrepancy_cannot_be_published_as_a_success_too():
    value = review()
    value["correct"].append({k: value["issues"][0][k] for k in ("expected_quote", "actual_quote", "explanation")})
    checked = validate_review(json.dumps(value), snapshot()["semantic"]["comparisons"][0])
    assert len(checked["correct"]) == 1
    assert checked["correct"][0]["actual_quote"] == "Иванов Иван Иванович"
    assert len(checked["issues"]) == 1


def test_literal_matches_are_proven_and_separate_from_ai_judgments():
    unit = snapshot()["semantic"]["comparisons"][0]
    unit["actual"]["text"] = "Начальник бригады Иванов Иван Иванович. Бригада 2 прибыла."
    value = review()
    value["correct"] = []
    checked = validate_review(json.dumps(value), unit)
    assert checked["correct"] == []
    assert checked["verified_matches"] == ["Начальник бригады Иванов Иван Иванович."]
    assert "Бригада 2" not in " ".join(checked["verified_matches"])


@pytest.mark.parametrize("change", ["fabricated_quote", "other_answer", "extra_score", "empty", "invalid_json", "unsupported_limitation"])
def test_unverifiable_model_output_is_rejected(change):
    unit = snapshot()["semantic"]["comparisons"][0]
    value = review()
    if change == "fabricated_quote":
        value["issues"][0]["expected_quote"] = "Водитель заблокирован"
    elif change == "other_answer":
        value["issues"][0]["actual_quote"] = "Бригада 5"
    elif change == "extra_score":
        value["score"] = 5
    elif change == "empty":
        value = {"correct": [], "issues": [], "limitations": []}
    elif change == "unsupported_limitation":
        value["limitations"] = ["Курсант не записал прибытие"]
    with pytest.raises(DDSReportGenerationError):
        validate_review("not json" if change == "invalid_json" else json.dumps(value), unit)


@pytest.mark.asyncio
async def test_report_contains_sources_correct_facts_correction_and_real_comparison_payload():
    data = snapshot()
    original = deepcopy(data)
    def handler(request):
        payload = json.loads(request.content)
        assert payload["cache_prompt"] is True and payload["id_slot"] == 0
        assert payload["chat_template_kwargs"] == {"enable_thinking": False}
        assert payload["response_format"]["type"] == "json_schema"
        assert "Бригада 2 прибыла" in payload["messages"][1]["content"]
        sent = json.loads(payload["messages"][1]["content"])
        original_unit = original["semantic"]["comparisons"][0]
        assert sent["actual"]["text"] == original_unit["actual"]["text"]
        assert sent["expected"]["text"] == original_unit["expected"]["text"]
        for name in ("card", "etalon"):
            assert sent["context"][name]["text"] == original_unit["context"][name]["text"]
        assert sent["context"]["limits"] == original_unit["context"]["limits"]
        assert all(identifier not in payload["messages"][1]["content"] for identifier in ("session-1", "cadet-1", "received-1"))
        assert "Аудитория: курсант" in payload["messages"][0]["content"]
        return sse(review())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await generate_report(data, "student", client=client, settings=DDSLLMSettings())
    text = result["analysis_text"]
    assert all(s in text for s in ("Передано верно", "Замечание ИИ", "Пример исправления", "Отработать", "event/received-1", "note/report-1"))
    assert "устная" in text.lower() and data == original


@pytest.mark.asyncio
async def test_missing_evidence_is_explicit_and_never_calls_model():
    data = snapshot()
    data["semantic"]["comparisons"] = []
    def forbidden(request):
        raise AssertionError("No source/answer pair")
    async with httpx.AsyncClient(transport=httpx.MockTransport(forbidden)) as client:
        result = await generate_report(data, "lesson", client=client, settings=DDSLLMSettings())
    assert "Модель не вызывалась" in result["analysis_text"]
    assert result["model_used"] is None


@pytest.mark.asyncio
async def test_prompt_family_cache_survives_changed_answers_and_separates_tasks():
    cache_calls = []
    def handler(request):
        payload = json.loads(request.content)
        if request.url.path == "/slots/0":
            cache_calls.append((request.url.params["action"], payload["filename"]))
            return httpx.Response(404 if request.url.params["action"] == "restore" else 200, json={})
        if request.url.path == "/apply-template":
            return httpx.Response(200, json={"prompt": "SYSTEM:" + payload["messages"][0]["content"] + "\nUSER:" + payload["messages"][1]["content"]})
        if request.url.path == "/completion":
            assert payload["n_predict"] == 0
            assert "Дополнительная запись" not in payload["prompt"] and "PRIVATE_CADET_NOTE_NO_CACHE" not in payload["prompt"]
            return httpx.Response(200, text="data: {}\n\ndata: [DONE]\n\n")
        return sse(review())
    settings = DDSLLMSettings(slot_cache=True)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        first = snapshot()
        first["semantic"]["comparisons"][0]["actual"]["text"] += " PRIVATE_CADET_NOTE_NO_CACHE"
        await generate_report(first, "student", client=client, settings=settings)
        changed = deepcopy(first)
        changed["semantic"]["comparisons"][0]["actual"]["text"] += " Дополнительная запись."
        await generate_report(changed, "student", client=client, settings=settings)
        changed["semantic"]["comparisons"][0]["task"] = "dispatch"
        await generate_report(changed, "student", client=client, settings=settings)
    assert [action for action, _ in cache_calls] == ["restore", "save"] * 3
    assert cache_calls[0][1] == cache_calls[2][1]
    assert cache_calls[0][1] != cache_calls[4][1]
    assert all("/" not in name and "cadet" not in name for _, name in cache_calls)


@pytest.mark.asyncio
async def test_all_pairs_are_checked_and_truncated_output_is_never_published():
    data = snapshot()
    other = deepcopy(data["semantic"]["comparisons"][0])
    other["comparison_id"] = "other"
    data["semantic"]["comparisons"].append(other)
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        return sse(review(), "stop" if count == 1 else "length")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(DDSReportGenerationError, match="не завершён"):
            await generate_report(data, "lesson", client=client, settings=DDSLLMSettings())
    assert count == 2


@pytest.mark.asyncio
async def test_unverifiable_record_is_explicit_and_other_records_are_still_checked():
    data = snapshot()
    first = data["semantic"]["comparisons"][0]
    data["semantic"]["comparisons"] = [deepcopy(first) for _ in range(3)]
    for index, unit in enumerate(data["semantic"]["comparisons"]):
        unit["comparison_id"] = f"comparison-{index}"
        unit["actual"]["ref"] = f"note/record-{index}"
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        value = review()
        if count == 2:
            value["issues"][0]["actual_quote"] = "FABRICATED_QUOTE"
            value["issues"][0]["explanation"] = "UNVERIFIED_CADET_ERROR"
        return sse(value)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await generate_report(data, "lesson", client=client, settings=DDSLLMSettings())
    text = result["analysis_text"]
    assert count == 3
    assert "получен для 2 из 3 записей" in text
    assert "без проверяемого ИИ-разбора: 1" in text
    assert "Это не означает ошибку курсанта" in text
    assert all(f"note/record-{index}" in text for index in range(3))
    assert text.count("Замечание ИИ:") == 2
    assert "FABRICATED_QUOTE" not in text and "UNVERIFIED_CADET_ERROR" not in text


@pytest.mark.asyncio
async def test_connection_loss_is_not_hidden_by_previously_verified_records():
    data = snapshot()
    other = deepcopy(data["semantic"]["comparisons"][0])
    other["comparison_id"] += "/second-record"
    other["actual"]["ref"] += "/second-record"
    other["actual"]["text"] += " Дополнение второй записи."
    data["semantic"]["comparisons"].append(other)
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        if count == 2:
            raise httpx.ConnectError("inference offline", request=request)
        return sse(review())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.ConnectError):
            await generate_report(data, "lesson", client=client, settings=DDSLLMSettings())
    assert count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("only_limitation", [False, True])
async def test_no_verified_record_cannot_be_published_as_a_completed_ai_report(only_limitation):
    data = snapshot()
    value = review()
    value["issues"][0]["actual_quote"] = "FABRICATED_QUOTE"
    if only_limitation:
        value = {"correct": [], "issues": [], "limitations": ["needs_teacher_review"]}
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: sse(value))) as client:
        with pytest.raises(DDSReportGenerationError, match="Ни для одной записи"):
            await generate_report(data, "student", client=client, settings=DDSLLMSettings())


@pytest.mark.asyncio
async def test_changed_free_note_changes_report_revision_even_without_a_score(tmp_path):
    from backend.tests.test_report_scheduler import seed
    from backend.core.report_data import collect_report_snapshot, has_new_results
    from backend.models.domain_03 import ExamSession
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from backend.models.base import Base
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/revision.sqlite")
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        await seed(factory)
        async with factory() as db:
            row = await db.get(ExamSession, "session")
            row.dynamic_state = deepcopy(example_session().dynamic_state)
            row.dynamic_state["dds"]["criteria"] = [{"key": "accuracy", "status": "not_completed", "evidence": []}]
            await db.commit()
            before = await collect_report_snapshot(db, lesson_id="lesson")
            changed = deepcopy(row.dynamic_state)
            changed["dds"]["exercise"]["notes"]["report-1"] = "Начальник бригады Иванов Иван Иванович. Бригада 1 прибыла."
            row.dynamic_state = changed
            await db.commit()
            after = await collect_report_snapshot(db, lesson_id="lesson")
        assert has_new_results(after, before)
        assert before["semantic"]["comparisons"][0]["actual"]["text"].endswith("Бригада 2 прибыла.")
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_oversized_pair_fails_before_any_model_request():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: pytest.fail("must not call"))) as client:
        with pytest.raises(DDSReportGenerationError, match="не обрезаны"):
            await generate_report(snapshot(), "lesson", client=client, settings=DDSLLMSettings(max_input_chars=10))


def test_task_prompts_differ_but_audience_cannot_change_the_evidence_assessment():
    assert system_prompt('report', 'teacher') == system_prompt('report', 'student')
    assert system_prompt('dispatch', 'teacher') == system_prompt('dispatch', 'student')
    assert system_prompt('dispatch', 'student') != system_prompt('report', 'student')


@pytest.mark.asyncio
async def test_teacher_and_student_share_one_validated_assessment_of_exact_frozen_evidence(monkeypatch):
    import asyncio
    calls = []
    async def handler(request):
        calls.append(json.loads(request.content))
        await asyncio.sleep(0)
        return sse(review())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        personal, teacher = await asyncio.gather(
            generate_report(snapshot(), 'student', client=client, settings=DDSLLMSettings()),
            generate_report(snapshot(), 'lesson', client=client, settings=DDSLLMSettings()))
        assert len(calls) == 1
        for result in (personal, teacher):
            assert 'Замечание ИИ' in result['analysis_text']
            assert 'Бригада 2' in result['analysis_text']
            assert 'event/received-1' in result['analysis_text']
        changed = snapshot()
        changed['semantic']['comparisons'][0]['actual']['text'] += ' Дополнение'
        await generate_report(changed, 'lesson', client=client, settings=DDSLLMSettings())
        assert len(calls) == 2
        await generate_report(snapshot(), 'lesson', client=client, settings=DDSLLMSettings(model='another-model'))
        assert len(calls) == 3
        another = snapshot()
        another["semantic"]["comparisons"][0]["cadet_id"] = "another-cadet"
        await generate_report(another, 'lesson', client=client, settings=DDSLLMSettings())
        assert len(calls) == 4
        import backend.core.report_semantic as semantic
        original_prompt = semantic.system_prompt
        monkeypatch.setattr(semantic, 'system_prompt', lambda task, audience: original_prompt(task, audience) + "\nRevised prompt")
        await generate_report(snapshot(), 'lesson', client=client, settings=DDSLLMSettings())
        assert len(calls) == 5


@pytest.mark.asyncio
async def test_invalid_output_is_not_cached_and_a_retry_can_obtain_a_valid_review():
    calls = 0
    def handler(request):
        nonlocal calls
        calls += 1
        value = review()
        if calls == 1:
            value["issues"][0]["actual_quote"] = "NOT_IN_THE_CADET_ANSWER"
        return sse(value)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(DDSReportGenerationError):
            await generate_report(snapshot(), "student", client=client, settings=DDSLLMSettings())
        result = await generate_report(snapshot(), "lesson", client=client, settings=DDSLLMSettings())
    assert calls == 2 and "Замечание ИИ" in result["analysis_text"]
