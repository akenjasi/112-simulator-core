# Проверка объединения с main

Исходный main: `3f8f543`; исправления аудита: `ce9dcf4`, baseline: `d51076c`. Этот каталог фиксирует проверки объединённого кода, отдельно от доаудитных и послеаудитных снимков.

- Обязательный `verify_build.sh all`: backend 633 passed; frontend 76 files / 555 passed; typecheck и static export прошли. После согласования запрета teacher PATCH password backend-core повторён — 633 passed (`backend-summary.json`).
- Полный `verify_build.sh backend-all`: **794 passed / 55 failed**, exit1. Точные отказы — `full-failures.txt`; это не зелёная полная приёмка.
- Независимый набор: **196 passed / 1 failed**. Единственный отказ — `test_dds_frontend_scope.py`: прежняя заморозка frontend только под задачу лобби. `main-baseline-scope.log` воспроизводит тот же отказ на исходном `origin/main`; сам тест и его baseline JSON не редактировались.
- `main-baseline-worker2.log`: четыре проверки старого DDS state/таймера падают уже на исходном main. Остальные 51 отказ полной диагностики этим сравнением автоматически не объявлены исходными.
- PostgreSQL15: 27 queue + 16 phone acceptance cases; schema defaults/repeat/row preservation и dump/restore с Unicode строками прошли. Проверочные скрипты ждут SELECT 1 по TCP до первого соединения приложения, устраняя гонку init-server.
- Два Docker image build; отдельный HTTP/TLS/login/API-proxy smoke; offline packaging/deployment unit contracts: 27 passed. Это не перенос полного bundle на реальный offline host и не приёмка ML/PBX.
- Clean и after-export typechecks прошли; npm audit: 0 advisories. Python manifests/hash lock сохранены из проверенного аудита.

Оригинальные tool outputs сохранены с исходными пробелами. SHA256SUMS.json проверяет файлы каталога, кроме себя. Команды, решения конфликтов и остаточные ограничения описаны в соседнем MERGE.md.
