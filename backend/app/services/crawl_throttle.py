"""Politeness for one crawl run: request pacing and backoff when the site rate-limits it.

Request starts are spaced by the source's ``delay_seconds``. A throttled response
(HTTP 429 / 503) pauses every request of the run (``Retry-After`` when the server sends
it, else exponential backoff), halves the requests in flight and doubles the spacing;
both recover step by step after a run of successful fetches, but never below the pace
that tripped the limit. CDN rate limits (e.g. Cloudflare in front of a shop) keep a
client blocked for many minutes once tripped, so pacing up front matters more than
retrying afterwards.
"""
from __future__ import annotations

import asyncio
import time
from email.utils import parsedate_to_datetime
from typing import Callable, Optional

THROTTLE_STATUSES = frozenset({429, 503})
# Attempts for a throttled URL in one fetch; then the URL is requeued so others can run.
MAX_THROTTLED_ATTEMPTS = 2
# Honor Retry-After up to this cap so one 429 cannot freeze the whole run for minutes.
MAX_PAUSE_SECONDS = 15.0
MAX_INTERVAL_SECONDS = 5.0
# Spacing applied after a throttle when the source configures none.
MIN_BACKOFF_INTERVAL_SECONDS = 0.5
SUCCESSES_PER_STEP = 20
_POLL_SECONDS = 0.05


def parse_retry_after(value: Optional[str], *, now: Optional[float] = None) -> Optional[float]:
    """Seconds to wait from a ``Retry-After`` header (delta seconds or HTTP date)."""
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        return max(0.0, float(raw))
    except ValueError:
        pass
    try:
        when = parsedate_to_datetime(raw).timestamp()
    except (TypeError, ValueError, IndexError, OverflowError):
        return None
    return max(0.0, when - (time.time() if now is None else now))


class FetchThrottle:
    """Run-wide request gate; use from a single event loop."""

    def __init__(
        self,
        max_concurrency: int,
        *,
        min_interval: float = 0.0,
        min_concurrency: int = 1,
        max_pause_seconds: float = MAX_PAUSE_SECONDS,
        max_interval: float = MAX_INTERVAL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_concurrency = max(1, max_concurrency)
        self.min_concurrency = max(1, min(min_concurrency, self.max_concurrency))
        self.limit = self.max_concurrency
        self.base_interval = max(0.0, min_interval)
        self.max_interval = max(self.base_interval, max_interval)
        self.interval = self.base_interval
        # Spacing never recovers below the pace that last tripped the site's limit.
        self.floor_interval = self.base_interval
        self.max_pause_seconds = max_pause_seconds
        self.throttled_count = 0
        self._clock = clock
        self._active = 0
        self._paused_until = 0.0
        self._next_start = 0.0
        self._streak = 0
        self._successes = 0

    def pause_remaining(self) -> float:
        return max(0.0, self._paused_until - self._clock())

    async def acquire(self) -> None:
        while True:
            now = self._clock()
            wait = max(self._paused_until, self._next_start) - now
            if wait > 0:
                await asyncio.sleep(min(wait, 1.0))
                continue
            if self._active < self.limit:
                self._active += 1
                self._next_start = now + self.interval
                return
            await asyncio.sleep(_POLL_SECONDS)

    def release(self) -> None:
        self._active = max(0, self._active - 1)

    def throttled(self, retry_after: Optional[float]) -> float:
        """Record a 429/503; returns the pause applied to the whole run."""
        self.throttled_count += 1
        self._streak += 1
        self._successes = 0
        backoff = retry_after if retry_after is not None else 2.0 ** self._streak
        pause = min(self.max_pause_seconds, max(1.0, backoff))
        self._paused_until = max(self._paused_until, self._clock() + pause)
        self.limit = max(self.min_concurrency, self.limit // 2)
        widened = min(self.max_interval, max(self.interval * 2, MIN_BACKOFF_INTERVAL_SECONDS))
        if self._streak == 1:
            # Only a throttle after successful fetches says the pace was too fast;
            # repeats while the block lasts say nothing new about it.
            self.floor_interval = max(self.floor_interval, widened)
        self.interval = widened
        return pause

    def succeeded(self) -> None:
        self._streak = 0
        if self.limit >= self.max_concurrency and self.interval <= self.floor_interval:
            return
        self._successes += 1
        if self._successes >= SUCCESSES_PER_STEP:
            self.limit = min(self.max_concurrency, self.limit + 1)
            self.interval = max(self.floor_interval, self.interval / 2)
            self._successes = 0
