import sys
import logging
import os
import torch

# Оптимизация для CPU сервера (избегаем thread contention)
os.environ["OMP_NUM_THREADS"] = "1"
torch.set_num_threads(1)

from typing import Dict, Any
from backend.schemas.bricks import Intent

logger = logging.getLogger(__name__)

# Resolve path to the classifier model (project-relative)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_CLASSIFIER_PATH = os.path.join(PROJECT_ROOT, "models", "classifier")

CLASSIFIER_PATH = os.getenv("CLASSIFIER_PATH", PROJECT_CLASSIFIER_PATH)

if CLASSIFIER_PATH not in sys.path:
    sys.path.insert(0, CLASSIFIER_PATH)

from inference import IntentClassifier

# Singleton initialization
try:
    classifier = IntentClassifier(model_path=CLASSIFIER_PATH)
    logger.info("Local Rubert-Tiny2 IntentClassifier loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load IntentClassifier: {e}")
    classifier = None

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
    if not classifier or not operator_text.strip():
        return Intent.situation
        
    try:
        result = classifier.predict(operator_text)
        label_id = result.get("label_id", 3)
        confidence = result.get("confidence", 0.0)
        
        if confidence < 0.35:
            logger.warning(f"Low confidence ({confidence}) for text: '{operator_text}'. Fallback to bureaucracy (8).")
            label_id = 8
            
        return LABEL_TO_INTENT.get(label_id, Intent.situation)
    except Exception as e:
        logger.error(f"Error during classification: {e}")
        return Intent.situation

def classify_intent_sync(operator_text: str) -> str:
    if not classifier or not operator_text.strip():
        return "3"
        
    try:
        result = classifier.predict(operator_text)
        label_id = result.get("label_id", 3)
        confidence = result.get("confidence", 0.0)
        
        if confidence < 0.35:
            logger.warning(f"Low confidence ({confidence}) for text: '{operator_text}'. Fallback to bureaucracy (8).")
            label_id = 8
            
        return str(label_id)
    except Exception as e:
        logger.error(f"Error during classification: {e}")
        return "3"
