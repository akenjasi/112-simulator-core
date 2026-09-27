import sys
import logging
import os

# Оптимизация для CPU сервера (избегаем thread contention)
os.environ["OMP_NUM_THREADS"] = "1"

# torch опционален: в Docker-окружении без ML-зависимостей классификатор
# работает в fallback-режиме (возвращает дефолтный intent без ML).
try:
    import torch
    torch.set_num_threads(1)
    _TORCH_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore[assignment]
    _TORCH_AVAILABLE = False

from typing import Dict, Any
from backend.schemas.bricks import Intent

logger = logging.getLogger(__name__)

# Resolve path to the classifier model (project-relative first, fallback to external)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_CLASSIFIER_PATH = os.path.join(PROJECT_ROOT, "models", "classifier")
FALLBACK_CLASSIFIER_PATH = "/home/orborus/Desktop/A_vibecoding/models/classifier"

if os.path.exists(PROJECT_CLASSIFIER_PATH):
    CLASSIFIER_PATH = PROJECT_CLASSIFIER_PATH
elif os.path.exists(FALLBACK_CLASSIFIER_PATH):
    CLASSIFIER_PATH = FALLBACK_CLASSIFIER_PATH
else:
    CLASSIFIER_PATH = os.getenv("CLASSIFIER_PATH", PROJECT_CLASSIFIER_PATH)

if CLASSIFIER_PATH not in sys.path:
    sys.path.insert(0, CLASSIFIER_PATH)

try:
    from inference import IntentClassifier
    # Singleton initialization
    try:
        classifier = IntentClassifier(model_path=CLASSIFIER_PATH)
        logger.info("Local Rubert-Tiny2 IntentClassifier loaded successfully.")
    except Exception as e:
        logger.warning(f"Failed to load IntentClassifier: {e}. Using rule-based fallback.")
        classifier = None
except ImportError:
    logger.warning(
        "IntentClassifier module not found (models/classifier/ missing). "
        "Using rule-based fallback — classify_intent will return default intent."
    )
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
    """
    Асинхронная обертка для синхронного классификатора Rubert-Tiny2.
    """
    if not classifier or not operator_text.strip():
        return Intent.situation
        
    try:
        result = classifier.predict(operator_text)
        label_id = result.get("label_id", 3)
        confidence = result.get("confidence", 0.0)
        
        # Fallback логика при низкой уверенности модели
        if confidence < 0.35:
            logger.warning(f"Low confidence ({confidence}) for text: '{operator_text}'. Fallback to bureaucracy (8).")
            label_id = 8
            
        return LABEL_TO_INTENT.get(label_id, Intent.situation)
    except Exception as e:
        logger.error(f"Error during classification: {e}")
        return Intent.situation

def classify_intent_sync(operator_text: str) -> str:
    """
    Синхронная функция классификации.
    Возвращает строку-категорию (от "0" до "9"), как ожидает RuntimeRouter.
    """
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
