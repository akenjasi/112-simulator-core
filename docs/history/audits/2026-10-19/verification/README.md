# Итоговые проверочные артефакты

Команды исполнялись локально на Linux с чистым CPython 3.11 venv и Node 22.22.0/npm 10.9.4. Базовый Python runtime установлен из полного hash lock; тестовые зависимости — отдельно. Реальные данные установки не записывались. В логи тестов могут попадать только синтетические учётные записи/пароли.

- `gate-summary.json`: `bash scripts/verify_build.sh all`, четыре стадии passed; 446 backend core, 419 frontend assertions, tsc, static export 25 routes.
- `backend-all-summary.json` / `backend-all.log`: полный diagnostic — exit 1, 597 passed / 56 failed. [Поимённый реестр](../LEGACY_TESTS.md).
- `independent.log`: независимая приёмка 196 passed; сами independent tests и acceptance manifests не менялись.
- `postgres-{queue,phone,schema,restore}.log`: реальные PostgreSQL 15 в собственных одноразовых контейнерах; 27 queue + 16 phone cases, legacy schema/repeat/row preservation, dump/restore Unicode rows.
- `docker-{backend,frontend}.log`: фактические image builds; новый frontend строится в image из package-lock, готовый out исключён из context.
- `deployment-smoke.log`, `deployment_smoke.py`: фактический startup/login/role protection и четыре UI маршрута через Nginx HTTP/TLS/API proxy. Скрипт сохранён в том виде, в каком исполнялся, с путями проверяющей среды и приватным временным каталогом. TLS-тест использовал явный test-only bypass доверия локальному self-signed сертификату, не подтверждает публичную trust chain.
- `typecheck-clean.log`, `typecheck-after-export.log`: tsc --noEmit --incremental false с временно убранным `.next` и после возврата export output, оба exit 0.
- `pip-audit-runtime-lock.json`: полный базовый граф 59 packages, 0 найденных advisories. Optional ML, native binaries, model files и OS image в этот результат не входят.
- `npm-audit.json`: полный npm graph, 0 известных advisories; это не доказательство отсутствия неизвестных уязвимостей.
- `compose.log`: config --quiet dev/prod/LLM profile; вывод env со значениями секретов не сохранялся. После настройки SELinux bind и удаления жёсткой subnet dev/prod config --quiet повторены успешно.
- `pip-check.log`, `ruff.log`: согласованность установленного graph и отсутствие F821/F823. `bash -n` затронутых shell scripts и `git diff --check` кода прошли. `.gitattributes` сохраняет исходные пробелы/CR диагностических логов.

`SHA256SUMS.json` содержит контрольные суммы остальных файлов каталога. Это проверка целостности сохранённого свидетельства, не электронная подпись. Исходные логи до исправлений находятся отдельно в `../evidence`; они не перезаписывались. Удалённый GitHub CI не запускался и не выдаётся за пройденный.
