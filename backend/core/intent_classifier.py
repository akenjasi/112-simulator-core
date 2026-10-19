import asyncio
import sys
import logging
import os
import threading
from backend.schemas.bricks import Intent

logger = logging.getLogger(__name__)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CLASSIFIER_PATH = os.getenv("CLASSIFIER_PATH", os.path.join(PROJECT_ROOT, "models", "classifier"))
classifier = None
_load_lock = threading.Lock()


def get_classifier():
    global classifier
    if classifier is not None:
        return classifier
    with _load_lock:
        if classifier is not None:
            return classifier
        try:
            import torch
            torch.set_num_threads(1)
            if CLASSIFIER_PATH not in sys.path:
                sys.path.insert(0, CLASSIFIER_PATH)
            from inference import IntentClassifier
            classifier = IntentClassifier(model_path=CLASSIFIER_PATH)
            return classifier
        except (ImportError, OSError) as exc:
            raise RuntimeError("Speech classifier requires backend/requirements/speech.txt and local classifier files") from exc


# Mapping from label_id to Intent enum
LABEL_TO_INTENT = {
    0: Intent.greeting,
    1: Intent.address,
    2: Intent.address_details,
    3: Intent.situation,
    4: Intent.victims,
    5: Intent.caller_id,
    6: Intent.phone,
    7: Intent.repeat,
    8: Intent.bureaucracy,
    9: Intent.outro
}

async def classify_intent(operator_text: str) -> Intent:
    if not operator_text.strip():
        return Intent.situation
        
    try:
        result = await asyncio.to_thread(get_classifier().predict, operator_text)
        label_id = result.get("label_id", 3)
        confidence = result.get("confidence", 0.0)
        
        if confidence < 0.35:
            logger.warning(f"Low confidence ({confidence}) for text: '{operator_text}'. Fallback to bureaucracy (8).")
            label_id = 8
            
        return LABEL_TO_INTENT.get(label_id, Intent.situation)
    except Exception as e:
        logger.error(f"Error during classification: {e}")
        raise RuntimeError("Intent classifier is unavailable") from e

def classify_intent_sync(operator_text: str) -> str:
    if not operator_text.strip():
        return "3"
        
    try:
        result = get_classifier().predict(operator_text)
        label_id = result.get("label_id", 3)
        confidence = result.get("confidence", 0.0)
        
        if confidence < 0.35:
            logger.warning(f"Low confidence ({confidence}) for text: '{operator_text}'. Fallback to bureaucracy (8).")
            label_id = 8
            
        return str(label_id)
    except Exception as e:
        logger.error(f"Error during classification: {e}")
        raise RuntimeError("Intent classifier is unavailable") from e
