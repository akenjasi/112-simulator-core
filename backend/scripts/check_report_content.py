"""Exercise a real CPU model on synthetic text pairs, without opening a database."""
import argparse
import asyncio
from copy import deepcopy
import json
import os
from pathlib import Path
import time

import httpx

from backend.core.dds_report_llm import DDSLLMSettings
from backend.core.report_semantic import infer_review, render_review


def samples():
    unit = {"comparison_id": "synthetic/report", "task": "report", "cadet_id": "учебный-курсант",
        "session_id": "проверка-cpu", "card_id": "учебная-карточка", "service": "Пожарные", "at": None,
        "expected": {"ref": "synthetic/received-report", "text": "Начальник бригады Иванов Иван Иванович. Бригада номер один. Прибытие. Бригада прибыла на место."},
        "actual": {"ref": "synthetic/saved-note", "text": "Начальник бригады Иванов Иван Иванович. Бригада 2 прибыла на место."},
        "context": {"card": {"ref": "synthetic/card", "text": "ДТП. Водитель заблокирован."},
            "etalon": {"ref": "synthetic/etalon", "text": "Направить пожарных и скорую помощь."},
            "limits": ["Аудиозапись устной передачи задания отсутствует."]}}
    faithful = deepcopy(unit)
    faithful["comparison_id"] = "synthetic/faithful"
    faithful["actual"]["text"] = "Начальник бригады Иванов Иван Иванович. Бригада 1 прибыла на место."
    dispatch = deepcopy(faithful)
    dispatch["task"] = "dispatch"
    dispatch["comparison_id"] = "synthetic/dispatch"
    dispatch["expected"]["text"] = "Начальник бригады Иванов Иван Иванович. Бригада номер один. Начало реагирования. Бригада выехала."
    dispatch["actual"]["text"] = "Начальник бригады Иванов Иван Иванович. Бригада 1 выехала."
    result = deepcopy(unit)
    result["comparison_id"] = "synthetic/held-out-result"
    result["expected"]["text"] = "Начальник бригады Сидоров Алексей Сергеевич. Бригада номер три. Работы завершены. Водитель деблокирован и передан медикам."
    result["actual"]["text"] = "Начальник бригады Сидоров Алексей Сергеевич. Бригада 3. Работы завершены."
    other_number = deepcopy(unit)
    other_number["comparison_id"] = "synthetic/held-out-number"
    other_number["expected"]["text"] = "Начальник бригады Петров Пётр Петрович. Бригада номер два. Бригада выехала на место ДТП."
    other_number["actual"]["text"] = "Начальник бригады Петров Пётр Петрович. Бригада 3 выехала на место ДТП."
    return [("wrong_brigade", unit), ("faithful_paraphrase", faithful), ("dispatch_scope", dispatch),
            ("return_to_report", faithful), ("held_out_result", result), ("held_out_number", other_number)]


async def check(args):
    settings = DDSLLMSettings(base_url=args.base_url, model=args.model, timeout_seconds=900, slot_cache=True)
    results = []
    async with httpx.AsyncClient(timeout=900, trust_env=False) as client:
        for name, unit in samples():
            if args.cases and name not in args.cases:
                continue
            timings = []
            started = time.monotonic()
            value = await infer_review(client, unit, "student", settings, metrics=timings)
            result = {"case": name, "seconds": round(time.monotonic() - started, 2), "timings": timings,
                      "review": value, "text": render_review(unit, value)}
            results.append(result)
            if args.output:
                output = Path(args.output)
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps({"model": settings.model, "cases": results}, ensure_ascii=False, indent=2), encoding="utf-8")
            if name == "wrong_brigade":
                assert value["correct"], "Model omitted correctly retained facts"
                assert len(value["issues"]) == 1 and all("Бригада номер один" in i["expected_quote"] and "2" in i["actual_quote"] and "1" in i["explanation"] and "2" in i["explanation"] for i in value["issues"]), "Wrong brigade was not correctly identified: " + json.dumps(value, ensure_ascii=False)
            elif name == "held_out_result":
                assert value["correct"] and len(value["issues"]) == 1 and all("деблокирован" in i["expected_quote"] for i in value["issues"]), "Omitted result was not found: " + json.dumps(value, ensure_ascii=False)
            elif name == "held_out_number":
                assert (value["correct"] or value.get("verified_matches")) and len(value["issues"]) == 1 and all("номер два" in i["expected_quote"] and "3" in i["actual_quote"] and "2" in i["explanation"] and "3" in i["explanation"] for i in value["issues"]), "Held-out number was not compared correctly: " + json.dumps(value, ensure_ascii=False)
            else:
                assert value["correct"] and not value["issues"], "Model penalized a faithful paraphrase or unrecorded instruction: " + json.dumps(value, ensure_ascii=False)
            if name == "return_to_report":
                assert any(t.get("cache_n", 0) > 0 for t in timings), "Prompt cache was lost on task switch"
            print(json.dumps({k: result[k] for k in ("case", "seconds", "timings")}, ensure_ascii=False), flush=True)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"model": settings.model, "cases": results}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:18081/v1")
    parser.add_argument("--model", default=os.getenv("DDS_LLM_MODEL", "dds-qwen"))
    parser.add_argument("--output")
    parser.add_argument("--cases", nargs="+", choices=[name for name, _ in samples()])
    asyncio.run(check(parser.parse_args()))
