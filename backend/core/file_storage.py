import os
import uuid
import re

def generate_safe_filename(original_name: str) -> str:
    """
    Очищает имя файла и добавляет уникальный суффикс (UUID) перед расширением.
    Транслитерирует или удаляет кириллицу (для MVP просто удаляем не-ASCII или делаем безопасным).
    """
    # Разбиваем на имя и расширение
    name, ext = os.path.splitext(original_name)
    
    # Оставляем только буквы, цифры и базовые символы, заменяем пробелы
    # Для MVP просто заменим пробелы и удалим совсем плохие символы
    safe_name = re.sub(r'[^a-zA-Z0-9а-яА-Я._-]', '_', name)
    safe_name = safe_name.replace(' ', '_')
    
    # Добавляем уникальный идентификатор
    unique_suffix = str(uuid.uuid4())[:8]
    
    # Собираем обратно
    return f"{safe_name}_{unique_suffix}{ext.lower()}"

def get_relative_path(safe_name: str) -> str:
    """Возвращает относительный путь до файла в папке uploads."""
    return os.path.join("uploads", safe_name)
