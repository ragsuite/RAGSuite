"""Dedicated connection pool for the pgvector store.

Vector reads/writes get their own small pool (like the lexical index) so a burst of
retrieval or a large ingest can never take connections from request handlers or the
job queue. ``VECTOR_DATABASE_URL`` can point at a separate Postgres later; empty means
the main ``DATABASE_URL``.
"""
from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.pool import QueuePool

_engine: Optional[Engine] = None
_engine_lock = threading.Lock()


def vector_database_url() -> str:
    from ....settings import settings

    return (getattr(settings, "vector_database_url", "") or "").strip() or settings.database_url


def is_postgres_url(url: str) -> bool:
    return (url or "").startswith("postgresql")


def get_engine() -> Engine:
    global _engine
    if _engine is not None:
        return _engine
    from ....platform.db import _engine_connect_args
    from ....settings import settings

    url = vector_database_url()
    if not is_postgres_url(url):
        raise RuntimeError("pgvector store requires a PostgreSQL DATABASE_URL / VECTOR_DATABASE_URL")
    with _engine_lock:
        if _engine is None:
            _engine = create_engine(
                url,
                poolclass=QueuePool,
                pool_size=max(1, int(settings.vector_db_pool_size or 4)),
                max_overflow=max(0, int(settings.vector_db_max_overflow or 0)),
                pool_pre_ping=True,
                pool_recycle=3600,
                pool_timeout=max(1, int(settings.vector_db_pool_timeout_seconds or 10)),
                connect_args=_engine_connect_args,
            )
    return _engine


def reset_engine() -> None:
    """Dispose the pool (tests / after fork)."""
    global _engine
    with _engine_lock:
        if _engine is not None:
            _engine.dispose()
        _engine = None


def set_locals(conn: Connection, values: Dict[str, Any]) -> None:
    """Transaction-local settings in one round trip (``SET LOCAL`` semantics)."""
    if not values:
        return
    params: Dict[str, str] = {}
    calls: List[str] = []
    for i, (name, value) in enumerate(values.items()):
        params[f"n{i}"], params[f"v{i}"] = name, str(value)
        calls.append(f"set_config(:n{i}, :v{i}, true)")
    conn.execute(text("SELECT " + ", ".join(calls)), params)


@contextmanager
def read_tx(timeout_ms: Optional[int] = None) -> Iterator[Connection]:
    """Transaction for reads with a per-statement timeout (SET LOCAL semantics)."""
    from ....settings import settings

    ms = int(timeout_ms if timeout_ms is not None else settings.vector_query_timeout_ms)
    with get_engine().begin() as conn:
        set_locals(conn, {"statement_timeout": max(0, ms)})
        yield conn


@contextmanager
def write_tx(timeout_ms: Optional[int] = None) -> Iterator[Connection]:
    """Transaction for writes; longer timeout because batches carry full vectors."""
    from ....settings import settings

    ms = int(timeout_ms if timeout_ms is not None else settings.vector_write_timeout_ms)
    with get_engine().begin() as conn:
        set_locals(conn, {"statement_timeout": max(0, ms)})
        yield conn


def set_search_params(conn: Connection, *, ef_search: int, max_scan_tuples: int, random_page_cost: float) -> None:
    """HNSW search knobs for the current transaction only.

    ``random_page_cost`` matters for plan choice: with the HDD-era default (4) the
    planner prices an HNSW walk at ``ef_search >= 100`` above a full scan + sort of a
    small/medium collection, although the scan must also read every out-of-line vector
    (~100x slower in practice). An SSD-realistic value lets it pick HNSW for broad
    filters and an exact btree lookup + sort for selective ones.
    """
    set_locals(conn, {
        "hnsw.ef_search": ef_search,
        "hnsw.iterative_scan": "relaxed_order",
        "hnsw.max_scan_tuples": max_scan_tuples,
        "random_page_cost": random_page_cost,
    })
