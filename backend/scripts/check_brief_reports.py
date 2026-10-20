"""Exercise short CPU summaries and persisted prefixes with synthetic data, no DB."""
import argparse
import asyncio
from copy import deepcopy
import json
from pathlib import Path
import time

from backend.core.dds_report_llm import DDSLLMSettings
from backend.core.report_brief import ORDER, freeze_brief, generate_brief, model_input
from backend.core.report_prefix import warm_prefixes


async def check(args):
    settings = DDSLLMSettings(base_url=args.base_url, model=args.model, timeout_seconds=180, slot_cache=True)
    started = time.monotonic()
    await warm_prefixes(settings)
    output = {"warmup_seconds": round(time.monotonic() - started, 3), "cases": []}
    base = freeze_brief({"summary": {"sessions": 1, "total_cards": 2, "completed_cards": 2,
        "incomplete_cards": 0, "mistakes": 0}, "criteria": {k + ":completed": 2 for k in ORDER}})
    for name, kind in [("success", "student"), ("confirmation", "student"), ("accuracy", "lesson"),
                       ("corrected", "student"), ("incomplete", "student"), ("insufficient", "lesson")]:
        snapshot = deepcopy(base)
        if name in ("confirmation", "accuracy"):
            snapshot["criteria"][name + ":not_completed"] = 1
        if name == "corrected":
            snapshot["criteria"]["accuracy:completed_after_correction"] = 1
        if name == "incomplete":
            snapshot["summary"]["incomplete_cards"] = 1
            snapshot["summary"]["completed_cards"] = 1
        if name == "insufficient":
            snapshot["criteria"] = {}
        started = time.monotonic()
        result = await generate_brief(snapshot, kind, settings)
        text = result["analysis_text"]
        item = {"case": name, "seconds": round(time.monotonic() - started, 3),
                "input": model_input(snapshot, "student" if kind == "student" else "teacher"), **result}
        output["cases"].append(item)
        if args.output:
            path = Path(args.output); path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(item, ensure_ascii=False), flush=True)
        if name == "confirmation": assert "подтвержд" in text.lower()
        if name == "corrected": assert "исправл" in text.lower()
        if name == "insufficient": assert "недостат" in text.lower() or "неполн" in text.lower()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8081/v1")
    parser.add_argument("--model", default="dds-qwen")
    parser.add_argument("--output")
    asyncio.run(check(parser.parse_args()))
