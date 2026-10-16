"""Per-collection tables and the ``ragvec.collections`` registry.

Base DDL (extension, schema, registry) lives in ``app.platform.vector_schema`` so
Alembic and the safety net can run it without importing the RAG stack.
"""
from __future__ import annotations

import hashlib
import logging
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.engine import Connection

from ....platform.vector_schema import IMPORT_STATE, REGISTRY, SCHEMA, ensure_vector_schema, vector_schema_present
from .codec import HNSW_MAX_HALFVEC_DIM, index_opclass, normalize_metric, uses_halfvec_index

logger = logging.getLogger(__name__)

__all__ = ["IMPORT_STATE", "REGISTRY", "SCHEMA", "CollectionInfo", "ensure_vector_schema"]


@dataclass(frozen=True)
class CollectionInfo:
    name: str
    table: str
    dim: Optional[int]
    metric: str
    index_kind: Optional[str]

    @property
    def qualified(self) -> str:
        return f"{SCHEMA}.{self.table}"

    @property
    def halfvec(self) -> bool:
        return bool(self.dim) and uses_halfvec_index(int(self.dim))


_cache: Dict[str, CollectionInfo] = {}
_cache_lock = threading.Lock()
_schema_ready = False


def table_name_for(collection_name: str) -> str:
    return "c_" + hashlib.sha1(collection_name.encode("utf-8")).hexdigest()[:20]


def ensure_schema_once() -> None:
    global _schema_ready
    if _schema_ready:
        return
    from .engine import read_tx, write_tx

    with read_tx() as conn:
        present = vector_schema_present(conn)
    if not present:
        with write_tx() as conn:
            ensure_vector_schema(conn)
    _schema_ready = True


def _row_to_info(row) -> CollectionInfo:
    return CollectionInfo(
        name=row.name,
        table=row.table_name,
        dim=row.dim,
        metric=normalize_metric(row.metric),
        index_kind=row.index_kind,
    )


def load_info(conn: Connection, name: str) -> Optional[CollectionInfo]:
    with _cache_lock:
        hit = _cache.get(name)
    if hit is not None and hit.dim is not None:
        return hit
    row = conn.execute(
        text(f"SELECT name, table_name, dim, metric, index_kind FROM {REGISTRY} WHERE name = :n"),
        {"n": name},
    ).first()
    if row is None:
        return None
    info = _row_to_info(row)
    with _cache_lock:
        _cache[name] = info
    return info


def forget(name: Optional[str] = None) -> None:
    with _cache_lock:
        if name is None:
            _cache.clear()
        else:
            _cache.pop(name, None)


def list_names(conn: Connection) -> List[str]:
    rows = conn.execute(text(f"SELECT name FROM {REGISTRY} ORDER BY created_at, name")).all()
    return [r.name for r in rows]


def register(conn: Connection, name: str, metric: str) -> CollectionInfo:
    """Register a collection (no table yet when its dimension is still unknown)."""
    conn.execute(
        text(
            f"INSERT INTO {REGISTRY} (name, table_name, metric) VALUES (:n, :t, :m) "
            "ON CONFLICT (name) DO NOTHING"
        ),
        {"n": name, "t": table_name_for(name), "m": normalize_metric(metric)},
    )
    forget(name)
    info = load_info(conn, name)
    assert info is not None
    return info


def ensure_table(conn: Connection, name: str, dim: int, metric: str, *, with_index: bool = True) -> CollectionInfo:
    """Create the collection's table for ``dim`` (first write fixes the dimension)."""
    dim = int(dim)
    if dim <= 0 or dim > HNSW_MAX_HALFVEC_DIM:
        raise ValueError(f"Unsupported embedding dimension {dim} for collection {name}")
    info = register(conn, name, metric)
    if info.dim is not None:
        if info.dim != dim:
            raise ValueError(
                f"Collection {name} expects dimension {info.dim}, got {dim}"
            )
        return info
    conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"ragvec:{name}"})
    forget(name)
    info = load_info(conn, name)
    if info is not None and info.dim is not None:
        return info
    table = f"{SCHEMA}.{info.table}"
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {table} (
                seq          bigint GENERATED ALWAYS AS IDENTITY,
                chunk_id     text PRIMARY KEY,
                project_id   text,
                user_id      bigint,
                document_id  text,
                source_file  text,
                document     text NOT NULL DEFAULT '',
                metadata     jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                embedding    vector({dim}) NOT NULL
            )
            """
        )
    )
    # Vectors do not compress; skip pglz attempts and keep them out of line so
    # metadata-only scans stay small.
    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN embedding SET STORAGE EXTERNAL"))
    for suffix, cols in (
        ("seq", "(seq)"),
        ("proj_doc", "(project_id, document_id)"),
        ("doc", "(document_id)"),
        ("src", "(source_file text_pattern_ops)"),
        ("csrc", "((metadata -> 'crawl_source_id'))"),
    ):
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {info.table}_{suffix} ON {table} {cols}"))
    conn.execute(
        text(f"UPDATE {REGISTRY} SET dim = :d WHERE name = :n"),
        {"d": dim, "n": name},
    )
    forget(name)
    if with_index:
        build_vector_index(conn, load_info(conn, name))
    info = load_info(conn, name)
    assert info is not None
    return info


def build_vector_index(conn: Connection, info: Optional[CollectionInfo]) -> None:
    """HNSW index (halfvec expression index above 2000 dims)."""
    from ....settings import settings

    if info is None or info.dim is None:
        return
    m = max(4, int(settings.pgvector_hnsw_m or 16))
    efc = max(2 * m, int(settings.pgvector_hnsw_ef_construction or 100))
    halfvec = info.halfvec
    opclass = index_opclass(info.metric, halfvec=halfvec)
    column = f"(embedding::halfvec({info.dim}))" if halfvec else "embedding"
    conn.execute(
        text(
            f"CREATE INDEX IF NOT EXISTS {info.table}_hnsw ON {info.qualified} "
            f"USING hnsw ({column} {opclass}) WITH (m = {m}, ef_construction = {efc})"
        )
    )
    kind = "hnsw_halfvec" if halfvec else "hnsw"
    conn.execute(text(f"UPDATE {REGISTRY} SET index_kind = :k WHERE name = :n"), {"k": kind, "n": info.name})
    forget(info.name)


def drop_collection(conn: Connection, name: str) -> None:
    info = load_info(conn, name)
    if info is None:
        return
    conn.execute(text(f"DROP TABLE IF EXISTS {info.qualified}"))
    conn.execute(text(f"DELETE FROM {REGISTRY} WHERE name = :n"), {"n": name})
    forget(name)
