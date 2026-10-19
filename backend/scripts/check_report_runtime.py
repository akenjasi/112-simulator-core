"""Synthetic inference/cancellation/sleep acceptance. Never reads the application DB.

Run against an isolated llama.cpp with --sleep-idle-seconds 10 --slots.
Optional --container NAME measures that container's server RSS (read-only).
"""
import argparse
import asyncio
import json
import os
import subprocess
import time

import httpx

from backend.core.dds_report_llm import DDSLLMSettings
from backend.core.report_inference import generate_report
from backend.core.report_runtime import confirm_runtime_idle


def rss(container):
    if not container:
        return None
    status = subprocess.check_output(["docker", "exec", container, "cat", "/proc/1/status"], text=True)
    return int(next(line.split()[1] for line in status.splitlines() if line.startswith("VmRSS:"))) * 1024


async def check(base_url, container):
    os.environ["DDS_LLM_BASE_URL"] = base_url
    root = base_url.rstrip("/").removesuffix("/v1")
    settings = DDSLLMSettings(base_url=base_url, timeout_seconds=900)
    sample = {"summary": {"sessions": 1, "participants": 1, "total_cards": 1, "completed_cards": 1,
                          "incomplete_cards": 0, "mistakes": 1, "sessions_with_score": 0},
              "criteria": {"accuracy:not_completed": 1, "completion:completed": 1},
              "mistakes": {"record_accuracy": 1}, "examples": [], "source_revisions": {},
              "warnings": ["Числовая оценка отсутствует."]}
    async with httpx.AsyncClient(timeout=3, trust_env=False) as client:
        task = asyncio.create_task(generate_report(sample, "student", settings=settings))
        try:
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                try:
                    response = await client.get(root + "/slots")
                    if response.is_success and any(slot.get("is_processing") for slot in response.json()):
                        break
                except httpx.HTTPError:
                    pass
                if task.done():
                    raise RuntimeError("Generation ended before cancellation could be exercised")
                await asyncio.sleep(.2)
            else:
                raise RuntimeError("No active inference slot observed")
            loaded_rss = rss(container)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            assert await confirm_runtime_idle(), "Server kept computing after stream cancellation"
            deadline = time.monotonic() + 40
            while time.monotonic() < deadline:
                props = (await client.get(root + "/props")).json()
                if props.get("is_sleeping") is True:
                    break
                await asyncio.sleep(1)
            else:
                raise RuntimeError("Model did not unload after idle timeout")
            sleeping_rss = rss(container)
            if loaded_rss is not None:
                assert sleeping_rss < loaded_rss * .5, "RSS did not fall substantially after unload"
            result = await generate_report(sample, "student", settings=settings)
            assert result["analysis_text"].strip()
            print(json.dumps({"cancelled_slot": True, "sleeping": True, "loaded_rss_bytes": loaded_rss,
                "sleeping_rss_bytes": sleeping_rss, "regenerated_chars": len(result["analysis_text"])}, ensure_ascii=False))
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--container")
    arguments = parser.parse_args()
    asyncio.run(check(arguments.base_url, arguments.container))
