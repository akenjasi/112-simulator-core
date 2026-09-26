import re
from num2words import num2words

def num2words_ru(num_str: str) -> str:
    try:
        return num2words(int(num_str), lang='ru')
    except Exception:
        return num_str

def format_phone_for_tts(phone: str) -> str:
    """Нормализация телефона для TTS."""
    if not phone:
        return ""
    has_plus = phone.strip().startswith("+")
    digits = re.sub(r'\D', '', phone)
    if not digits:
        return phone
        
    if len(digits) == 11:
        parts = [digits[0:1], digits[1:4], digits[4:7], digits[7:9], digits[9:11]]
    elif len(digits) == 10:
        parts = [digits[0:3], digits[3:6], digits[6:8], digits[8:10]]
    else:
        parts = [digits]

    def part_to_words(p):
        if not p: return ""
        if p == '0':
            return 'ноль'
        elif p.startswith('0'):
            zeros = "ноль " * (len(p) - len(p.lstrip('0')))
            rest = p.lstrip('0')
            if rest:
                return (zeros + num2words_ru(rest)).strip()
            else:
                return zeros.strip()
        else:
            return num2words_ru(p)

    word_parts = []
    if len(digits) == 11 and has_plus:
        word_parts.append("плюс " + part_to_words(parts[0]))
        parts = parts[1:]
    elif len(digits) == 11:
        word_parts.append(part_to_words(parts[0]))
        parts = parts[1:]

    for p in parts:
        word_parts.append(part_to_words(p))

    return ", ".join(word_parts)

def expand_address_for_tts(text: str) -> str:
    """Нормализация адреса для TTS."""
    if not text:
        return ""
        
    abbreviations = {
        r'\bш\.\s*': 'шоссе ',
        r'\bул\.\s*': 'улица ',
        r'\bпер\.\s*': 'переулок ',
        r'\bд\.\s*': 'дом ',
        r'\bкорп\.\s*': 'корпус ',
        r'\bк\.\s*': 'корпус ',
        r'\bпод\.\s*': 'подъезд ',
        r'\bэт\.\s*': 'этаж ',
        r'\bкв\.\s*': 'квартира ',
        r'\bпр-кт\.\s*': 'проспект ',
        r'\bпр-кт\s+': 'проспект ',
    }
    
    for pattern, replacement in abbreviations.items():
        text = re.sub(pattern, replacement, text)

    text = re.sub(r'(\d+)/(\d+)', r'\1 дробь \2', text)
    
    def replace_num(match):
        return num2words_ru(match.group(0))
        
    text = re.sub(r'\d+', replace_num, text)
    
    text = re.sub(r'\s+', ' ', text).strip()
    return text

expand_address = expand_address_for_tts
