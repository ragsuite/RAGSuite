"""Ride out a short vector-store outage (container restart, DNS blip) during index writes.

Without this a crawl that coincides with a store restart loses the pages written in that
window while the source still finishes as ready.
"""
from __future__ import annotations

import errno
import logging
import time
from typing import Callable, Optional, Sequence, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")
RETRY_DELAYS_SECONDS: Sequence[float] = (3.0, 8.0, 20.0)
_TRANSIENT_TYPES = frozenset({
    "ConnectError", "ConnectTimeout", "RemoteProtocolError", "ReadError", "WriteError", "PoolTimeout",
    "ConnectionError", "ConnectionRefusedError", "ConnectionResetError", "ConnectionAbortedError", "gaierror",
})
_TRANSIENT_ERRNOS = frozenset({errno.ECONNREFUSED, errno.ECONNRESET, errno.ECONNABORTED, -2, -3})


def is_transient(exc: Optional[BaseException]) -> bool:
    """Connection-level failures (refused, reset, name resolution), including wrapped ones."""
    seen = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        if any(t.__name__ in _TRANSIENT_TYPES for t in type(exc).__mro__):
            return True
        if isinstance(exc, OSError) and exc.errno in _TRANSIENT_ERRNOS:
            return True
        exc = exc.__cause__ or exc.__context__
    return False


def with_store_retry(
    write: Callable[[], T],
    *,
    before_retry: Optional[Callable[[], object]] = None,
    label: str = "vector store write",
    delays: Sequence[float] = RETRY_DELAYS_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    """Run ``write``; on a transient failure wait, run ``before_retry`` (e.g. drop the partial
    write) and try again. Other errors, and the last transient one, are raised."""
    for attempt, delay in enumerate([*delays, None], start=1):
        try:
            return write()
        except Exception as exc:
            if delay is None or not is_transient(exc):
                raise
            logger.warning("%s: vector store unavailable (%s); retry %d in %.0fs", label, exc, attempt, delay)
            sleep(delay)
            if before_retry is not None:
                try:
                    before_retry()
                except Exception as cleanup_exc:
                    logger.warning("%s: cleanup before retry failed: %s", label, cleanup_exc)
    raise AssertionError("unreachable")
