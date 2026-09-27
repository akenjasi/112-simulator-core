# ТЗ: Панель Администратора (Frontend)
**Роль:** Frontend Developer (Next.js)

## Контекст
Backend уже имеет API для управления пользователями (`/api/admin/users`), проверки здоровья сервера (`/api/admin/healthcheck`) и создания бекапов (`/api/admin/backup`).
Однако на Frontend **отсутствуют страницы интерфейса** для роли `ADMIN`.

## Задачи:
1. Создать Layout для админа: `frontend_react/app/admin/layout.tsx`. Убедиться, что он защищен от не-админов.
2. Создать страницу дашборда: `frontend_react/app/admin/page.tsx`. Вывести общую статистику системы, CPU/RAM (через healthcheck API).
3. Создать страницу пользователей: `frontend_react/app/admin/users/page.tsx`. 
   - Таблица со списком всех пользователей.
   - Кнопки для изменения роли (ADMIN, TEACHER, CADET) и блокировки/разблокировки аккаунта.
4. Создать страницу системы: `frontend_react/app/admin/system/page.tsx`.
   - Кнопка "Создать Backup базы данных".
5. Убедиться, что в главном меню для роли `ADMIN` появляются ссылки на эти страницы.
6. Проверить базовые UI-тесты в `frontend_react/tests/admin_panel.test.tsx` (используя vitest, если установлен).

## Ограничения
- Использовать существующие компоненты `shadcn/ui` и `Tailwind`.
- Использовать `fetch` или `axios` клиент с передачей JWT-токена.
