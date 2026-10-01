"""Postgres full-text sidecar of Chroma chunks for keyword retrieval.

Chroma stays the source of truth: rows here only map chunk ids to a ``tsvector``.
Search hits are re-read from Chroma by id, so stale rows are harmless and missing
rows only mean a chunk is reachable through semantic search alone. Every public
function is best-effort — failures are logged and never break ingest or chat.
Disabled on non-Postgres databases (SQLite tests) and via RAG_LEXICAL_INDEX_ENABLED=0.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import bindparam, create_engine, inspect, text
from sqlalchemy.pool import QueuePool

logger = logging.getLogger(__name__)

TABLE = "rag_chunk_lexical_index"
_MAX_BODY_CHARS = 20000
_WRITE_BATCH = 500
_SEARCH_TIMEOUT_MS = 1500
_TABLE_RECHECK_SECONDS = 60.0
_HAS_ROWS_TTL_SECONDS = 60.0
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)

_engine = None
_engine_lock = threading.Lock()
_table_state: Dict[str, float] = {}
_has_rows_cache: Dict[str, Tuple[bool, float]] = {}
_cache_lock = threading.Lock()

_UPSERT_SQL = text(
    f"""
    INSERT INTO {TABLE} (collection_name, chunk_id, project_id, document_id, source_file, tsv)
    VALUES (
        :collection_name, :chunk_id, :project_id, :document_id, :source_file,
        setweight(to_tsvector('simple', :head), 'A') || to_tsvector('simple', :body)
    )
    ON CONFLICT (collection_name, chunk_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        document_id = EXCLUDED.document_id,
        source_file = EXCLUDED.source_file,
        tsv = EXCLUDED.tsv
    """
)


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


def _head_text(meta: Dict[str, Any]) -> str:
    """Title + URL words, weighted higher so entity/site names rank first."""
    title = str(meta.get("title") or "")
    url = re.sub(r"^https?://(www\.)?", "", str(meta.get("url") or ""))
    return " ".join(_TOKEN_RE.findall(f"{title} {url}".lower()))


def _row(collection_name: str, chunk_id: str, doc: str, meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    meta = meta or {}
    return {
        "collection_name": collection_name,
        "chunk_id": str(chunk_id),
        "project_id": str(meta.get("project_id") or "") or None,
        "document_id": str(meta.get("document_id") or "") or None,
        "source_file": str(meta.get("source_file") or "")[:500] or None,
        "head": _head_text(meta).replace("\x00", " "),
        "body": (doc or "")[:_MAX_BODY_CHARS].replace("\x00", " "),
    }


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
        _row(collection_name, cid, doc, metas[i] if i < len(metas) else None)
        for i, (cid, doc) in enumerate(zip(ids, documents))
        if cid and (doc or "").strip()
    ]
    if not rows:
        return 0
    written = 0
    try:
        with _get_engine().begin() as conn:
            for start in range(0, len(rows), _WRITE_BATCH):
                batch = rows[start:start + _WRITE_BATCH]
                conn.execute(_UPSERT_SQL, batch)
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


def _tsquery(keywords: Sequence[str]) -> str:
    terms: List[str] = []
    seen: set = set()
    for kw in keywords:
        for tok in _TOKEN_RE.findall((kw or "").lower()):
            if len(tok) < 2 or tok in seen:
                continue
            seen.add(tok)
            terms.append(f"{tok}:*" if len(tok) >= 4 else tok)
    return " | ".join(terms)


def search(
    collection_name: Optional[str],
    project_id: Optional[str],
    keywords: Sequence[str],
    limit: int = 40,
) -> List[Tuple[str, float]]:
    """Return ``[(chunk_id, rank)]`` best-first; empty when disabled or nothing matches."""
    if not collection_name or not is_enabled():
        return []
    query = _tsquery(keywords)
    if not query:
        return []
    project_clause = "AND project_id = :project_id" if project_id else ""
    stmt = text(
        f"""
        SELECT chunk_id, ts_rank_cd(tsv, q) AS rank
        FROM {TABLE}, to_tsquery('simple', :q) AS q
        WHERE collection_name = :collection_name {project_clause} AND tsv @@ q
        ORDER BY rank DESC
        LIMIT :limit
        """
    )
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


def count_rows(collection_name: str) -> int:
    if not is_enabled():
        return 0
    try:
        with _get_engine().connect() as conn:
            return int(
                conn.execute(
                    text(f"SELECT count(*) FROM {TABLE} WHERE collection_name = :c"),
                    {"c": collection_name},
                ).scalar()
                or 0
            )
    except Exception as exc:
        logger.debug("lexical index count failed for %s: %s", collection_name, exc)
        return 0
