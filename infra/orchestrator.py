#!/usr/bin/env python3
"""
A_vibecoding Deterministic Worker Orchestrator
Automates the lifecycle of containerized coding workers in isolated Git environments.
"""

import argparse
import datetime
import json
import os
import pathlib
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

# Базовые пути
SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
PROJECTS_DIR = ROOT_DIR
WORKTREES_DIR = ROOT_DIR / "worktrees"
MODELS_DIR = pathlib.Path("/home/orborus/ars/A_vibecoding/models")
REPORTS_DIR = ROOT_DIR / "reports" / "runs"
DOCKER_IMAGE = "coding-worker:latest"
AUTH_VOLUME = "worker_home"


class TaskOrchestrator:
    def __init__(self, task_name: str, test_cmd: str, prompt: str, timeout_sec: int = 300, keep_worktree: bool = False):
        self.task_name = task_name
        self.test_cmd = test_cmd
        self.prompt = prompt
        self.timeout_sec = timeout_sec
        self.keep_worktree = keep_worktree

        # Генерируем уникальный run_id
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        self.run_id = f"{timestamp}_{task_name}"
        self.worktree_path = WORKTREES_DIR / f"run_{self.run_id}"
        self.report_dir = REPORTS_DIR / self.run_id
        self.container_name = f"worker_{self.run_id}"
        self.cleaned_up = False

        # Регистрируем обработчик сигналов (Ctrl+C, SIGTERM)
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        print("\n\n[!] Перехвачен сигнал прерывания. Экстренная очистка...")
        self.cleanup(failed=True)
        sys.exit(130)

    def log(self, phase: str, message: str):
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [{phase}] {message}")

    def run(self) -> int:
        self.report_dir.mkdir(parents=True, exist_ok=True)
        self.log("INIT", f"Старт задачи: {self.task_name} (Run ID: {self.run_id})")

        start_time = time.time()
        result = {
            "run_id": self.run_id,
            "task_name": self.task_name,
            "test_cmd": self.test_cmd,
            "prompt": self.prompt,
            "status": "FAILED",
            "exit_code": 1,
            "duration_sec": 0,
            "phases": {}
        }

        try:
            # 1. Клонирование локального worktree
            self._phase_prepare_workspace()
            result["phases"]["prepare"] = "SUCCESS"

            # 2. Запуск воркера в Docker
            worker_code = self._phase_run_worker()
            result["phases"]["worker"] = "SUCCESS" if worker_code == 0 else "FAILED"

            # 3. Валидация (запуск тестов)
            test_code = self._phase_run_validation()
            result["phases"]["validation"] = "SUCCESS" if test_code == 0 else "FAILED"

            # 4. Сбор артефактов (дифф, статус, логи)
            has_diff = self._phase_collect_artifacts()

            duration = round(time.time() - start_time, 2)
            result["duration_sec"] = duration

            if test_code == 0 and has_diff:
                result["status"] = "SUCCEEDED"
                result["exit_code"] = 0
                self.log("FINISH", f"✅ Задача успешно выполнена за {duration}с!")
                self._print_diff_summary()
                # 5. Автоматический мёрж в основную ветку
                merge_ok = self._phase_auto_merge()
                result["merged"] = merge_ok
                if merge_ok:
                    self.log("MERGE", "✅ Изменения автоматически применены в main.")
                else:
                    self.log("MERGE", "⚠️ Автомёрж не удался — примени patch вручную: reports/runs/.../patch.diff")
            elif test_code == 0 and not has_diff:
                result["status"] = "NO_CHANGES"
                result["exit_code"] = 0
                self.log("FINISH", "⚠️ Тесты зеленые, но воркер не внес никаких изменений в код.")
            else:
                result["status"] = "TESTS_FAILED"
                result["exit_code"] = test_code
                self.log("FINISH", f"❌ Тесты упали (Код: {test_code}). Подробности в отчете: {self.report_dir}")

            # Сохраняем итоговый JSON-манифест задачи
            with open(self.report_dir / "result.json", "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)

            return result["exit_code"]

        except Exception as e:
            self.log("ERROR", f"Критическая ошибка оркестратора: {e}")
            result["error"] = str(e)
            return 1
        finally:
            self.cleanup(failed=(result["status"] != "SUCCEEDED"))

    def _phase_prepare_workspace(self):
        self.log("PREPARE", f"Создание изолированной песочницы: {self.worktree_path}")
        WORKTREES_DIR.mkdir(parents=True, exist_ok=True)
        if self.worktree_path.exists():
            shutil.rmtree(self.worktree_path)

        cmd = [
            "git", "clone", "--local", "-b", "main",
            str(PROJECTS_DIR), str(self.worktree_path)
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "-C", str(self.worktree_path), "checkout", "-b", f"task_{self.run_id}"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # CRITICAL: overwrite AGENTS.md with Worker-specific instructions.
        # The Architect's AGENTS.md must never reach the Worker container.
        worker_agents_md = self.worktree_path / "AGENTS.md"
        worker_agents_md.write_text(
            f"""# WORKER AGENT — SYSTEM INSTRUCTIONS

## ROLE
You are a **coding worker**. You implement ONE specific task and nothing else.
You are NOT an Architect. You do NOT write tests. You do NOT plan or decompose.

## YOUR TASK
{self.prompt}

## ABSOLUTE PROHIBITIONS
- DO NOT modify any file inside `tests/`
- DO NOT modify `backend/app.py`
- DO NOT modify anything in `frontend/` or `frontend_react/`
- DO NOT write new tests
- DO NOT refactor unrelated code
- DO NOT add new dependencies unless explicitly required by the task

## SUCCESS CRITERION
Command `{self.test_cmd}` must return exit code 0.
Make only the minimum changes required to pass the test. Nothing more.

## IF YOU ARE STUCK
If you cannot implement the task without modifying forbidden files, STOP.
Write a file `WORKER_BLOCKED.md` in /workspace explaining why, then exit.
""",
            encoding="utf-8"
        )
        self.log("PREPARE", "✅ Worker AGENTS.md injected (Architect prompt replaced)")

    def _phase_run_worker(self) -> int:
        self.log("WORKER", "Запуск CLI-воркера в контейнере...")
        host_uid = os.getuid()
        host_gid = os.getgid()

        # Сохраняем инструкцию в файл задачи внутри песочницы, чтобы не ломать кавычки в bash
        prompt_task_file = self.worktree_path / ".worker_task.txt"
        prompt_task_file.write_text(self.prompt, encoding="utf-8")

        worker_cmd = 'export HOME=/home/worker && export PATH=$PATH:/home/worker/.local/bin && agy -p "$(cat /workspace/.worker_task.txt)" --dangerously-skip-permissions'

        docker_cmd = [
            "docker", "run", "--rm", "--network", "host",
            "--name", self.container_name,
            "--env", f"HOST_UID={host_uid}",
            "--env", f"HOST_GID={host_gid}",
            "--env", "HOME=/home/worker",
            "-v", f"{AUTH_VOLUME}:/home/worker:z",
            "-v", f"{self.worktree_path}:/workspace:z",
            "-v", f"{MODELS_DIR}:/workspace/models:ro",
            DOCKER_IMAGE,
            "bash", "-c", worker_cmd
        ]

        with open(self.report_dir / "worker.stdout.log", "w") as out, \
             open(self.report_dir / "worker.stderr.log", "w") as err:
            proc = subprocess.run(docker_cmd, stdout=out, stderr=err, timeout=self.timeout_sec)
            return proc.returncode

    def _phase_run_validation(self) -> int:
        self.log("VALIDATE", f"Запуск проверочной команды: {self.test_cmd}")
        host_uid = os.getuid()
        host_gid = os.getgid()

        validate_cmd = f"export PATH=$PATH:/usr/local/bin && {self.test_cmd}"

        docker_cmd = [
            "docker", "run", "--rm", "--network", "host",
            "--env", f"HOST_UID={host_uid}",
            "--env", f"HOST_GID={host_gid}",
            "-v", f"{self.worktree_path}:/workspace:z",
            "-v", f"{MODELS_DIR}:/workspace/models:ro",
            DOCKER_IMAGE,
            "bash", "-c", validate_cmd
        ]

        with open(self.report_dir / "validation.stdout.log", "w") as out, \
             open(self.report_dir / "validation.stderr.log", "w") as err:
            proc = subprocess.run(docker_cmd, stdout=out, stderr=err, timeout=120)
            return proc.returncode

    def _phase_collect_artifacts(self) -> bool:
        self.log("COLLECT", "Сбор артефактов и diff...")

        # Добавляем все изменения (включая untracked) в индекс, чтобы git diff их увидел
        subprocess.run(["git", "-C", str(self.worktree_path), "add", "-A"], check=False)

        # АВТОМАТИЧЕСКАЯ ЗАЩИТА: ПРОВЕРКА НА ИЗМЕНЕНИЕ ТЕСТОВ
        test_changes = subprocess.run(
            ["git", "-C", str(self.worktree_path), "diff", "--cached", "--name-only", "--", "tests/"],
            capture_output=True, text=True
        )
        if test_changes.stdout.strip():
            self.log("ERROR", "❌ КРИТИЧЕСКОЕ НАРУШЕНИЕ: Воркер попытался изменить файлы в папке tests/!")
            self.log("ERROR", "Измененные файлы:\n" + test_changes.stdout.strip())
            raise Exception("Воркер нарушил запрет и изменил тесты. Задача признана проваленной.")

        diff_res = subprocess.run(
            ["git", "-C", str(self.worktree_path), "diff", "--cached", "--", ":!AGENTS.md"],
            capture_output=True, text=True
        )
        with open(self.report_dir / "patch.diff", "w", encoding="utf-8") as f:
            f.write(diff_res.stdout)

        stat_res = subprocess.run(
            ["git", "-C", str(self.worktree_path), "status", "--short"],
            capture_output=True, text=True
        )
        with open(self.report_dir / "git_status.txt", "w", encoding="utf-8") as f:
            f.write(stat_res.stdout)

        return bool(diff_res.stdout.strip() or stat_res.stdout.strip())

    def _print_diff_summary(self):
        diff_file = self.report_dir / "patch.diff"
        if diff_file.exists() and diff_file.stat().st_size > 0:
            print("\n" + "="*50)
            print("ПОЛУЧЕННЫЙ DIFF:")
            print("="*50)
            with open(diff_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                for line in lines[:30]:  # Первые 30 строк
                    print(line, end="")
                if len(lines) > 30:
                    print(f"\n... (всего {len(lines)} строк, полный diff в {diff_file})")
            print("="*50 + "\n")

    def _phase_auto_merge(self) -> bool:
        """Применяет patch.diff к основной кодовой базе (PROJECTS_DIR/main) и делает коммит."""
        patch_file = self.report_dir / "patch.diff"
        if not patch_file.exists() or patch_file.stat().st_size == 0:
            self.log("MERGE", "patch.diff пуст — нечего применять")
            return False

        try:
            # Применяем патч к основной ветке (не к worktree)
            apply_result = subprocess.run(
                ["git", "-C", str(PROJECTS_DIR), "apply", "--index", str(patch_file)],
                capture_output=True, text=True
            )
            if apply_result.returncode != 0:
                self.log("MERGE", f"git apply ошибка: {apply_result.stderr.strip()[:300]}")
                return False

            # Коммитим с понятным сообщением
            commit_msg = f"feat({self.task_name}): auto-merge by orchestrator [run {self.run_id}]"
            commit_result = subprocess.run(
                ["git", "-C", str(PROJECTS_DIR), "commit", "-m", commit_msg],
                capture_output=True, text=True
            )
            if commit_result.returncode != 0:
                self.log("MERGE", f"git commit ошибка: {commit_result.stderr.strip()[:300]}")
                # Откатываем индекс чтобы не оставлять грязное состояние
                subprocess.run(
                    ["git", "-C", str(PROJECTS_DIR), "reset", "HEAD"],
                    capture_output=True
                )
                return False

            self.log("MERGE", f"Коммит: {commit_msg}")
            return True

        except Exception as e:
            self.log("MERGE", f"Исключение при автомёрже: {e}")
            return False

    def cleanup(self, failed: bool = False):
        if self.cleaned_up:
            return
        self.cleaned_up = True

        # Принудительно гасим контейнер, если он еще жив
        subprocess.run(["docker", "rm", "-f", self.container_name],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if failed and self.keep_worktree:
            self.log("CLEANUP", f"⚠️ Worktree сохранен для ручной отладки: {self.worktree_path}")
        else:
            if self.worktree_path.exists():
                shutil.rmtree(self.worktree_path, ignore_errors=True)
                self.log("CLEANUP", "Песочница удалена, временные ресурсы освобождены.")


def main():
    parser = argparse.ArgumentParser(description="Deterministic AI-Worker Orchestrator")
    parser.add_argument("task_name", help="Краткое имя задачи (например: fix_sla_timeout)")
    parser.add_argument("test_cmd", help="Команда валидации (например: 'pytest tests/test_sla.py')")
    parser.add_argument("prompt", nargs="?", default=None, help="Текстовая инструкция для воркера (или используйте --file)")
    parser.add_argument("--file", "-f", help="Путь к markdown или json файлу с описанием задачи")
    parser.add_argument("--timeout", type=int, default=300, help="Таймаут воркера в секундах (по умолчанию 300)")
    parser.add_argument("--keep", action="store_true", help="Не удалять worktree в случае падения для дебага")

    args = parser.parse_args()

    prompt_content = args.prompt
    if args.file:
        task_path = Path(args.file)
        if not task_path.exists():
            print(f"ОШИБКА: Файл задачи {task_path} не найден!")
            sys.exit(1)
        prompt_content = task_path.read_text(encoding="utf-8")
    elif not prompt_content:
        print("ОШИБКА: Необходимо указать prompt в аргументах или передать файл через --file / -f")
        sys.exit(1)

    orchestrator = TaskOrchestrator(
        task_name=args.task_name,
        test_cmd=args.test_cmd,
        prompt=prompt_content,
        timeout_sec=args.timeout,
        keep_worktree=args.keep
    )
    exit_code = orchestrator.run()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
