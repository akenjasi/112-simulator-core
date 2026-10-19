# Приёмочный протокол объединения аудита с main — 19.10.2026

По запросу владельца подготовлено объединение `codex/technical-audit-remediation` с актуальным `main`. Это отдельный этап после первоначального аудита: результаты 446/419 в IMPLEMENTATION.md относятся к его прежнему снимку; результаты объединённого дерева приведены здесь.

## История и сохранность

- Исходный main/origin/main: **`3f8f543`**. Между ним и основанием аудита 29 новых main-коммитов: оценивание и разбор работ, темы, профиль/самотренировка, очередь и офлайн-поставка.
- Исходная пользовательская работа и аудит сохранены в **`d51076c`**, исправления аудита с заключительными артефактами — в **`ce9dcf4`**. Прежняя блокировка финального коммита по usage limit устранена: коммит создан до начала слияния.
- Резервный указатель **`codex/main-before-audit-merge-20261019`** сохраняет исходный main. Reset, force push, squash чужой истории и удаление веток не применяются.
- Конфликты разрешены в ветке аудита с включением актуального origin/main, затем целевой main принимает проверенный результат обычным `--no-ff` merge. Первым родителем итогового main merge остаётся прежний main. Фактические SHA результата проверяются через `git log main --first-parent` и `git rev-parse main`.
- Main уже открыт в отдельном checkout `/home/orborus/Desktop/hakaton/112-student-profile-home`; он проверен на отсутствие локальных изменений. Локальные TLS-файлы и generated out предварительно сохранены, чтобы исключение их из tracking не уничтожило локальную установочную копию. Рабочая БД, `.env`, модели и запущенные сервисы не изменяются.

## Решения конфликтов

Разрешён **41 конфликт исходников** и исключены из tracking конфликтующие generated `frontend_react/out` файлы. Blanket-выбор ours/theirs не применялся ко всему дереву.

| Область | Совместное поведение |
|---|---|
| Профиль и разбор работ | Сохранены компоненты/маршруты актуального main: student workspace, отдельная самотренировка, current lesson, student review/next training и исправленные Next route wrappers |
| Темы и корневой layout | Сохранены ThemeProvider, ранняя инициализация темы и viewport; отключённая аудитом внешняя analytics dependency не возвращена |
| DDS | Телефонное упражнение, протокол критериев и retry из аудита совмещены с gradebook snapshots, exam timeout и разбором завершённых карточек из main. Критерии доступны в перенесённом teacher screen |
| Аналитика и оценки | Основная реализация main сохранена; коллекции ограничены общим scope из аудита. Явные foreign object routes проверяют права до скрывающих ORM criteria, сохраняя контракт 403. Nullable grades и teacher override не заменяются условными 100% |
| Группы и курсанты | Сохранены existing-user linking, bulk-link и CSV без смены существующего пароля. Ролевые и ownership checks применены также к новым путям. Созданного ADMIN незакреплённого курсанта можно привязать, чужого управляемого курсанта нельзя захватить через привязку |
| Пароли | Более строгий текущий контракт main сохранён: преподавателю запрещён сброс паролей, включая PATCH с password; административный reset остаётся доступен ADMIN. Аудитные проверки скорректированы под эту политику |
| Экспорт | Сохранены Excel/CSV format и явные caller-supplied строки с реальной/nullable общей оценкой. Отсутствующая разбивка остаётся пустой; сервер не подставляет идеальные метрики. Поиск сохранённых сессий, ownership, limits, TTL и literal spreadsheet cells из аудита сохранены |
| ASR/TTS | ASR_ENABLED=false совмещён с auth/session ownership. Отказ disabled WS не принимает запись. Отключённый в main синтез речи сохранён как default; включение TTS_ENABLED требует явной конфигурации локальных моделей, отказ не выдаётся за успешное аудио |
| Поставка | Сохранены package_offline.sh, deploy_offline.sh, CPU report runtime и закреплённая проверка GGUF. Совмещены с безопасным базовым image/lock, secrets, non-root и резервированием. В трёх PG check-скриптах ожидание pg_isready заменено реальным SQL по TCP после воспроизведённой гонки init-server |
| Тесты и CI | Объединены минимальные manifests, frontend охватывает все 76 текущих файлов; backend расширен стабильными проверками grading/groups/import/ownership. Исправлены устаревшие UI fixtures и привязка проверки audit log к собственному record_id. Независимые tools_tests/test_*.py, acceptance manifests и freeze baseline не менялись |

## Реальная проверка объединённого дерева

| Проверка | Результат |
|---|---|
| Обязательный backend-core | **633 passed**. После последнего согласования PATCH policy выполнен повторный backend-core — также 633 passed |
| Frontend | **76 files / 555 passed**, TypeScript и static export прошли; clean/after-export typechecks exit0 |
| Полный backend-all | **794 passed / 55 failed**, collection errors нет. [Все отказы](merge-verification/full-failures.txt), [исходный вывод](merge-verification/backend-all.log). Полная приёмка не объявляется зелёной |
| Независимые tools_tests | **196 passed / 1 failed**. Единственный отказ — старый frontend freeze guard; тот же отказ воспроизведён на чистом исходном main. [Объединённый вывод](merge-verification/independent.log), [исходный main](merge-verification/main-baseline-scope.log) |
| Четыре worker2 проверки | На исходном main отдельно воспроизведены те же четыре ошибки legacy snapshot/timer/error_limit. Это подтверждает их исходный статус; остальные 51 отказ полной диагностики автоматически исходными не объявляются |
| PostgreSQL15 | **27 queue + 16 phone** acceptance cases; schema defaults/repeat/row preservation прошли; реальный dump/restore проверил 3 строки, сумму234 и Unicode имена |
| Поставка | Оба Docker image собраны; startup/login/protected API + Nginx HTTP/TLS/API proxy прошли; offline packaging/deployment unit tests **27 passed** |
| Дополнительно | npm audit — **0** advisories; Ruff F821/F823 и shell syntax проверены; конфликтных маркеров и unmerged paths нет; исходные generated outputs не вернулись в index |

Полные артефакты и контрольные суммы: [merge-verification](merge-verification/README.md).

## Ограничения и статус CI

- Старый `tools_tests/test_dds_frontend_scope.py` требует неизменности frontend за рамками исторической задачи лобби. Он уже не соответствует последующим изменениям main, а текущий аудит явно охватывает весь код. Тест/эталон не переписаны ради зелёного результата. **Команда независимой приёмки, а значит и соответствующий CI step, остаётся красной из-за этого guard.** Удалённый GitHub run этим локальным результатом не подменяется.
- Полный backend-all остаётся красным. Новый mandatory gate не скрывает эти отказы skip/xfail; они доступны в полном диагностическом запуске и сохранённом реестре.
- Не выполнялись live deploy, ротация рабочей TLS-пары, изменение рабочих БД, живой ML/PBX/LDAP, нагрузочная приёмка или перенос полного offline bundle на отдельный хост. Слияние кода не означает эксплуатационной готовности этих внешних возможностей.
- Снимки REPORT.md / IMPLEMENTATION.md / LEGACY_TESTS.md и их прежние логи сохранены как история аудита; текущие результаты после объединения — только в этом протоколе и merge-verification.
