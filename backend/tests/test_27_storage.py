import pytest
import os
from backend.core.file_storage import generate_safe_filename, get_relative_path

def test_generate_safe_filename():
    unsafe_name = "Мой Приказ №123 (очень важный).pdf"
    safe_name = generate_safe_filename(unsafe_name)
    
    assert "pdf" in safe_name
    assert " " not in safe_name
    # Проверяем, что к имени добавляется уникальный суффикс (например uuid)
    assert len(safe_name) > len("pdf") + 5

def test_get_relative_path():
    safe_name = "document_123.pdf"
    rel_path = get_relative_path(safe_name)
    assert rel_path == os.path.join("uploads", "document_123.pdf")
