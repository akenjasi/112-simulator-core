#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_install
echo 'Waiting for backend and CPU LLM (up to 30 minutes)...'
ready=0
deadline=$((SECONDS + 1800))
i=0
while ((SECONDS < deadline)); do
  if compose exec -T backend python -c '
import httpx
with httpx.Client(timeout=4,trust_env=False) as c:
    c.get("http://127.0.0.1:8000/health").raise_for_status()
    c.get("http://llm:8080/health").raise_for_status()
    c.get("http://frontend:3000/login").raise_for_status()
' >/dev/null 2>&1; then ready=1; break; fi
  if ((i % 6 == 0)); then echo 'Still waiting; inspect docker compose logs if startup fails.'; fi
  ((i+=1))
  sleep 5
done
((ready)) || { compose ps; echo 'Readiness failed. Check the logs, weights, CPU compatibility and available RAM.' >&2; exit 1; }
echo 'Services ready. Testing the local model with a synthetic prompt...'
compose exec -T backend python -c '
import httpx, os
with httpx.Client(timeout=float(os.getenv("DDS_LLM_TIMEOUT_SECONDS", "900")),trust_env=False) as c:
    r=c.post("http://llm:8080/v1/chat/completions",json={"model":"dds-qwen","messages":[{"role":"user","content":"Ответь одним словом: готово"}],"max_tokens":64,"chat_template_kwargs":{"enable_thinking":False}})
    r.raise_for_status()
    assert r.json()["choices"][0]["message"]["content"].strip(), "Model returned no text"
print("CPU inference passed; no lesson data was used.")
'
echo 'Testing local Qwen TTS with an uncached synthetic phrase...'
compose exec -T backend python -c '
import io, os, sys, tempfile, wave
if os.getenv("TTS_ENABLED", "true").strip().lower() not in {"true", "1", "yes", "on"}:
    print("TTS explicitly disabled; synthesis check skipped.")
    sys.exit(0)
from backend.core.tts_v2 import QwenTTSV2
with tempfile.TemporaryDirectory() as cache:
    audio = QwenTTSV2(cache_dir=cache).synthesize("Проверка связи.")
    with wave.open(io.BytesIO(audio), "rb") as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, 8000)
        assert wav.getnframes() > 0
print("Qwen TTS passed: PCM16, mono, 8000 Hz; no lesson data was used.")
'
compose ps
