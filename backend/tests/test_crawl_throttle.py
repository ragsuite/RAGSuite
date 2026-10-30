"""Run-wide crawl politeness after HTTP 429 / 503."""
from __future__ import annotations

import asyncio
from email.utils import formatdate

from app.services.crawl_throttle import (
    MAX_PAUSE_SECONDS,
    MAX_THROTTLED_ATTEMPTS,
    SUCCESSES_PER_STEP,
    FetchThrottle,
    parse_retry_after,
)


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_default_pause_cap_is_15_seconds():
    assert MAX_PAUSE_SECONDS == 15.0
    assert MAX_THROTTLED_ATTEMPTS == 2
    clock = _Clock()
    gate = FetchThrottle(8, clock=clock)
    assert gate.throttled(retry_after=300) == 15.0
    assert gate.pause_remaining() == 15.0


def test_retry_after_seconds_and_http_date():
    assert parse_retry_after("7") == 7.0
    assert parse_retry_after("") is None and parse_retry_after("soon") is None
    assert abs(parse_retry_after(formatdate(1_000_030.0, usegmt=True), now=1_000_000.0) - 30.0) < 1.0


def test_throttle_pauses_the_run_and_halves_concurrency():
    clock = _Clock()
    gate = FetchThrottle(8, clock=clock)
    assert gate.throttled(retry_after=5) == 5
    assert gate.limit == 4 and gate.pause_remaining() == 5
    gate.throttled(retry_after=None)
    assert gate.limit == 2 and gate.pause_remaining() == 5


def test_backoff_is_exponential_and_capped():
    clock = _Clock()
    gate = FetchThrottle(8, clock=clock, max_pause_seconds=10)
    assert [gate.throttled(None) for _ in range(5)] == [2.0, 4.0, 8.0, 10, 10]
    assert gate.limit == 1


def test_concurrency_recovers_after_successes():
    gate = FetchThrottle(4, clock=_Clock())
    gate.throttled(retry_after=1)
    for _ in range(SUCCESSES_PER_STEP):
        gate.succeeded()
    assert gate.limit == 3


def test_throttle_widens_spacing_and_recovers_to_the_pace_that_held():
    gate = FetchThrottle(8, min_interval=0.5, clock=_Clock())
    gate.throttled(retry_after=1)
    gate.throttled(retry_after=1)
    assert gate.interval == 2.0
    for _ in range(SUCCESSES_PER_STEP * 3):
        gate.succeeded()
    assert gate.interval == 1.0


def test_only_a_fresh_trip_raises_the_pace_floor():
    gate = FetchThrottle(8, min_interval=0.5, clock=_Clock())
    for _ in range(4):
        gate.throttled(retry_after=1)
    assert gate.floor_interval == 1.0
    gate.succeeded()
    gate.throttled(retry_after=1)
    assert gate.floor_interval == 5.0


def test_request_starts_are_spaced_by_the_interval():
    async def scenario():
        gate = FetchThrottle(8, min_interval=0.1)
        loop = asyncio.get_running_loop()
        started = loop.time()
        for _ in range(4):
            await gate.acquire()
            gate.release()
        return loop.time() - started

    assert asyncio.run(scenario()) >= 0.28


def test_acquire_respects_limit_and_pause():
    async def scenario():
        gate = FetchThrottle(2, max_pause_seconds=0.2)
        await gate.acquire()
        await gate.acquire()
        third = asyncio.create_task(gate.acquire())
        await asyncio.sleep(0.1)
        assert not third.done()
        gate.release()
        await asyncio.wait_for(third, 1)
        gate.release()
        gate.release()
        gate.throttled(retry_after=0.2)
        started = asyncio.get_running_loop().time()
        await gate.acquire()
        return asyncio.get_running_loop().time() - started

    assert asyncio.run(scenario()) >= 0.15
