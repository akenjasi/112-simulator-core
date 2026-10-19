# Повторная проверка после обновления origin/main

Основание: проверенный merge `215ab44`; добавлены upstream `ae81306` и `cd0ed37` обычным merge.

- `IMBA_VERIFY_REPORT_DIR=/tmp/112-main-merge-20261019/upstream-frontend bash scripts/verify_build.sh frontend`: **76 files / 555 tests passed**, typecheck и static export exit0. Итог: `summary.json`.
- `/tmp/112-audit-20261019/clean311/bin/python -m pytest tools_tests/ -q --tb=short`: **196 passed / 1 failed**, exit1. Отказ — исторический frontend scope guard; обновлённый upstream allowlist всё ещё запрещает широкие аудитные изменения DDS/phone/protocol/auth/dependencies. Он сохранён без дальнейшей правки. Детали: `independent.log`.
- `git diff --quiet 215ab44 -- backend tests scripts .github Dockerfile.backend Dockerfile.frontend docker-compose.yml docker-compose.prod.yml requirements.txt requirements.lock`: exit0. Эти области не изменились; результаты предыдущего протокола не являются повторным запуском на новом снимке.
- `git diff --check`: exit0. Единственный исходный конфликт в тесте checkbox разрешён эквивалентным upstream-вариантом; frontend suite после разрешения прошёл.

Удалённый GitHub Actions run не проверен; полный backend diagnostic из предыдущего протокола остаётся с описанными ограничениями. Live deploy не выполнялся. SHA256SUMS.json содержит SHA-256 сохранённых логов и этого README.
