# ТЗ: Двухфакторная аутентификация (MFA/TOTP)
**Роль:** Fullstack Developer

## Контекст
Администраторы и преподаватели должны иметь возможность (опционально) включить 2FA через Google Authenticator (TOTP 6-digit). Для "демо-режима" эта функция должна быть выключена по умолчанию.

## Задачи:
1. **Backend (`backend/api/router_auth.py`, `backend/models/domain_01.py`):**
   - Установить `pyotp` (добавить в `requirements.txt`).
   - Добавить в `User` колонки: `totp_secret` (строка, nullable) и `is_2fa_enabled` (boolean, default=False).
   - Создать эндпоинты `/api/auth/2fa/setup` (генерация секрета и otpauth URI) и `/api/auth/2fa/verify-setup` (проверка кода и включение).
   - Модифицировать `/api/auth/login`: если у юзера `is_2fa_enabled == True`, возвращать не токен, а `{ "requires_2fa": true, "user_id": "..." }`.
   - Создать `/api/auth/login/2fa` для ввода 6-значного кода и получения итогового JWT.
2. **Frontend (`frontend_react/app/login/page.tsx`, `frontend_react/app/admin/profile`):**
   - Обновить форму логина: если бэкенд просит 2FA, показывать инпут для 6-значного кода.
   - Сделать страницу/модалку в профиле Админа/Преподавателя для генерации QR-кода (можно использовать библиотеку `qrcode.react`) и включения 2FA.
3. Пройти тесты в `tests/test_74_2fa.py`.

## Ограничения
- Не сломать логин для курсантов (у них 2FA не используется).
- Сохранить обратную совместимость для старых учеток без 2FA.
