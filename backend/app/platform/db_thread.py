"""
Run blocking, DB-bound request dependencies off the event loop.

Auth dependencies are ``async def`` (callers ``await`` them directly and EE
modules use them in ``Depends``) but their bodies are synchronous SQLAlchemy
work. Run on the event loop, a ``QueuePool`` wait freezes the whole worker:
the requests that hold the pooled connections need the loop to finish and
release them, so every waiter times out after ``pool_timeout`` seconds.

``run_db_bound`` executes such bodies in a worker thread drawn from a
dedicated capacity limiter, separate from Starlette's default thread pool.
Requests blocked waiting for a connection therefore never consume the threads
that connection-holding sync handlers need to complete.
"""
from functools import partial
from typing import Callable, TypeVar

import anyio
import anyio.to_thread
from anyio.lowlevel import RunVar
from sqlalchemy.orm import Session

T = TypeVar("T")

# Must stay above the per-worker pool size (pool_size + max_overflow) so a burst
# of auth checks queues on the pool, not on thread tokens.
DB_BOUND_THREAD_TOKENS = 64

_limiter_var: RunVar[anyio.CapacityLimiter] = RunVar("ragsuite_db_bound_limiter")


def _db_bound_limiter() -> anyio.CapacityLimiter:
    try:
        return _limiter_var.get()
    except LookupError:
        limiter = anyio.CapacityLimiter(DB_BOUND_THREAD_TOKENS)
        _limiter_var.set(limiter)
        return limiter


def _uses_sqlite_session(values) -> bool:
    for value in values:
        if isinstance(value, Session):
            try:
                return value.get_bind().dialect.name == "sqlite"
            except Exception:
                return False
    return False


async def run_db_bound(fn: Callable[..., T], /, *args, **kwargs) -> T:
    """Await ``fn(*args, **kwargs)`` in a dedicated worker thread."""
    # SQLite connections are bound to their creating thread (check_same_thread).
    if _uses_sqlite_session((*args, *kwargs.values())):
        return fn(*args, **kwargs)
    return await anyio.to_thread.run_sync(
        partial(fn, *args, **kwargs), limiter=_db_bound_limiter()
    )
