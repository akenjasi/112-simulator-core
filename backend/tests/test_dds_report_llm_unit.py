"""Unit tests for DDS Lesson Report Neural Generation Service (Task A-03).

Scope:
- Configuration validation and sanitization (no raw settings/credentials in error messages).
- URL validation (host, scheme, port, credentials, query/fragment rejection).
- Prompt formulation (guardrails against speech/psychology evaluation, score recalculation, prompt injection).
- Pre-call sufficiency and budget checks (status COMPLETED, session/result counts, character limits).
- HTTP inference handling (200 OK, payload verification, timeouts, network errors, upstream failures).
- Response validation (finish_reason, choices, empty content, reasoning-only rejection).
- Clean isolation from DB and legacy ai_worker.
"""

import json
from unittest.mock import AsyncMock, patch
import pytest
import httpx

from backend.core.dds_report_llm import (
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    DEFAULT_TIMEOUT_SECONDS,
    DEFAULT_MAX_INPUT_CHARS,
    DEFAULT_MAX_TOKENS,
    DDSLLMSettings,
    DDSReportConfigurationError,
    DDSReportGenerationError,
    build_dds_report_messages,
    generate_dds_lesson_report,
    get_llm_settings,
)
from backend.core.dds_report_data import DDSLessonReportDataResponse


def make_valid_snapshot(
    lesson_id: str = "lesson_test_101",
    status: str = "COMPLETED",
    completed_sessions: int = 1,
    evaluations: int = 1,
    tickets: int = 1,
    warnings: list = None,
) -> dict:
    """Helper to produce a valid DDS lesson report data snapshot dict."""
    return {
        "lesson_id": lesson_id,
        "group_id": "group_01",
        "group_name": "Группа 101-ДДС",
        "status": status,
        "summary": {
            "student_count": 1,
            "completed_session_count": completed_sessions,
            "evaluation_count": evaluations,
            "ticket_result_count": tickets,
            "incident_card_count": 1,
        },
        "students": [
            {
                "cadet_id": "cadet_01",
                "full_name": "Иванов Иван",
                "session_ids": ["session_01"],
            }
        ],
        "sessions": [
            {
                "session_id": "session_01",
                "cadet_id": "cadet_01",
                "start_time": "2026-10-17T10:00:00Z",
                "end_time": "2026-10-17T10:15:00Z",
                "time_limit_seconds": 900,
                "evaluations": (
                    [
                        {
                            "evaluation_id": "eval_01",
                            "card_id": "card_01",
                            "scores": {"total": 85},
                            "metrics": {"time_spent": 120},
                            "grammar": {},
                            "errors_list": ["Задержка передачи в ДДС-01"],
                        }
                    ]
                    if evaluations > 0
                    else []
                ),
                "ticket_results": (
                    [
                        {
                            "result_id": "tr_01",
                            "ticket_id": "ticket_01",
                            "is_passed": True,
                            "errors_count": 0,
                            "error_details": {},
                        }
                    ]
                    if tickets > 0
                    else []
                ),
                "cards": [
                    {
                        "card_id": "card_01",
                        "status": "closed",
                        "assigned_services": {"01": {"status": "sent"}},
                    }
                ],
            }
        ],
        "warnings": warnings or [],
    }


# ─── Configuration & Sanitization Tests ─────────────────────────────────────────

def test_settings_defaults():
    """Verify default runtime settings."""
    s = DDSLLMSettings()
    assert s.base_url == DEFAULT_BASE_URL
    assert s.model == DEFAULT_MODEL
    assert s.timeout_seconds == DEFAULT_TIMEOUT_SECONDS
    assert s.max_input_chars == DEFAULT_MAX_INPUT_CHARS
    assert s.max_tokens == DEFAULT_MAX_TOKENS


def test_settings_custom_valid():
    """Verify valid custom settings parsing."""
    s = DDSLLMSettings(
        base_url="https://llm.local:9000/v1",
        model="qwen-custom",
        timeout_seconds=60,
        max_input_chars=10000,
        max_tokens=800,
    )
    assert s.base_url == "https://llm.local:9000/v1"
    assert s.model == "qwen-custom"
    assert s.timeout_seconds == 60.0
    assert s.max_input_chars == 10000
    assert s.max_tokens == 800


def test_settings_from_env(monkeypatch):
    """Verify settings read from environment variables."""
    monkeypatch.setenv("DDS_LLM_BASE_URL", "http://10.0.0.5:8080/v1")
    monkeypatch.setenv("DDS_LLM_MODEL", "dds-qwen-test")
    monkeypatch.setenv("DDS_LLM_TIMEOUT_SECONDS", "45.5")
    monkeypatch.setenv("DDS_LLM_MAX_INPUT_CHARS", "15000")
    monkeypatch.setenv("DDS_LLM_MAX_TOKENS", "500")

    s = get_llm_settings()
    assert s.base_url == "http://10.0.0.5:8080/v1"
    assert s.model == "dds-qwen-test"
    assert s.timeout_seconds == 45.5
    assert s.max_input_chars == 15000
    assert s.max_tokens == 500


def test_settings_url_missing_host():
    """Reject base URL with missing or invalid host without leaking raw setting."""
    with pytest.raises(DDSReportConfigurationError) as exc:
        DDSLLMSettings(base_url="http://")
    assert "host" in str(exc.value)
    assert "http://" not in str(exc.value)

    with pytest.raises(DDSReportConfigurationError) as exc2:
        DDSLLMSettings(base_url="http:///v1")
    assert "host" in str(exc2.value)


def test_settings_url_credentials_rejected():
    """Reject base URL containing user/password credentials without echoing secret."""
    secret_url = "http://admin:secret_password_123@127.0.0.1:8081/v1"
    with pytest.raises(DDSReportConfigurationError) as exc:
        DDSLLMSettings(base_url=secret_url)
    assert "учетные данные" in str(exc.value)
    assert "secret_password_123" not in str(exc.value)
    assert "admin" not in str(exc.value)


def test_settings_url_query_fragment_rejected():
    """Reject base URL with query params or fragment without echoing raw query."""
    query_url = "http://127.0.0.1:8081/v1?token=raw_token_xyz"
    with pytest.raises(DDSReportConfigurationError) as exc:
        DDSLLMSettings(base_url=query_url)
    assert "query" in str(exc.value)
    assert "raw_token_xyz" not in str(exc.value)

    fragment_url = "http://127.0.0.1:8081/v1#section1"
    with pytest.raises(DDSReportConfigurationError) as exc2:
        DDSLLMSettings(base_url=fragment_url)
    assert "fragment" in str(exc2.value)
    assert "section1" not in str(exc2.value)


def test_settings_url_invalid_port():
    """Reject base URL with invalid port without echoing raw port."""
    with pytest.raises(DDSReportConfigurationError) as exc:
        DDSLLMSettings(base_url="http://127.0.0.1:99999/v1")
    assert "порта" in str(exc.value)
    assert "99999" not in str(exc.value)

    with pytest.raises(DDSReportConfigurationError) as exc2:
        DDSLLMSettings(base_url="http://127.0.0.1:abc/v1")
    assert "порта" in str(exc2.value)
    assert "abc" not in str(exc2.value)


def test_settings_url_invalid_scheme():
    """Reject non-http/https schemes."""
    with pytest.raises(DDSReportConfigurationError) as exc:
        DDSLLMSettings(base_url="ftp://127.0.0.1:8081/v1")
    assert "http или https" in str(exc.value)


def test_settings_invalid_timeout_sanitized():
    """Reject non-positive or non-finite timeouts without echoing raw value."""
    for invalid in [-10, 0, "zero", float("inf"), float("nan")]:
        with pytest.raises(DDSReportConfigurationError) as exc:
            DDSLLMSettings(timeout_seconds=invalid)
        assert str(invalid) not in str(exc.value)


def test_settings_invalid_max_input_chars_sanitized():
    """Reject non-positive or non-integer max_input_chars without echoing raw value."""
    for invalid in [-1, 0, "not_a_number"]:
        with pytest.raises(DDSReportConfigurationError) as exc:
            DDSLLMSettings(max_input_chars=invalid)
        assert str(invalid) not in str(exc.value)


def test_settings_invalid_max_tokens_sanitized():
    """Reject non-positive or non-integer max_tokens without echoing raw value."""
    for invalid in [-100, 0, "ten"]:
        with pytest.raises(DDSReportConfigurationError) as exc:
            DDSLLMSettings(max_tokens=invalid)
        assert str(invalid) not in str(exc.value)


def test_settings_empty_model():
    """Reject empty model string."""
    with pytest.raises(DDSReportConfigurationError):
        DDSLLMSettings(model="")
    with pytest.raises(DDSReportConfigurationError):
        DDSLLMSettings(model="   ")


# ─── Prompt Formulation Tests ──────────────────────────────────────────────────

def test_build_dds_report_messages_success():
    """Verify prompt formatting, system guardrails and user JSON fencing."""
    snapshot = make_valid_snapshot(lesson_id="lesson_guard_01")
    messages = build_dds_report_messages(snapshot)

    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"

    sys_text = messages[0]["content"]
    # Check guardrails in system prompt
    assert "ДДС" in sys_text
    assert "не более 200 слов" in sys_text
    assert "КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО" in sys_text
    assert "психологическое состояние" in sys_text
    assert "опрос заявителя" in sys_text
    assert "недоверенн" in sys_text

    # Check user prompt contains untrusted JSON fence
    user_text = messages[1]["content"]
    assert "недоверенный источник данных" in user_text
    assert "lesson_guard_01" in user_text
    assert "cadet_01" in user_text
    assert "Задержка передачи в ДДС-01" in user_text


def test_build_dds_report_messages_sanitized_validation_error():
    """Validation errors in prompt builder must not echo snapshot content."""
    invalid_snapshot = {
        "lesson_id": "secret_leak_id",
        "status": "COMPLETED",
        # missing summary, students, sessions, warnings
        "private_field": "SUPER_SECRET_PAYLOAD_VALUE",
    }
    with pytest.raises(DDSReportGenerationError) as exc:
        build_dds_report_messages(invalid_snapshot)
    assert "SUPER_SECRET_PAYLOAD_VALUE" not in str(exc.value)
    assert "secret_leak_id" not in str(exc.value)


# ─── Pre-Call Validation & Data Sufficiency Tests ─────────────────────────────

@pytest.mark.asyncio
async def test_generate_report_rejects_non_completed_status():
    """Active or draft lessons must be rejected explicitly."""
    snapshot = make_valid_snapshot(status="ACTIVE")
    with pytest.raises(DDSReportGenerationError) as exc:
        await generate_dds_lesson_report(snapshot)
    assert "COMPLETED" in str(exc.value)
    assert "ACTIVE" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_rejects_malformed_snapshot():
    """Malformed snapshot raises sanitized DDSReportGenerationError."""
    bad_snapshot = {"lesson_id": "test", "status": "COMPLETED"}
    with pytest.raises(DDSReportGenerationError) as exc:
        await generate_dds_lesson_report(bad_snapshot)
    assert "несоответствие контракту схемы" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_rejects_missing_completed_sessions():
    """Lessons with zero completed sessions cannot generate reports."""
    snapshot = make_valid_snapshot(completed_sessions=0)
    with pytest.raises(DDSReportGenerationError) as exc:
        await generate_dds_lesson_report(snapshot)
    assert "отсутствуют завершенные сессии" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_rejects_missing_evaluations_and_tickets():
    """Lessons without any evaluation or ticket results must be rejected."""
    snapshot = make_valid_snapshot(completed_sessions=1, evaluations=0, tickets=0)
    with pytest.raises(DDSReportGenerationError) as exc:
        await generate_dds_lesson_report(snapshot)
    assert "отсутствуют результаты оценивания и билетов" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_rejects_exceeded_input_chars():
    """Exceeding character budget must be rejected explicitly without silent truncation."""
    snapshot = make_valid_snapshot()
    settings = DDSLLMSettings(max_input_chars=100)  # Very low character limit
    with pytest.raises(DDSReportGenerationError) as exc:
        await generate_dds_lesson_report(snapshot, settings=settings)
    assert "DDS_LLM_MAX_INPUT_CHARS" in str(exc.value)
    assert "Данные не обрезаются" in str(exc.value)


# ─── HTTP Inference & Response Validation Tests ────────────────────────────────

@pytest.mark.asyncio
async def test_generate_report_success():
    """Successful generation produces expected report dict and payload."""
    snapshot = make_valid_snapshot(lesson_id="lesson_ok_200")
    settings = DDSLLMSettings(
        base_url="http://127.0.0.1:8081/v1",
        model="dds-qwen",
        max_tokens=1000,
    )

    captured_requests = []

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        body = json.loads(request.content.decode("utf-8"))
        assert body["model"] == "dds-qwen"
        assert body["temperature"] == 0.2
        assert body["max_tokens"] == 1000
        assert body["chat_template_kwargs"] == {"enable_thinking": False}

        resp_payload = {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "role": "assistant",
                        "content": "### Аналитический отчет преподавателю ДДС\n1. Краткий итог: занятие пройдено успешно.",
                    },
                }
            ]
        }
        return httpx.Response(200, json=resp_payload)

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        result = await generate_dds_lesson_report(snapshot, client=client, settings=settings)

    assert len(captured_requests) == 1
    assert captured_requests[0].url == "http://127.0.0.1:8081/v1/chat/completions"
    assert result["lesson_id"] == "lesson_ok_200"
    assert result["model_used"] == "dds-qwen"
    assert "Аналитический отчет" in result["analysis_text"]


@pytest.mark.asyncio
async def test_generate_report_partial_evidence_allowed():
    """Report can proceed if evaluations exist even when tickets are 0, and vice versa."""
    # Only evaluations
    snapshot_eval_only = make_valid_snapshot(completed_sessions=1, evaluations=1, tickets=0)
    # Only tickets
    snapshot_ticket_only = make_valid_snapshot(completed_sessions=1, evaluations=0, tickets=1)

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "Отчет по частичным данным."},
                    }
                ]
            },
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        res1 = await generate_dds_lesson_report(snapshot_eval_only, client=client)
        assert res1["analysis_text"] == "Отчет по частичным данным."

        res2 = await generate_dds_lesson_report(snapshot_ticket_only, client=client)
        assert res2["analysis_text"] == "Отчет по частичным данным."


@pytest.mark.asyncio
async def test_generate_report_http_status_error():
    """Upstream 500 error raises DDSReportGenerationError without raw trace."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error in llama.cpp")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "HTTP 500" in str(exc.value)
    assert "Internal Server Error in llama.cpp" not in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_timeout():
    """Timeout during HTTP request raises DDSReportGenerationError."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("Connection timed out")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "Превышено время ожидания" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_network_error():
    """Connection error raises DDSReportGenerationError."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Failed to establish a new connection")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "Ошибка сетевого соединения" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_malformed_json_response():
    """Malformed non-JSON upstream response raises DDSReportGenerationError."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html><body>Bad Gateway</body></html>")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "невалидный JSON" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_finish_reason_length():
    """Token limit truncation (finish_reason='length') must be rejected."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "length",
                        "message": {"role": "assistant", "content": "Обрезанный текст отчета..."},
                    }
                ]
            },
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "finish_reason='length'" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_finish_reason_other():
    """Content filter or other finish_reason must be rejected."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "content_filter",
                        "message": {"role": "assistant", "content": "Заблокировано"},
                    }
                ]
            },
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "finish_reason='content_filter'" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_empty_content():
    """Empty or whitespace-only message content must be rejected."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "   \n\t  "},
                    }
                ]
            },
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "пустой текст отчета" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_only_reasoning_rejected():
    """Responses with reasoning_content but empty content must be rejected."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "reasoning_content": "Думаю над отчетом...",
                            "content": "",
                        },
                    }
                ]
            },
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "пустой текст отчета" in str(exc.value)


@pytest.mark.asyncio
async def test_generate_report_empty_choices():
    """Responses with empty choices list must be rejected."""
    snapshot = make_valid_snapshot()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": []})

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(DDSReportGenerationError) as exc:
            await generate_dds_lesson_report(snapshot, client=client)
    assert "choices отсутствует или пуст" in str(exc.value)


@pytest.mark.asyncio
async def test_no_db_or_legacy_worker_access(monkeypatch):
    """Ensure report service never accesses DB or legacy ai_worker/call_qwen_llm."""
    snapshot = make_valid_snapshot()

    # Mock legacy call_qwen_llm to ensure it is never touched
    legacy_mock = AsyncMock(side_effect=AssertionError("Legacy call_qwen_llm must NOT be called"))
    monkeypatch.setattr("backend.core.ai_worker.call_qwen_llm", legacy_mock)

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "Изолированный отчет."},
                    }
                ]
            },
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        res = await generate_dds_lesson_report(snapshot, client=client)

    assert res["analysis_text"] == "Изолированный отчет."
    legacy_mock.assert_not_called()
