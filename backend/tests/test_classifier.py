import pytest
from unittest.mock import Mock
from backend.schemas.bricks import Intent
from backend.core.intent_classifier import classify_intent
import backend.core.intent_classifier as classifier

@pytest.mark.asyncio
@pytest.mark.parametrize('text,label,expected', [
    ('какой у вас адрес?', 1, Intent.address),
    ('есть ли пострадавшие?', 4, Intent.victims),
    ('что у вас случилось?', 3, Intent.situation),
])
async def test_classify_intent_mock(monkeypatch, text, label, expected):
    model = Mock()
    model.predict.return_value = {'label_id': label, 'confidence': 0.99}
    monkeypatch.setattr(classifier, 'get_classifier', lambda: model)
    assert await classify_intent(text) == expected
    model.predict.assert_called_once_with(text)

@pytest.mark.asyncio
async def test_classifier_unavailable_is_explicit(monkeypatch):
    def unavailable():
        raise RuntimeError('model missing')
    monkeypatch.setattr(classifier, 'get_classifier', unavailable)
    with pytest.raises(RuntimeError, match='Intent classifier is unavailable'):
        await classify_intent('адрес?')
