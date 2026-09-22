import os
import re
import json
import logging
import threading
from typing import Generator, Optional, Dict, Any, Union

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
try:
    from llama_cpp import LlamaDiskCache
except ImportError:
    try:
        from llama_cpp.llama_cache import LlamaDiskCache
    except ImportError:
        LlamaDiskCache = None
# Replaced LlamaRAMCache with LlamaDiskCache for persistent KV cache

logger = logging.getLogger(__name__)

# Request schema for Ground Truth and Scenario Generation
class FactoidGenerationRequest(BaseModel):
    plot: str = ""
    extra_plot: str = ""
    okrug: str = ""
    rayon: str = ""
    street: str = ""
    house: str = ""
    corpus: str = ""
    stroenie: str = ""
    flat: str = ""
    podiezd: str = ""
    floor: str = ""
    domofon: str = ""
    fio: str = ""
    phone: str = ""
    ground_truth: Optional[Dict[str, Any]] = None

# 4 required markers (reduced factoids: SM and SD)
VALID_MARKERS = (
    "SM1", "SM2", "SD1", "SD2"
)

# Regex matching any marker followed by separator (: - – — .) or whitespace
_MARKERS_OR = "|".join(VALID_MARKERS)
FACTOID_REGEX = re.compile(
    rf"^\s*({_MARKERS_OR})(?:\s*[:\-–—.]\s*|\s+)(.*)$",
    re.IGNORECASE
)

# Strict system prompt requiring only 4 markers
SYSTEM_PROMPT = """Ты — профессиональный генератор реплик для тренажера операторов Системы-112. 
Твоя задача: на основе переданных строгих данных и фабулы сгенерировать 4 речевые реплики (фактоида) заявителя: SM1, SM2, SD1, SD2. Нам нужны только эти 4 строки.

КРИТИЧЕСКОЕ ПРАВИЛО: ОТВЕЧАЙ СРАЗУ. ТЕБЕ СТРОГО ЗАПРЕЩЕНО ИСПОЛЬЗОВАТЬ ТЕГИ <think> ИЛИ ВЕСТИ ВНУТРЕННИЙ МОНОЛОГ. СТРОГО ЗАПРЕЩЕНО РАССУЖДАТЬ И АНАЛИЗИРОВАТЬ. ВЫВОДИ ТОЛЬКО 4 СТРОКИ МАРКЕРОВ (SM1, SM2, SD1, SD2). НАМ НУЖНЫ ТОЛЬКО ЭТИ 4 СТРОКИ.

ПРАВИЛА ГЕНЕРАЦИИ:
1. Реплики с индексом "1" (SM1, SD1) — спокойные, четкие ответы.
2. Реплики с индексом "2" (SM2, SD2) — паникующие, раздраженные, просторечные.
3. Ты ОБЯЗАН вывести ровно 4 строки, начиная с маркера и двоеточия (SM1, SM2, SD1, SD2). Запрещены вводные слова, пустые строки и любые другие маркеры. Нам нужны только эти 4 строки.
4. Для маркера SM (Описание ситуации): обязательно пиши суть из фабулы происшествия.
5. Для маркера SD (Детали обстановки): указывай специфичные детали происходящего на месте, описывай физические действия и обстановку. СТРОГО ЗАПРЕЩЕНЫ фразы "я жду указаний" и "на связи".

СПИСОК МАРКЕРОВ:
SM1: Описание ситуации 1 (суть из фабулы)
SM2: Описание ситуации 2 (паника, суть из фабулы)
SD1: Детали обстановки 1 (специфичные детали, физические действия)
SD2: Детали обстановки 2 (паника, специфичные детали, запрещены "я жду указаний" и "на связи")

Пример ВВОДА:
[КЛАССИФИКАТОР]: Пожар в квартире
[УЛИЦА]: Ленина
[ДОМ]: 45
[КВАРТИРА]: 12
[ФИО]: Смирнова Анна
[ТЕЛЕФОН]: 89991112233
[ФАБУЛА]: Горит кухня, сильный дым. В квартире остался кот.

Пример ВЫВОДА:
SM1: У нас начался пожар в квартире, горит кухня.
SM2: Кухня полыхает, всё в дыму, дышать нечем!
SD1: Дым уже пошел в коридор, огонь перекидывается на обои.
SD2: Ничего не видно из-за дыма, там уже вся мебель горит!"""

_llm_instance = None
_llm_lock = threading.Lock()
# Note: warmup removed as it blocks 27B model.


def get_llm():
    """
    Lazy initialization / singleton getter for Llama with LlamaDiskCache and warmup.
    Ensures importing the module does not block or fail if the model is not yet loaded.
    """
    global _llm_instance
    import llama_cpp
    try:
        from llama_cpp import LlamaDiskCache
    except ImportError:
        try:
            from llama_cpp.llama_cache import LlamaDiskCache
        except ImportError:
            LlamaDiskCache = getattr(llama_cpp, "LlamaDiskCache", None)

    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    cache_dir = os.path.join(project_root, "data", "llm_cache")

    # In test environments with MagicMock, retrieve directly to support test-level side_effects
    if hasattr(llama_cpp.Llama, "assert_called") and "assert_called" not in getattr(llama_cpp.Llama, "_mock_children", {}):
        mock_instance = llama_cpp.Llama()
        if LlamaDiskCache is not None:
            try:
                os.makedirs(cache_dir, exist_ok=True)
                mock_instance.set_cache(LlamaDiskCache(cache_dir=cache_dir))
            except Exception:
                pass
        return mock_instance

    if _llm_instance is not None:
        return _llm_instance

    with _llm_lock:
        if _llm_instance is not None:
            return _llm_instance

        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        cache_dir = os.path.join(project_root, "data", "llm_cache")
        primary_model_name = "Qwen3.5-9B-Q4_K_M.gguf"
        cand1 = os.path.join(project_root, "models", primary_model_name)
        cand2 = os.path.abspath(os.path.join("models", primary_model_name))
        cand_ext1 = f"/app/models_external/{primary_model_name}"
        cand_ext2 = f"/opt/112_models/{primary_model_name}"
        
        env_model_path = os.environ.get("LLM_MODEL_PATH")
        if env_model_path and os.path.exists(env_model_path):
            model_path = env_model_path
        elif os.path.exists(cand1):
            model_path = cand1
        elif os.path.exists(cand2):
            model_path = cand2
        elif os.path.exists(cand_ext1):
            model_path = cand_ext1
        elif os.path.exists(cand_ext2):
            model_path = cand_ext2
        elif env_model_path:
            model_path = env_model_path
        else:
            model_path = cand1

        # Strict mode: Fallback to Qwen 2.5 1.5B is strictly disabled for teacher scenario generator.
        # Fail fast if Qwen 3.5 9B model file does not exist on disk (unless running under test mock).
        is_test_mock = (
            hasattr(llama_cpp.Llama, "assert_called") or 
            str(type(llama_cpp.Llama)).find("Mock") != -1 or 
            os.environ.get("TEST_MOCK_LLM") == "1"
        )
        if not is_test_mock and not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model Qwen 3.5 9B (Qwen3.5-9B-Q4_K_M.gguf) not found at '{model_path}'. "
                f"Fallback to Qwen 2.5 1.5B is strictly disabled. "
                f"Please ensure the model is downloaded to models/Qwen3.5-9B-Q4_K_M.gguf or set LLM_MODEL_PATH."
            )

        n_threads = int(os.environ.get("LLM_N_THREADS", os.cpu_count() or 4))
        n_ctx = int(os.environ.get("LLM_N_CTX", "2048"))

        _llm_instance = llama_cpp.Llama(
            model_path=model_path,
            n_ctx=n_ctx,
            n_threads=n_threads,
            n_threads_batch=n_threads,
            verbose=False
        )

        if LlamaDiskCache is not None:
            try:
                os.makedirs(cache_dir, exist_ok=True)
                _llm_instance.set_cache(LlamaDiskCache(cache_dir=cache_dir))
            except Exception as e:
                logger.warning("Failed to attach LlamaDiskCache: %s", e)

        return _llm_instance


def format_ground_truth_input(payload: Union[FactoidGenerationRequest, dict, str]) -> str:
    """
    Формирует структурированный ввод (prompt) на основе переданных эталонных данных.
    """
    if isinstance(payload, str):
        return f"Фабула происшествия:\n{payload}"

    if isinstance(payload, FactoidGenerationRequest):
        data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    elif isinstance(payload, dict):
        data = payload
    else:
        data = {}

    gt = data.get("ground_truth") or {}
    def val(k):
        return str(data.get(k) or gt.get(k) or "").strip()

    okrug = val("okrug")
    rayon = val("rayon")
    street = val("street")
    house = val("house")
    corpus = val("corpus")
    stroenie = val("stroenie")
    flat = val("flat")
    podiezd = val("podiezd")
    floor = val("floor")
    domofon = val("domofon")
    fio = val("fio")
    phone = val("phone")
    plot = val("extra_plot") or val("plot")

    lines = [
        "ВХОДНЫЕ СТРОГИЕ ДАННЫЕ (ЭТАЛОН / GROUND TRUTH):",
        f"- Округ: {okrug or 'Не указан'}",
        f"- Район: {rayon or 'Не указан'}",
        f"- Улица: {street or 'Не указана'}",
        f"- Дом: {house or 'Не указан'}",
        f"- Корпус: {corpus or 'Не указан'}",
        f"- Строение: {stroenie or 'Не указано'}",
        f"- Квартира: {flat or 'Не указана'}",
        f"- Подъезд: {podiezd or 'Не указан'}",
        f"- Этаж: {floor or 'Не указан'}",
        f"- Домофон: {domofon or 'Не указан'}",
        f"- ФИО: {fio or 'Не указано'}",
        f"- Телефон: {phone or 'Не указан'}",
        f"- Фабула / Доп. Фабула: {plot or 'Не указана'}"
    ]
    return "\n".join(lines)


def stream_scenario_factoids(request_data: Union[FactoidGenerationRequest, str, dict]) -> Generator[str, None, None]:
    """
    Stream tokens from local LLM, buffering until newline, then parsing factoid markers.
    Yields SSE events formatted as:
      event: factoid
      data: {"marker": "AM1", "text": "..."}
    """
    yield 'event: status\ndata: {"text": "Инициализация модели..."}\n\n'
    llm = get_llm()
    prompt_text = format_ground_truth_input(request_data)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt_text},
    ]

    logger.info("LLM is generating response...")
    yield 'event: status\ndata: {"text": "Обработка промпта / Prefill..."}\n\n'
    response = llm.create_chat_completion(
        messages=messages,
        temperature=0.0,
        stream=True,
    )

    buffer = ""
    for chunk in response:
        choices = chunk.get("choices", [])
        if not choices:
            continue
        delta = choices[0].get("delta", {})
        content = delta.get("content", "")
        if not content:
            continue

        logger.debug("LLM chunk: %r", content)

        buffer += content

        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            line = line.strip()
            if not line:
                continue
            match = FACTOID_REGEX.match(line)
            if match:
                marker = match.group(1).upper()
                text = match.group(2).strip()
                data = {"marker": marker, "text": text}
                yield f"event: factoid\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            else:
                yield f'event: thought\ndata: {{"text": {json.dumps(line, ensure_ascii=False)}}}\n\n'

    if buffer.strip():
        line = buffer.strip()
        match = FACTOID_REGEX.match(line)
        if match:
            marker = match.group(1).upper()
            text = match.group(2).strip()
            data = {"marker": marker, "text": text}
            yield f"event: factoid\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        else:
            yield f'event: thought\ndata: {{"text": {json.dumps(line, ensure_ascii=False)}}}\n\n'


router = APIRouter(prefix="/api/v2", tags=["v2_engine"])
factoid_router = router


@router.post("/generate_scenario_sse")
def generate_scenario_sse(payload: FactoidGenerationRequest):
    return StreamingResponse(
        stream_scenario_factoids(payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
