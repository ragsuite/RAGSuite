"""Postgres full-text sidecar of Chroma chunks for keyword retrieval.

Chroma stays the source of truth: rows here only map chunk ids to a ``tsvector``.
Search hits are re-read from Chroma by id, so stale rows are harmless and missing
rows only mean a chunk is reachable through semantic search alone. Every public
function is best-effort — failures are logged and never break ingest or chat.
Disabled on non-Postgres databases (SQLite tests) and via RAG_LEXICAL_INDEX_ENABLED=0.
Rows, statements and lexeme weighting live in ``lexical_schema``.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import bindparam, create_engine, inspect, text
from sqlalchemy.pool import QueuePool

from . import query_keywords
from .lexical_schema import INDEX_VERSION, OUTDATED_CLAUSE, TABLE, build_row, search_sql, upsert_sql

logger = logging.getLogger(__name__)

_WRITE_BATCH = 500
_SEARCH_TIMEOUT_MS = 1500
_TABLE_RECHECK_SECONDS = 60.0
_HAS_ROWS_TTL_SECONDS = 60.0

_engine = None
_engine_lock = threading.Lock()
_table_state: Dict[str, float] = {}
_has_rows_cache: Dict[str, Tuple[bool, float]] = {}
_cache_lock = threading.Lock()

_UPSERT_SQL = upsert_sql(with_version=True)
_UPSERT_SQL_LEGACY = upsert_sql(with_version=False)


def _env_enabled() -> bool:
    raw = (os.environ.get("RAG_LEXICAL_INDEX_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _get_engine():
    """Small dedicated pool so keyword lookups never queue behind request traffic."""
    global _engine
    if _engine is not None:
        return _engine
    from ...platform.db import _engine_connect_args, settings

    url = settings.database_url or ""
    if not url.startswith("postgresql"):
        return None
    with _engine_lock:
        if _engine is None:
            _engine = create_engine(
                url,
                poolclass=QueuePool,
                pool_size=2,
                max_overflow=4,
                pool_pre_ping=True,
                pool_recycle=3600,
                pool_timeout=3,
                connect_args=_engine_connect_args,
            )
    return _engine


def is_enabled() -> bool:
    """True when the Postgres table exists and the feature flag is on."""
    if not _env_enabled():
        return False
    try:
        engine = _get_engine()
    except Exception as exc:
        logger.debug("lexical index engine unavailable: %s", exc)
        return False
    if engine is None:
        return False
    now = time.monotonic()
    with _cache_lock:
        state = _table_state.get("ready")
    if state == float("inf"):
        return True
    if state is not None and now - state < _TABLE_RECHECK_SECONDS:
        return False
    try:
        ready = inspect(engine).has_table(TABLE)
    except Exception as exc:
        logger.debug("lexical index table check failed: %s", exc)
        ready = False
    with _cache_lock:
        _table_state["ready"] = float("inf") if ready else now
    return ready


def has_version_column() -> bool:
    """True once the ``index_version`` migration ran (cached; unknown counts as absent)."""
    with _cache_lock:
        state = _table_state.get("version_col")
    if state == float("inf"):
        return True
    now = time.monotonic()
    if state is not None and now - state < _TABLE_RECHECK_SECONDS:
        return False
    try:
        columns = {col["name"] for col in inspect(_get_engine()).get_columns(TABLE)}
        present = "index_version" in columns
    except Exception as exc:
        logger.debug("lexical index column check failed: %s", exc)
        present = False
    with _cache_lock:
        _table_state["version_col"] = float("inf") if present else now
    return present


def upsert_chunks(
    collection_name: Optional[str],
    ids: Sequence[str],
    documents: Sequence[str],
    metadatas: Optional[Sequence[Optional[Dict[str, Any]]]] = None,
) -> int:
    """Index chunk texts. Returns rows written (0 when disabled or on error)."""
    if not collection_name or not ids or not is_enabled():
        return 0
    metas = list(metadatas or [])
    rows = [
        build_row(collection_name, cid, doc, metas[i] if i < len(metas) else None)
        for i, (cid, doc) in enumerate(zip(ids, documents))
        if cid and (doc or "").strip()
    ]
    if not rows:
        return 0
    written = 0
    statement = _UPSERT_SQL if has_version_column() else _UPSERT_SQL_LEGACY
    try:
        with _get_engine().begin() as conn:
            for start in range(0, len(rows), _WRITE_BATCH):
                batch = rows[start:start + _WRITE_BATCH]
                conn.execute(statement, batch)
                written += len(batch)
        with _cache_lock:
            _has_rows_cache[collection_name] = (True, time.monotonic())
    except Exception as exc:
        logger.warning("lexical index upsert failed for %s: %s", collection_name, exc)
        return 0
    return written


def delete_where(
    collection_name: Optional[str],
    *,
    ids: Optional[Sequence[str]] = None,
    document_id: Optional[str] = None,
    source_file: Optional[str] = None,
    project_id: Optional[str] = None,
) -> None:
    """Mirror a Chroma delete. ``collection_name=None`` applies to every collection."""
    if not is_enabled():
        return
    clauses: List[str] = []
    params: Dict[str, Any] = {}
    if collection_name:
        clauses.append("collection_name = :collection_name")
        params["collection_name"] = collection_name
    if document_id:
        clauses.append("document_id = :document_id")
        params["document_id"] = str(document_id)
    if source_file:
        clauses.append("source_file = :source_file")
        params["source_file"] = str(source_file)[:500]
    if project_id:
        clauses.append("project_id = :project_id")
        params["project_id"] = str(project_id)
    id_list = [str(i) for i in (ids or []) if i]
    if ids is not None and not id_list:
        return
    if id_list:
        clauses.append("chunk_id IN :ids")
    if len(clauses) <= (1 if collection_name else 0):
        return
    stmt = text(f"DELETE FROM {TABLE} WHERE " + " AND ".join(clauses))
    if id_list:
        stmt = stmt.bindparams(bindparam("ids", expanding=True))
    try:
        with _get_engine().begin() as conn:
            if id_list:
                for start in range(0, len(id_list), _WRITE_BATCH):
                    conn.execute(stmt, {**params, "ids": id_list[start:start + _WRITE_BATCH]})
            else:
                conn.execute(stmt, params)
    except Exception as exc:
        logger.warning("lexical index delete failed (%s): %s", collection_name or "*", exc)


def search(
    collection_name: Optional[str],
    project_id: Optional[str],
    keywords: Sequence[str],
    limit: int = 40,
    lang: Optional[str] = None,
) -> List[Tuple[str, float]]:
    """Return ``[(chunk_id, rank)]`` best-first; empty when disabled or nothing matches.

    ``lang`` (the question's language) enables light stemming; stems are prefix-matched,
    so they also hit indexed compound tails ("verschlepp:*" → "verschleppung").
    """
    if not collection_name or not is_enabled():
        return []
    query = query_keywords.tsquery_text(keywords, lang)
    if not query:
        return []
    project_clause = "AND project_id = :project_id" if project_id else ""
    stmt = search_sql(project_clause)
    params: Dict[str, Any] = {"q": query, "collection_name": collection_name, "limit": int(limit)}
    if project_id:
        params["project_id"] = str(project_id)
    try:
        with _get_engine().begin() as conn:
            conn.execute(text(f"SET LOCAL statement_timeout = {_SEARCH_TIMEOUT_MS}"))
            rows = conn.execute(stmt, params).fetchall()
    except Exception as exc:
        logger.info("lexical index search skipped for %s: %s", collection_name, exc)
        return []
    return [(str(r[0]), float(r[1] or 0.0)) for r in rows]


def has_rows(collection_name: Optional[str]) -> bool:
    """True when the collection has been indexed (cached briefly)."""
    if not collection_name or not is_enabled():
        return False
    now = time.monotonic()
    with _cache_lock:
        cached = _has_rows_cache.get(collection_name)
    if cached and now - cached[1] < _HAS_ROWS_TTL_SECONDS:
        return cached[0]
    try:
        with _get_engine().connect() as conn:
            found = conn.execute(
                text(f"SELECT 1 FROM {TABLE} WHERE collection_name = :c LIMIT 1"),
                {"c": collection_name},
            ).first() is not None
    except Exception as exc:
        logger.debug("lexical index has_rows failed for %s: %s", collection_name, exc)
        found = False
    with _cache_lock:
        _has_rows_cache[collection_name] = (found, now)
    return found


def _count(collection_name: str, where: str = "") -> int:
    if not is_enabled():
        return 0
    try:
        with _get_engine().connect() as conn:
            return int(
                conn.execute(
                    text(f"SELECT count(*) FROM {TABLE} WHERE collection_name = :c {where}"),
                    {"c": collection_name, "v": INDEX_VERSION},
                ).scalar()
                or 0
            )
    except Exception as exc:
        logger.debug("lexical index count failed for %s: %s", collection_name, exc)
        return 0


def count_rows(collection_name: str) -> int:
    return _count(collection_name)


def count_outdated_rows(collection_name: str) -> int:
    """Rows written by an older ``INDEX_VERSION`` (0 before the version migration)."""
    if not has_version_column():
        return 0
    return _count(collection_name, f"AND {OUTDATED_CLAUSE}")


def delete_outdated_rows(collection_name: str) -> int:
    """Drop rows a full re-index did not rewrite (their chunks left Chroma)."""
    if not is_enabled() or not has_version_column():
        return 0
    try:
        with _get_engine().begin() as conn:
            result = conn.execute(
                text(f"DELETE FROM {TABLE} WHERE collection_name = :c AND {OUTDATED_CLAUSE}"),
                {"c": collection_name, "v": INDEX_VERSION},
            )
            return int(result.rowcount or 0)
    except Exception as exc:
        logger.warning("lexical index prune failed for %s: %s", collection_name, exc)
        return 0
