"""Tests for ingest_runtime event-loop isolation."""
import asyncio
import time

import pytest

from app.services import ingest_runtime
from app.settings import settings


def test_run_ingest_sync_inline_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "enable_async_ingest", False)
    assert ingest_runtime.run_ingest_sync(lambda x: x + 1, 1) == 2


def test_run_ingest_async_does_not_block_event_loop(monkeypatch):
    monkeypatch.setattr(settings, "enable_async_ingest", True)
    monkeypatch.setattr(settings, "ingest_pool_workers", 1)

    def slow():
        time.sleep(0.3)
        return "ok"

    async def main():
        t0 = time.perf_counter()
        task = asyncio.create_task(ingest_runtime.run_ingest_async(slow))
        await asyncio.sleep(0.05)
        elapsed_before = time.perf_counter() - t0
        result = await task
        return result, elapsed_before

    result, elapsed_before = asyncio.run(main())
    assert result == "ok"
    assert elapsed_before < 0.2
