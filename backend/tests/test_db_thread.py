"""run_db_bound keeps blocking DB-bound dependency bodies off the event loop."""
import asyncio
import threading
import time

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.platform.db_thread import run_db_bound


async def test_blocking_body_does_not_block_event_loop():
    ticks = 0

    async def ticker():
        nonlocal ticks
        for _ in range(10):
            await asyncio.sleep(0.01)
            ticks += 1

    def blocking_body():
        time.sleep(0.2)
        return "done"

    result, _ = await asyncio.gather(run_db_bound(blocking_body), ticker())

    assert result == "done"
    assert ticks == 10


async def test_runs_in_worker_thread_and_passes_arguments():
    caller = threading.get_ident()

    def body(a, *, b):
        return threading.get_ident(), a + b

    thread_id, total = await run_db_bound(body, 2, b=3)

    assert total == 5
    assert thread_id != caller


async def test_propagates_exceptions():
    def body():
        raise ValueError("boom")

    with pytest.raises(ValueError, match="boom"):
        await run_db_bound(body)


async def test_sqlite_session_stays_on_calling_thread():
    engine = create_engine("sqlite:///:memory:")
    session = sessionmaker(bind=engine)()
    caller = threading.get_ident()
    try:
        thread_id = await run_db_bound(lambda db: threading.get_ident(), session)
    finally:
        session.close()
        engine.dispose()

    assert thread_id == caller


async def test_concurrent_calls_overlap():
    def body():
        time.sleep(0.2)
        return 1

    started = time.monotonic()
    results = await asyncio.gather(*(run_db_bound(body) for _ in range(20)))
    elapsed = time.monotonic() - started

    assert sum(results) == 20
    assert elapsed < 2.0
