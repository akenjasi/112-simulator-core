import os
import re
import json
import time
import logging
from typing import Dict, Any, List, Optional, Tuple, Set

logger = logging.getLogger(__name__)

try:
    from llama_cpp import Llama
except ImportError:
    class Llama:  # type: ignore
        def __init__(self, *args, **kwargs):
            raise RuntimeError("llama_cpp is not installed")


class MockLlamaFallback:
    """Fallback mock when Llama model initialization fails."""
    def create_completion(self, prompt: str = "", max_tokens: int = 1, temperature: float = 0.0, **kwargs) -> Dict[str, Any]:
        return {"choices": [{"text": "7"}]}


SYSTEM_PROMPT = """<|im_start|>system
Ты — классификатор намерений (intent classifier). Классифицируй реплику оператора 112 строго одной цифрой от 0 до 9.
0 - Установление контакта (да, это 112, слушаю, говорите)
1 - Запрос улицы, дома, города
2 - Запрос квартиры, подъезда, этажа
3 - Запрос о том, что случилось (детали ситуации)
4 - Запрос о пострадавших (есть ли раненые)
5 - Запрос ФИО заявителя (как вас зовут)
6 - Запрос телефона заявителя (ваш номер)
7 - Переспрашивание, плохая связь (повторите, не слышу)
8 - Бюрократия (лишние вопросы)
9 - Завершение (службы выехали, до свидания)
<|im_end|>
<|im_start|>user
да, это 112, что случилось?<|im_end|>
<|im_start|>assistant
<think>\n</think>\n0<|im_end|>
<|im_start|>user
это оператор 112<|im_end|>
<|im_start|>assistant
<think>\n</think>\n0<|im_end|>
<|im_start|>user
Где вы находитесь? Назовите адрес.<|im_end|>
<|im_start|>assistant
<think>\n</think>\n1<|im_end|>
<|im_start|>user
Что именно у вас произошло?<|im_end|>
<|im_start|>assistant
<think>\n</think>\n3<|im_end|>
<|im_start|>user
{operator_message}<|im_end|>
<|im_start|>assistant
<think>\n</think>\n"""

INTENT_KEYS = {
    "0": "greeting",
    "1": "address",
    "2": "address_details",
    "3": "situation",
    "4": "victims",
    "5": "caller_id",
    "6": "phone",
    "7": "repeat",
    "8": "bureaucracy",
    "9": "outro",
}


class V2ApplicantSession:
    def __init__(self, scenario: Optional[Dict[str, Any]] = None, session_id: Optional[str] = None):
        self.scenario = dict(scenario or {})
        self.session_id = session_id or self.scenario.get("session_id") or f"sess_{int(time.time()*1000)}"

        self.ticket_id = self.scenario.get("ticket_id") or self.scenario.get("id")
        self.question_id = self.scenario.get("question_id") or self.scenario.get("situation_id") or 1

        self.address = self.scenario.get("address", "")
        self.situation = self.scenario.get("situation", "")
        self.caller_name = self.scenario.get("caller_name", "Заявитель")
        self.caller_phone = self.scenario.get("caller_phone", "+7 (916) 000-00-00")
        self.has_victims = bool(self.scenario.get("has_victims", False))

        self.panic_level = int(self.scenario.get("panic_level", 50))
        self.state = "grounded"

        self.asked_intents: Set[str] = set()
        self.dialogue_history: List[Dict[str, Any]] = []
        self.cliche_violations = 0
        self.grounding_attempts = 0

        self.revealed_address = False
        self.revealed_victims = False
        self.revealed_details = False
        self.revealed_name = False

        self.last_reply: Optional[str] = None
        self.last_fact: Optional[Tuple[str, str]] = None

        # Load bricks matrix if available
        self.bricks_data: Dict[str, Any] = self._load_bricks_data()
        self._enrich_from_bricks_metadata()

        # Initialize Llama model
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.environ.get("LLM_MODEL_PATH", "models/Qwen3.5-0.8B-Q8_0.gguf")
            full_model_path = os.path.join(base_dir, "..", "..", model_path)
            full_model_path = os.path.normpath(full_model_path)
            self.llm = Llama(
                model_path=full_model_path,
                n_ctx=2048,
                verbose=False,
            )
        except Exception as e:
            logger.warning(f"Llama initialization failed ({e}), using graceful mock returning '7'")
            self.llm = MockLlamaFallback()

    def _load_bricks_data(self) -> Dict[str, Any]:
        """Locates and loads bricks JSON matrix for the current ticket."""
        tid = self.ticket_id
        qid = self.question_id
        candidates: List[str] = []

        if tid is not None:
            s_tid = str(tid).strip()
            candidates.append(f"bricks_ticket_{s_tid}_sit_01.json")
            candidates.append(f"bricks_ticket_{s_tid}.json")
            if s_tid.isdigit():
                i_tid = int(s_tid)
                candidates.append(f"bricks_ticket_{i_tid:02d}_sit_01.json")
                candidates.append(f"bricks_ticket_{i_tid:02d}.json")
                candidates.append(f"bricks_ticket_{i_tid}_sit_01.json")
                candidates.append(f"bricks_ticket_{i_tid}.json")
            if qid is not None:
                s_qid = str(qid).strip()
                if s_qid.isdigit():
                    i_qid = int(s_qid)
                    candidates.append(f"bricks_ticket_{s_tid}_sit_{i_qid:02d}.json")
                    if s_tid.isdigit():
                        candidates.append(f"bricks_ticket_{int(s_tid):02d}_sit_{i_qid:02d}.json")

        base_dirs = [
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "modular_dialogue"),
            os.path.join(os.getcwd(), "data", "modular_dialogue"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "modular_dialogue"),
            "data/modular_dialogue",
        ]

        for bdir in base_dirs:
            if not os.path.exists(bdir):
                continue
            for cand in candidates:
                p = os.path.join(bdir, cand)
                if os.path.isfile(p):
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            return json.load(f)
                    except Exception as err:
                        logger.warning(f"Failed to read bricks file {p}: {err}")

        return {}

    def _enrich_from_bricks_metadata(self) -> None:
        """Enriches session attributes from bricks metadata if scenario fields were empty."""
        meta = self.bricks_data.get("metadata", {})
        char = meta.get("character", {})
        inc = meta.get("incident", {})

        if (not self.caller_name or self.caller_name == "Заявитель") and char.get("name"):
            self.caller_name = char["name"]
        if (not self.caller_phone or self.caller_phone == "+7 (916) 000-00-00") and char.get("phone"):
            self.caller_phone = char["phone"]
        if not self.address and inc.get("address"):
            self.address = inc["address"]
        if not self.situation and inc.get("situation"):
            self.situation = inc["situation"]
        if not self.has_victims and "has_victims" in inc:
            self.has_victims = bool(inc["has_victims"])

    def get_initial_phrase(self, variant: Optional[str] = None) -> Dict[str, Any]:
        """Returns the initial applicant phrase upon call connection."""
        intro_brick = None
        for b in self.bricks_data.get("bricks", []):
            if b.get("role") == "INTRO_EMOTION" or b.get("category") == "intro" or b.get("intent") == "intro":
                intro_brick = b
                break

        if intro_brick:
            text = intro_brick.get("text", "")
            audio_id = intro_brick.get("audio_id", "")
            emotion = intro_brick.get("emotion", "panic" if self.panic_level > 60 else "grounded")
        else:
            situation = self.situation or "ЧП"
            text = (
                f"Алло! 112?! Помогите скорее! {situation}! Вы слышите меня?!"
                if self.panic_level > 60 else
                f"Здравствуйте! Служба 112? У нас тут ЧП: {situation}. Пришлите службы!"
            )
            audio_id = "brk_greeting_resp_01"
            emotion = "panic" if self.panic_level > 60 else "grounded"

        return {
            "variant": variant or "A",
            "audio_id": audio_id,
            "text": text,
            "emotion": emotion,
            "intensity": 3 if emotion == "panic" else 1,
            "speech_rate": "fast" if emotion == "panic" else "normal",
        }

    def get_black_box_history(self) -> List[Dict[str, Any]]:
        return [
            {
                "timestamp": turn.get("timestamp", time.time()),
                "sender": turn.get("sender", "caller"),
                "text": turn.get("text", ""),
                "state": turn.get("state", self.state),
                "panic_level": turn.get("panic_level", self.panic_level),
                "intent": turn.get("intent", ""),
            }
            for turn in self.dialogue_history
        ]

    def _classify_intent(self, operator_message: str) -> str:
        prompt = SYSTEM_PROMPT.replace("{operator_message}", operator_message)
        try:
            resp = self.llm.create_completion(prompt=prompt, max_tokens=1, temperature=0.0)
            raw_text = ""
            if isinstance(resp, dict) and "choices" in resp and len(resp["choices"]) > 0:
                choice = resp["choices"][0]
                if isinstance(choice, dict):
                    raw_text = str(choice.get("text", "")).strip()

            if raw_text in "0123456789" and len(raw_text) == 1:
                return raw_text
            elif len(raw_text) > 0 and raw_text[0] in "0123456789":
                return raw_text[0]
            else:
                return "7"
        except Exception as err:
            logger.warning(f"Error during intent classification: {err}")
            return "7"

    def _get_irritation_text(self) -> str:
        # Search bricks for IRRITATION_MARKER
        for b in self.bricks_data.get("bricks", []):
            if b.get("role") == "IRRITATION_MARKER" or b.get("category") == "irritation" or b.get("intent") == "irritation":
                t = b.get("text", "").strip()
                if t:
                    return t
        # Search dialog_matrix
        dm = self.bricks_data.get("dialog_matrix", {})
        if "irritation" in dm:
            val = dm["irritation"]
            if isinstance(val, list) and val:
                return str(val[0]).strip()
            elif isinstance(val, str) and val:
                return val.strip()
        return "Да я же сказал:"

    def _extract_content(self, category: str) -> Tuple[str, str, str]:
        """Returns (reply_text, audio_id, emotion) for category 0-9."""
        bricks = self.bricks_data.get("bricks", [])
        matrix = self.bricks_data.get("dialog_matrix", {}) or self.bricks_data.get("matrix", {}) or {}

        def find_brick(predicate):
            for b in bricks:
                if predicate(b):
                    return b
            return None

        def find_matrix(*keys):
            for k in keys:
                if k in matrix:
                    val = matrix[k]
                    if isinstance(val, list) and len(val) > 0:
                        return str(val[0])
                    elif isinstance(val, str) and val:
                        return val
            return None

        if category == "0":  # Приветствие или молчание
            b = find_brick(lambda x: x.get("role") == "INTRO_EMOTION" or x.get("intent") in ("intro", "greeting") or x.get("category") in ("intro", "greeting"))
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "panic" if self.panic_level > 60 else "grounded")
            m = find_matrix("intro", "greeting")
            if m:
                return m, "", "grounded"
            sit = self.situation or "ЧП"
            return f"Алло! 112?! Помогите, у нас тут {sit}!", "brk_intro_panic_01", "panic" if self.panic_level > 60 else "grounded"

        elif category == "1":  # Запрос улицы и дома
            b = find_brick(lambda x: x.get("role") == "CORE_FACT" and (x.get("intent") == "address" or x.get("category") == "address"))
            if not b:
                b = find_brick(lambda x: x.get("intent") == "address" or x.get("category") == "address")
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "neutral")
            m = find_matrix("address")
            if m:
                return m, "", "neutral"
            addr = self.address or "Москва, ул. Пушкина, д. 1"
            return addr, "", "neutral"

        elif category == "2":  # Запрос деталей адреса
            b = find_brick(lambda x: x.get("intent") in ("address_details", "details_address") or x.get("category") in ("address_details", "details_address"))
            if not b:
                addr_bricks = [x for x in bricks if x.get("intent") == "address" or x.get("category") == "address"]
                if len(addr_bricks) > 1:
                    b = addr_bricks[1]
                elif len(addr_bricks) == 1:
                    b = addr_bricks[0]
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "neutral")
            m = find_matrix("address_details", "address")
            if m:
                return m, "", "neutral"
            addr = self.address or "Подъезд 1, этаж 2"
            return addr, "", "neutral"

        elif category == "3":  # Запрос деталей ситуации
            b = find_brick(lambda x: x.get("role") == "CORE_FACT" and (x.get("intent") == "situation" or x.get("category") == "situation"))
            if not b:
                b = find_brick(lambda x: x.get("intent") == "situation" or x.get("category") == "situation")
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "panic" if self.panic_level > 60 else "neutral")
            m = find_matrix("situation")
            if m:
                return m, "", "neutral"
            sit = self.situation or "Возгорание и сильное задымление"
            return sit, "", "panic" if self.panic_level > 60 else "neutral"

        elif category == "4":  # Запрос о пострадавших
            b = find_brick(lambda x: x.get("role") == "CORE_FACT" and (x.get("intent") == "victims" or x.get("category") == "victims"))
            if not b:
                b = find_brick(lambda x: x.get("intent") == "victims" or x.get("category") == "victims")
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "panic" if self.has_victims else "neutral")
            m = find_matrix("victims")
            if m:
                return m, "", "neutral"
            if self.has_victims:
                return "Да, есть пострадавшие, скорая помощь нужна срочно!", "", "panic"
            else:
                return "Пострадавших нет, слава богу, никто не пострадал, скорая не требуется.", "", "neutral"

        elif category == "5":  # Запрос ФИО
            b = find_brick(lambda x: x.get("role") == "CORE_FACT" and (x.get("intent") in ("caller_id", "fio", "name") or x.get("category") in ("caller_id", "fio", "name")))
            if not b:
                b = find_brick(lambda x: x.get("intent") in ("caller_id", "fio", "name") or x.get("category") in ("caller_id", "fio", "name"))
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "neutral")
            m = find_matrix("caller_id", "fio", "name")
            if m:
                return m, "", "neutral"
            return f"Я {self.caller_name}", "", "neutral"

        elif category == "6":  # Запрос телефона
            b = find_brick(lambda x: x.get("intent") in ("phone", "caller_phone") or x.get("category") in ("phone", "caller_phone"))
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "neutral")
            m = find_matrix("phone", "caller_phone", "caller_id")
            if m:
                return m, "", "neutral"
            return f"Мой номер телефона {self.caller_phone}", "", "neutral"

        elif category == "7":  # Переспрашивание / Плохая связь
            b = find_brick(lambda x: x.get("role") in ("REPEAT", "CLARIFICATION") or x.get("intent") in ("repeat", "clarification") or x.get("category") in ("repeat", "clarification"))
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "neutral")
            m = find_matrix("repeat", "clarification", "bad_connection")
            if m:
                return m, "", "neutral"
            if self.last_reply:
                return f"Повторяю: {self.last_reply}", "", "neutral"
            return "Алло! Вас плохо слышно! Что вы сказали?", "", "neutral"

        elif category == "8":  # Бюрократия / Неуместные вопросы
            b = find_brick(lambda x: x.get("intent") in ("bureaucracy", "cliche") or x.get("category") in ("bureaucracy", "cliche"))
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "panic")
            m = find_matrix("bureaucracy", "cliche")
            if m:
                return m, "", "panic"
            return "Зачем вы это спрашиваете?! Людям помощь нужна, отправляйте службы скорее!", "", "panic"

        elif category == "9":  # Прощание / Завершение
            b = find_brick(lambda x: x.get("role") == "RELIEF" or x.get("intent") in ("outro", "relief") or x.get("category") in ("outro", "relief"))
            if b:
                return b.get("text", ""), b.get("audio_id", ""), b.get("emotion", "neutral")
            m = find_matrix("outro", "relief")
            if m:
                return m, "", "neutral"
            return "Хорошо, мы на месте, ждем помощи. До свидания.", "", "neutral"

        return "Алло! Вас плохо слышно!", "", "neutral"

    def process_message(self, message: str = "", session_id: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Processes incoming operator message, classifies intent and returns applicant reply."""
        msg = message or kwargs.get("operator_message", "")
        text_lower = msg.lower().strip()

        # Classify intent using LLM (0-9)
        category = self._classify_intent(msg)
        intent_name = INTENT_KEYS.get(category, "unknown")

        # Repetition check
        is_repeated = (category in self.asked_intents or intent_name in self.asked_intents)
        self.asked_intents.add(category)
        self.asked_intents.add(intent_name)

        base_reply, audio_id, emotion = self._extract_content(category)

        event = "dialogue"
        if category in ("1", "2"):
            self.revealed_address = True
            event = "address_revealed"
            self.last_fact = ("address", base_reply)
        elif category == "3":
            self.revealed_details = True
            event = "details_revealed"
            self.last_fact = ("details", base_reply)
        elif category == "4":
            self.revealed_victims = True
            event = "victims_revealed"
            self.last_fact = ("victims", base_reply)
        elif category in ("5", "6"):
            self.revealed_name = True
            event = "name_revealed"
            self.last_fact = ("name", base_reply)
        elif category == "8":
            event = "cliche_triggered"
            self.cliche_violations += 1

        if is_repeated:
            irritation_text = self._get_irritation_text()
            reply = f"{irritation_text} {base_reply}".strip()
            emotion = "panic"
            self.panic_level = min(100, max(self.panic_level + 15, 75))
            self.state = "раздражение"
            event = "fact_repeated"
            tts_texts = [irritation_text, base_reply]
        else:
            reply = base_reply
            if emotion == "panic":
                self.state = "panic"
            else:
                self.state = "grounded"
            if category == "5":
                tts_texts = [self.caller_name] if self.caller_name else [base_reply]
            elif category == "6":
                tts_texts = [self.caller_phone] if self.caller_phone else [base_reply]
            else:
                tts_texts = [base_reply]

        if not tts_texts:
            tts_texts = [base_reply]

        self.last_reply = reply
        self.dialogue_history.append({"sender": "operator", "text": msg})
        self.dialogue_history.append({
            "sender": "caller",
            "text": reply,
            "state": self.state,
            "panic_level": self.panic_level,
            "emotion": emotion,
            "category": category,
            "intent": intent_name,
        })

        res_dict = {
            "reply": reply,
            "state": self.state,
            "panic_level": self.panic_level,
            "emotion": emotion,
            "category": category,
            "intent": intent_name,
            "event": event,
            "semantic_event": "IRRITATION" if is_repeated else ("CLICHE_RAGE" if event == "cliche_triggered" else "DIALOGUE"),
            "marker": "IRRITATION" if is_repeated else "",
            "audio_id": audio_id,
            "tts_texts": tts_texts,
            "execution_path": "slm",
            "breath_pause_ms": 180 if self.panic_level > 60 else 120,
            "latency_ms": 0.0,
            "revealed": {
                "address": self.revealed_address,
                "victims": self.revealed_victims,
                "details": self.revealed_details,
                "name": self.revealed_name,
            },
        }

        if event == "cliche_triggered":
            res_dict["penalty"] = "Избегайте канцеляризмов! Общайтесь живым человеческим языком."

        return res_dict


class RuntimeRouter(V2ApplicantSession):
    def process_message(self, message: str = "", session_id: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        result = super().process_message(message=message, session_id=session_id, **kwargs)
        if "reply_text" not in result and "reply" in result:
            result["reply_text"] = result["reply"]
        return result

