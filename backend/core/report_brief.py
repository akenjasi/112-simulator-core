"""One short recommendation per frozen report; factual results belong to code."""
import asyncio
from functools import lru_cache
import json
import logging
from pathlib import Path
import re
import time

import httpx

from backend.core.dds_assessment import RULES
from backend.core.dds_report_llm import DDSReportGenerationError

FORMAT = "brief_v1"
ORDER = tuple(RULES)
LABELS = {"confirmation": "первичное подтверждение", "service": "выбор службы",
          "stage": "порядок этапов", "accuracy": "точность записей", "completion": "завершение карточки"}
STRENGTHS = {"confirmation": "Первичное подтверждение выполнено вовремя.",
             "service": "Службы выбраны верно.", "stage": "Этапы соблюдены.",
             "accuracy": "Точность записей подтверждена.", "completion": "Карточки корректно завершены."}
PRACTICE = {"confirmation": "Отработать подтверждение получения карточки каждой службой в пределах 30 секунд после её выдачи.",
            "service": "Отработать выбор службы и номера по справочнику.",
            "stage": "Отработать регистрацию этапа после получения соответствующего доклада.",
            "accuracy": "Отработать запись полного ФИО, должности и номера бригады по услышанному докладу.",
            "completion": "Отработать заключительный доклад, запись результата работ и закрытие карточки."}
logger = logging.getLogger(__name__)
inference_lock = asyncio.Lock()


@lru_cache(maxsize=2)
def system_prompt(audience):
    if audience not in ("student", "teacher"):
        raise ValueError("Unknown summary audience")
    return (Path(__file__).resolve().parents[1] / "prompts" / "reports" /
            f"summary-{audience}.txt").read_text(encoding="utf-8").strip()


def freeze_brief(snapshot):
    """Mark private snapshots without mutating caller-owned JSON."""
    return {**snapshot, "report_format": FORMAT}


def model_input(snapshot, audience):
    summary, checks = snapshot["summary"], snapshot.get("criteria", {})
    counts = {key: {state: checks.get(key + ":" + state, 0) for state in
                   ("completed", "not_completed", "completed_after_correction", "not_evaluated")} for key in ORDER}
    strengths = [STRENGTHS[k] for k in ORDER if counts[k]["completed"] and
                 not any(counts[k][s] for s in ("not_completed", "completed_after_correction", "not_evaluated"))][:1]
    outcome = "Все карточки группы завершены." if audience == "teacher" else "Все карточки завершены."
    priority, practice = None, "Перейти к карточке с двумя службами."
    selected = None
    if summary.get("incomplete_cards", 0):
        outcome = "Часть карточек не завершена."
        priority, practice = "Не все карточки завершены.", PRACTICE["completion"]
    else:
        for state in ("not_completed", "completed_after_correction"):
            candidates = [k for k in ORDER if counts[k][state]]
            if candidates:
                selected = max(candidates, key=lambda k: counts[k][state] /
                               max(1, sum(v for s, v in counts[k].items() if s != "not_evaluated")))
                label = LABELS[selected]
                priority = (f"Есть невыполненный критерий: {label}." if state == "not_completed" else
                            f"Критерий «{label}» выполнен после исправления.")
                practice = PRACTICE[selected]
                break
        if priority is None:
            if (not checks or summary.get("protocols", summary.get("total_cards", 0)) < summary.get("total_cards", 0)
                    or any(not sum(counts[k].values()) or counts[k]["not_evaluated"] for k in ORDER)):
                outcome = "Данных недостаточно для полной проверки критериев."
                priority, practice = "Итоговая проверка критериев неполна.", "Пройти полный телефонный цикл с сохранением докладов."
            elif summary.get("mistakes", 0):
                priority, practice = "В протоколе зафиксированы ошибочные действия.", "Повторить действия с сохранёнными замечаниями по протоколу."
            else:
                outcome = "Все критерии группы выполнены." if audience == "teacher" else "Все критерии выполнены."
    if selected:
        strengths = [s for s in strengths if s != STRENGTHS[selected]]
    if audience == "teacher":
        practice = "Провести упражнение: " + practice[0].lower() + practice[1:]
    return {"outcome": outcome, "strengths": strengths, "priority": priority, "practice": practice}


def facts_text(snapshot):
    if not snapshot:
        return None
    if "sessions" not in snapshot.get("summary", {}):
        from backend.core.reports import compact_legacy
        snapshot = compact_legacy(snapshot)
    s = snapshot["summary"]
    text = (f"Прохождений: {s['sessions']}; карточек завершено: {s.get('completed_cards', 0)} из {s.get('total_cards', 0)}; "
            f"зафиксированных ошибок: {s.get('mistakes', 0)}.")
    scores = snapshot.get("grades", [])
    if scores:
        average = round(sum(scores) / len(scores), 1)
        text += f" Средний сохранённый балл: {average:g} из 100; оценено работ: {len(scores)}."
    return text


def validate_summary(text):
    text = text.strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    if (not text or len(text.split()) > 60 or len(sentences) != 2 or
            any(not s or s[-1] not in ".!?" for s in sentences) or
            re.search(r"[\n\r{}]|```|(?:^|\s)[-*#] |[0-9a-f]{8}-[0-9a-f-]{27,}", text, re.I)):
        raise DDSReportGenerationError("Короткая сводка не прошла проверку: нужны два предложения, не более 60 слов.")
    return text


def grounded_overview(data):
    """Constrain the factual sentence so examples cannot leak invented results."""
    parts = [data["outcome"].rstrip(".")]
    parts.extend(s.rstrip(".") for s in data["strengths"][:1])
    if (data["priority"] and not data["outcome"].startswith("Данных недостаточно")
            and data["priority"] != "Не все карточки завершены."):
        parts.append(data["priority"].rstrip("."))
    return "; ".join(p if i == 0 else p[0].lower() + p[1:] for i, p in enumerate(parts)) + "."


async def generate_brief(snapshot, kind, settings, client=None):
    if not snapshot.get("summary", {}).get("sessions"):
        raise DDSReportGenerationError("Недостаточно данных для отчета.")
    audience = "student" if kind in ("student", "session_demo") else "teacher"
    data = model_input(snapshot, audience)
    overview = grounded_overview(data)
    content = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(content) > settings.max_input_chars:
        raise DDSReportGenerationError("Размер снимка превышает максимально допустимый лимит.")

    async def consume(http):
        from backend.core.report_prefix import restore_prefix
        async with inference_lock:
            prompt = system_prompt(audience)
            await restore_prefix(http, settings, prompt)
            payload = {"model": settings.model, "messages": [{"role": "system", "content": prompt},
                       {"role": "user", "content": content}], "stream": True, "cache_prompt": True,
                       "id_slot": 0, "max_tokens": min(128, settings.max_tokens), "temperature": .1, "seed": 42,
                       "return_progress": True, "sse_ping_interval": 1,
                       "chat_template_kwargs": {"enable_thinking": False},
                       "response_format": {"type": "json_schema", "json_schema": {
                           "name": "dds_brief", "strict": True, "schema": {
                               "type": "object", "additionalProperties": False,
                               "required": ["overview", "recommendation"], "properties": {
                                   "overview": {"type": "string", "enum": [overview]},
                                   "recommendation": {"type": "string", "minLength": 10, "maxLength": 400}}}}}}
            started = time.monotonic()
            parts, finish, metrics = [], None, None
            async with http.stream("POST", settings.base_url.rstrip("/") + "/chat/completions", json=payload) as response:
                response.raise_for_status()
                try:
                    async for line in response.aiter_lines():
                        if not line.startswith("data:") or line[5:].strip() == "[DONE]":
                            continue
                        item = json.loads(line[5:].strip())
                        if item.get("error"):
                            raise ValueError()
                        metrics = item.get("timings") or metrics
                        for choice in item.get("choices", []):
                            part = choice.get("delta", {}).get("content") or ""
                            if not isinstance(part, str):
                                raise ValueError()
                            parts.append(part)
                            finish = choice.get("finish_reason") or finish
                        if sum(map(len, parts)) > 4000:
                            raise ValueError()
                except (ValueError, TypeError, KeyError):
                    raise DDSReportGenerationError("Невалидный ответ сервиса сводок.") from None
            if finish != "stop":
                raise DDSReportGenerationError(f"Сводка не завершена: finish_reason='{finish}'. Частичный текст не опубликован.")
            try:
                reply = json.loads("".join(parts))
                if set(reply) != {"overview", "recommendation"} or reply["overview"] != overview:
                    raise ValueError()
                recommendation = reply["recommendation"]
                if not isinstance(recommendation, str) or not 10 <= len(recommendation) <= 400:
                    raise ValueError()
                if "после исправления" in recommendation.lower() or re.search(r"балл|оценк", recommendation, re.I):
                    raise ValueError()
                result = validate_summary(overview + " " + recommendation.strip())
            except (ValueError, TypeError, KeyError):
                raise DDSReportGenerationError("Сводка не прошла проверку фактов или формата.") from None
            logger.info("DDS brief audience=%s seconds=%.3f timings=%s", audience, time.monotonic() - started, metrics)
            return {"analysis_text": result, "model_used": settings.model, "timings": metrics}

    async def timed(http):
        return await asyncio.wait_for(consume(http), settings.timeout_seconds)
    if client is not None:
        return await timed(client)
    async with httpx.AsyncClient(timeout=settings.timeout_seconds, trust_env=False) as http:
        return await timed(http)
