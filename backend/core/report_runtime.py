"""Learning has priority over report inference (one backend process only)."""
import asyncio
from contextlib import asynccontextmanager
from functools import wraps
import os
import math
from pathlib import Path
import time

import httpx
import psutil
from fastapi import HTTPException

from backend.core.dds_report_llm import get_llm_settings


def runtime_root():
    return get_llm_settings().base_url.rstrip("/").removesuffix("/v1")


async def runtime_sleeping():
    async with httpx.AsyncClient(trust_env=False, timeout=2) as client:
        response = await client.get(runtime_root() + "/props")
        response.raise_for_status()
        return response.json().get("is_sleeping") is True


async def confirm_runtime_idle(timeout=None):
    """Closing the stream must cancel the server slot, not just the Python task."""
    timeout = timeout if timeout is not None else float(os.getenv("DDS_REPORT_CANCEL_TIMEOUT_SECONDS", "30"))
    deadline = time.monotonic() + timeout
    async with httpx.AsyncClient(trust_env=False, timeout=1) as client:
        while time.monotonic() < deadline:
            try:
                props = await client.get(runtime_root() + "/props")
                if props.is_success and props.json().get("is_sleeping") is True:
                    return True
                response = await client.get(runtime_root() + "/slots")
                response.raise_for_status()
                slots = response.json()
                if isinstance(slots, list) and slots and all(s.get("is_processing") is False for s in slots):
                    return True
            except (httpx.HTTPError, ValueError, TypeError):
                pass
            await asyncio.sleep(.1)
    return False


class LearningCoordinator:
    def __init__(self):
        self._lock = None
        self._loop = None
        self.task = None
        self.unconfirmed_cancel = False
        self.idle_since = None

    @property
    def lock(self):
        # ASGI lifespan can be restarted on a new event loop in the same process.
        loop = asyncio.get_running_loop()
        if self._loop is not loop:
            if self._lock is not None and self._lock.locked():
                raise RuntimeError("Report coordinator is already in use by another event loop")
            self._loop, self._lock = loop, asyncio.Lock()
            self.idle_since = None
        return self._lock

    async def interrupt(self):
        self.idle_since = None
        cancelled_now = self.task and not self.task.done()
        if cancelled_now:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.unconfirmed_cancel = not await confirm_runtime_idle()
        elif self.unconfirmed_cancel:
            self.unconfirmed_cancel = not await confirm_runtime_idle()
        if self.unconfirmed_cancel:
            raise HTTPException(503, "Не подтверждена остановка фонового ИИ. Повторите запуск занятия.")


coordinator = LearningCoordinator()


@asynccontextmanager
async def learning_priority():
    """Call after authorization, before creating learning state or timers."""
    async with coordinator.lock:
        await coordinator.interrupt()
        yield


def learning_start(function):
    """Hold the same lock from inference cancellation until the learning commit."""
    @wraps(function)
    async def wrapped(*args, **kwargs):
        async with learning_priority():
            return await function(*args, **kwargs)
    return wrapped


class ResourceMonitor:
    def __init__(self, cgroup_root="/sys/fs/cgroup"):
        self.root = Path(cgroup_root)
        self.previous_cpu = None

    def sample(self):
        """Use host headroom and the stricter applicable cgroup v2 limits."""
        try:
            cpu = psutil.cpu_percent(interval=None)
            available = psutil.virtual_memory().available
            limit_file = self.root / "memory.max"
            if limit_file.exists():
                limit = limit_file.read_text().strip()
                if limit != "max":
                    available = min(available, max(0, int(limit) - int((self.root / "memory.current").read_text())))
            quota_file = self.root / "cpu.max"
            quota, period, usage = None, None, None
            if quota_file.exists():
                quota, period = quota_file.read_text().split()
                if quota != "max":
                    stats = dict(line.split() for line in (self.root / "cpu.stat").read_text().splitlines())
                    usage = int(stats["usage_usec"])
            elif (self.root / "cpu" / "cpu.cfs_quota_us").exists():
                quota = (self.root / "cpu" / "cpu.cfs_quota_us").read_text().strip()
                if int(quota) > 0:
                    period = (self.root / "cpu" / "cpu.cfs_period_us").read_text().strip()
                    usage = int((self.root / "cpuacct" / "cpuacct.usage").read_text()) / 1000
            if usage is not None:
                current = (time.monotonic(), usage)
                previous, self.previous_cpu = self.previous_cpu, current
                if previous is None:
                    return None
                elapsed = current[0] - previous[0]
                cpu = max(cpu, (current[1] - previous[1]) / (elapsed * 1e6 * int(quota) / int(period)) * 100)
            # Support hosts that still use the cgroup v1 hierarchy.
            v1 = self.root / "memory" / "memory.limit_in_bytes"
            if v1.exists():
                available = min(available, max(0, int(v1.read_text()) - int(
                    (v1.parent / "memory.usage_in_bytes").read_text())))
            return (cpu, available) if math.isfinite(cpu) and available >= 0 else None
        except (OSError, ValueError, KeyError, ZeroDivisionError):
            return None


def memory_required(sleeping):
    mib = 1024 * 1024
    reserve = int(os.getenv("DDS_REPORT_RAM_RESERVE_MB", "2048")) * mib
    budget = int(os.getenv("DDS_REPORT_MODEL_BUDGET_MB", "8192")) * mib if sleeping else 0
    return reserve + budget
