"""Sequential CPU review with exact source quotations and stable cached prompts."""
import asyncio
from functools import lru_cache
import hashlib
import json
import logging
from pathlib import Path
import re

import httpx

from backend.core.dds_report_llm import DDSReportGenerationError

logger = logging.getLogger(__name__)
_inference_lock = asyncio.Lock()
PROMPTS = Path(__file__).resolve().parents[1] / "prompts" / "reports"


@lru_cache(maxsize=4)
def system_prompt(task, audience):
    if task not in ("dispatch", "report") or audience not in ("teacher", "student"):
        raise ValueError("Unknown report task")
    return "\n\n".join((PROMPTS / (name + ".txt")).read_text(encoding="utf-8").strip()
                         for name in ("common", task, audience))


def _object(properties):
    return {"type": "object", "additionalProperties": False, "required": list(properties), "properties": properties}


def _text(limit=500):
    return {"type": "string", "minLength": 1, "maxLength": limit}


_quotes = {"expected_quote": _text(240), "actual_quote": _text(240), "explanation": _text()}
LIMITATIONS = {"needs_teacher_review": "Модель не смогла уверенно проверить все сведения; требуется сопоставление преподавателем."}
SCHEMA = _object({
    "correct": {"type": "array", "maxItems": 2, "items": _object(_quotes)},
    "issues": {"type": "array", "maxItems": 3, "items": _object({"kind": {"type": "string", "enum": ["omission", "distortion"]},
        **_quotes, "correction": _text(700), "practice": _text()})},
    "limitations": {"type": "array", "maxItems": 1, "items": {"type": "string", "enum": list(LIMITATIONS)}},
})


def validate_review(raw, unit):
    """Grammar is not enough: verify every quotation against this exact text pair."""
    try:
        value = json.loads(raw)
        if not isinstance(value, dict) or set(value) != {"correct", "issues", "limitations"}:
            raise ValueError()
        for key, maximum in (("correct", 2), ("issues", 3), ("limitations", 1)):
            if not isinstance(value[key], list) or len(value[key]) > maximum:
                raise ValueError()
        if not any(value.values()):
            raise ValueError()
        for key in ("correct", "issues"):
            for item in value[key]:
                fields = set(_quotes) | ({"kind", "correction", "practice"} if key == "issues" else set())
                if not isinstance(item, dict) or set(item) != fields:
                    raise ValueError()
                for field in fields - {"kind"}:
                    limit = 240 if field.endswith("_quote") else 700 if field == "correction" else 500
                    if not isinstance(item[field], str) or not 1 <= len(item[field].strip()) <= limit:
                        raise ValueError()
                if key == "issues" and item["kind"] not in ("omission", "distortion"):
                    raise ValueError()
                if item["expected_quote"] not in unit["expected"]["text"] or item["actual_quote"] not in unit["actual"]["text"]:
                    raise ValueError()
        if any(not isinstance(v, str) or v not in LIMITATIONS for v in value["limitations"]):
            raise ValueError()
        # Small models sometimes repeat one discrepancy in both arrays. Do not
        # publish it as a success as well as an issue. This only reconciles
        # identical quotation pairs; a wider quote can legitimately support a
        # correct name while another part of that quote has a wrong brigade.
        value["correct"] = [item for item in value["correct"] if not any(
            item["expected_quote"].strip() == issue["expected_quote"].strip() and
            item["actual_quote"].strip() == issue["actual_quote"].strip() for issue in value["issues"])]
        # An error-focused model can omit the positive part entirely. Preserve
        # independently provable literal matches, clearly labelled separately
        # from the model's semantic judgments. Never infer missing facts here.
        if not value["correct"]:
            matches = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", unit["expected"]["text"])
                       if 12 <= len(part.strip()) <= 240 and part.strip() in unit["actual"]["text"]]
            if matches:
                value["verified_matches"] = list(dict.fromkeys(matches))[:2]
        return value
    except (ValueError, TypeError, KeyError):
        raise DDSReportGenerationError("ИИ-разбор не прошёл проверку формата или цитат исходных записей.") from None


async def infer_review(http, unit, audience, settings, *, metrics=None):
    content = json.dumps(unit, ensure_ascii=False, separators=(",", ":"))
    if len(content) > settings.max_input_chars:
        raise DDSReportGenerationError("Пара исходного доклада и ответа превышает максимально допустимый лимит; данные не обрезаны.")
    prompt = system_prompt(unit["task"], audience)
    # A single hybrid-model slot can lose its recurrent state when task prompts
    # alternate. Save/restore each prompt family instead of allocating four
    # parallel contexts and consuming their RAM on a CPU-only installation.
    fingerprint = hashlib.sha256(("system-prefix-v2\n" + settings.model + "\n" + prompt).encode()).hexdigest()
    cache_file = "dds-" + fingerprint + ".bin"
    root = settings.base_url.rstrip("/").removesuffix("/v1")

    async def slot_cache(action):
        if not settings.slot_cache:
            return False
        try:
            response = await http.post(root + "/slots/0?action=" + action,
                                       json={"filename": cache_file}, timeout=5)
            if not response.is_success:
                logger.info("DDS prompt cache action=%s unavailable status=%s", action, response.status_code)
            return response.is_success
        except httpx.HTTPError:
            logger.info("DDS prompt cache action=%s unavailable", action)
            return False

    if settings.slot_cache and not await slot_cache("restore"):
        # Persist only the system prefix. A full conversation state cannot
        # necessarily rewind a hybrid recurrent model to a changed user turn.
        # Obtain formatting from the model's own template, never hard-code it.
        marker = "__DDS_USER_ANCHOR_" + fingerprint + "__"
        try:
            formatted = await http.post(root + "/apply-template", timeout=5, json={
                "messages": [{"role": "system", "content": prompt}, {"role": "user", "content": marker}],
                "chat_template_kwargs": {"enable_thinking": False}})
            formatted.raise_for_status()
            template = formatted.json()["prompt"]
            if not isinstance(template, str) or template.count(marker) != 1:
                raise ValueError()
            prefix = template.split(marker)[0]
            async with http.stream("POST", root + "/completion", timeout=settings.timeout_seconds, json={
                "prompt": prefix, "n_predict": 0, "id_slot": 0, "cache_prompt": True,
                "stream": True, "return_progress": True, "sse_ping_interval": 1}) as warmup:
                warmup.raise_for_status()
                async for line in warmup.aiter_lines():
                    if line.startswith("data:") and line[5:].strip() != "[DONE]":
                        item = json.loads(line[5:].strip())
                        if item.get("error"):
                            raise ValueError()
            await slot_cache("save")
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            logger.info("DDS system-prefix cache unavailable; processing normal request")
    payload = {"model": settings.model, "stream": True, "temperature": 0.0, "top_p": 0.8, "seed": 42,
        "cache_prompt": True, "id_slot": 0, "return_progress": True, "sse_ping_interval": 1,
        "max_tokens": settings.max_tokens, "chat_template_kwargs": {"enable_thinking": False},
        "messages": [{"role": "system", "content": prompt},
                     {"role": "user", "content": content}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "dds_content_review", "strict": True, "schema": SCHEMA}}}
    parts, length, finish = [], 0, None
    async with http.stream("POST", settings.base_url.rstrip("/") + "/chat/completions", json=payload) as response:
        response.raise_for_status()
        try:
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                chunk = json.loads(raw)
                if chunk.get("error"):
                    raise ValueError()
                if chunk.get("timings"):
                    timings = chunk["timings"]
                    if metrics is not None:
                        metrics.append(timings)
                    logger.info("DDS review task=%s prompt_tokens=%s cached_tokens=%s predicted_ms=%s",
                                unit["task"], timings.get("prompt_n"), timings.get("cache_n"), timings.get("predicted_ms"))
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                choice = choices[0]
                text = choice.get("delta", {}).get("content") or ""
                if not isinstance(text, str):
                    raise ValueError()
                parts.append(text)
                length += len(text)
                if length > 16000:
                    raise ValueError()
                finish = choice.get("finish_reason") or finish
        except (ValueError, KeyError, TypeError, IndexError):
            raise DDSReportGenerationError("Сервис инференса вернул невалидный ответ.") from None
    if finish != "stop":
        raise DDSReportGenerationError(f"Содержательный ИИ-разбор не завершён: finish_reason='{finish}'; частичный текст не опубликован.")
    return validate_review("".join(parts), unit)


def render_review(unit, value):
    label = "Первая телефонограмма" if unit["task"] == "dispatch" else "Запись доклада"
    lines = [f"{label}. Курсант {unit['cadet_id']}; сессия {unit['session_id']}; карточка {unit['card_id']}; служба {unit['service']}.",
             f"Источник: {unit['expected']['ref']}. Запись: {unit['actual']['ref']}." + (f" Время: {unit['at']}." if unit.get("at") else "")]
    for item in value["correct"]:
        lines.append(f"Передано верно: {item['explanation']} Исходный доклад: «{item['expected_quote']}»; запись: «{item['actual_quote']}».")
    for quote in value.get("verified_matches", []):
        lines.append(f"Дословно совпадает в докладе и записи: «{quote}».")
    for item in value["issues"]:
        lines.append(f"Замечание ИИ: {item['explanation']} Исходный доклад: «{item['expected_quote']}»; запись: «{item['actual_quote']}».")
        lines.append(f"Пример исправления: {item['correction']}\nОтработать: {item['practice']}")
    lines.extend("Граница проверки: " + LIMITATIONS[item] for item in value["limitations"])
    return "\n".join(lines)


async def generate_semantic_report(snapshot, kind, settings, client=None):
    from backend.core.report_inference import report_facts
    evidence = snapshot["semantic"]
    units = evidence["comparisons"]
    # Validate ALL input sizes before spending CPU or publishing any analysis.
    for unit in units:
        if len(json.dumps(unit, ensure_ascii=False, separators=(",", ":"))) > settings.max_input_chars:
            raise DDSReportGenerationError("Пара исходного доклада и ответа превышает максимально допустимый лимит; данные не обрезаны.")
    limits = list(evidence["limitations"])
    limits.append("Разбор выделяет до трёх существенных замечаний на запись и не является исчерпывающей экспертизой.")
    for unit in units:
        limits.extend(unit.get("context", {}).get("limits", []))
    lines = [report_facts(snapshot, kind), "Содержательный разбор ИИ\nМетодические выводы модели; оценки и программные критерии не изменены."]

    async def consume(http):
        # One CPU request at a time, including demos. Release between pairs so
        # a large group report cannot starve all individual reports.
        for unit in sorted(units, key=lambda u: u["task"]):
            async with _inference_lock:
                value = await asyncio.wait_for(infer_review(http, unit, "student" if kind == "student" else "teacher", settings),
                                               settings.timeout_seconds)
            lines.append(render_review(unit, value))

    if units:
        if client is not None:
            await consume(client)
        else:
            async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=settings.timeout_seconds) as http:
                await consume(http)
    else:
        limits.append("Содержательный ИИ-разбор недоступен: нет исходного доклада и сохранённого ответа для сопоставления. Модель не вызывалась.")
    if limits:
        lines.append("Ограничения проверки\n" + "\n".join(dict.fromkeys(limits)))
    return {"analysis_text": "\n\n".join(lines), "model_used": settings.model if units else None}
