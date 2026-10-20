"""Persist only constant system prefixes; never save a user's conversation."""
import hashlib
import json
import logging
import os
from pathlib import Path

import httpx

from backend.core.dds_report_llm import DDSReportGenerationError

logger = logging.getLogger(__name__)


def prefix_filename(prompt, model_sha, build, context, rendered):
    identity = {"version": 1, "weights": model_sha, "runtime": build, "context": context,
                "thinking": False, "system": prompt, "rendered": rendered}
    return "brief-" + hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest() + ".bin"


async def restore_prefix(http, settings, prompt):
    if not settings.slot_cache:
        return
    root = settings.base_url.rstrip("/").removesuffix("/v1")
    # The standard weights are verified by provisioning. Custom deployments must
    # supply their verified digest; an alias alone must never identify KV state.
    manifest = json.loads((Path(__file__).resolve().parents[2] / "tools" / "models.json").read_text())
    digest = os.getenv("DDS_LLM_MODEL_SHA256", manifest["report"]["sha256"])
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise DDSReportGenerationError("Невалидный SHA-256 весов для кэша сводок.")
    props = await http.get(root + "/props", timeout=5)
    props.raise_for_status()
    models = await http.get(root + "/v1/models", timeout=5)
    models.raise_for_status()
    configured = next((m for m in models.json().get("data", []) if m.get("id") == settings.model), None)
    if not configured or configured.get("meta", {}).get("n_params") != 4205751296:
        raise DDSReportGenerationError("Для сводок требуется подготовленная Qwen3.5-4B.")
    marker = "__BRIEF_DYNAMIC_INPUT__"
    formatted = await http.post(root + "/apply-template", timeout=5, json={
        "messages": [{"role": "system", "content": prompt}, {"role": "user", "content": marker}],
        "chat_template_kwargs": {"enable_thinking": False}})
    formatted.raise_for_status()
    template = formatted.json()["prompt"]
    if not isinstance(template, str) or template.count(marker) != 1:
        raise DDSReportGenerationError("Не удалось выделить постоянный префикс сводки.")
    prefix = template.split(marker)[0]
    build = props.json().get("build_info")
    if not build:
        raise DDSReportGenerationError("Runtime не сообщил версию для кэша сводок.")
    filename = prefix_filename(prompt, digest, build, configured["meta"].get("n_ctx"), prefix)
    restored = await http.post(root + "/slots/0?action=restore", json={"filename": filename}, timeout=5)
    if restored.is_success:
        logger.info("DDS brief prefix restored tokens=%s", restored.json().get("n_restored"))
        return
    # This state contains only system instructions/examples and the user header.
    # Stream warmup so closing the request also cancels prefill for a new lesson.
    async with http.stream("POST", root + "/completion", json={
            "prompt": prefix, "n_predict": 0, "cache_prompt": False, "id_slot": 0,
            "stream": True, "return_progress": True, "sse_ping_interval": 1}) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if line.startswith("data:") and line[5:].strip() != "[DONE]":
                if json.loads(line[5:].strip()).get("error"):
                    raise DDSReportGenerationError("Не удалось подготовить префикс сводки.")
    saved = await http.post(root + "/slots/0?action=save", json={"filename": filename}, timeout=5)
    if not saved.is_success:
        logger.warning("DDS brief prefix save unavailable status=%s; prefill remains in RAM", saved.status_code)


async def warm_prefixes(settings=None):
    from backend.core.dds_report_llm import get_llm_settings
    from backend.core.report_brief import inference_lock, system_prompt
    settings = settings or get_llm_settings()
    async with httpx.AsyncClient(timeout=settings.timeout_seconds, trust_env=False) as http:
        async with inference_lock:
            for role in ("teacher", "student"):
                await restore_prefix(http, settings, system_prompt(role))
