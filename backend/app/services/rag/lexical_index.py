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
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import bindparam, create_engine, inspect, text
from sqlalchemy.pool import QueuePool

from . import kb_generation, query_keywords, source_availability
from .lexical_schema import (
    INDEX_VERSION,
    OUTDATED_CLAUSE,
    SOURCE_CLAUSE,
    TABLE,
    build_row,
    mentions_sql,
    page_documents_sql,
    search_sql,
    term_counts_sql,
    upsert_sql,
)

logger = logging.getLogger(__name__)

_WRITE_BATCH = 500
_SEARCH_TIMEOUT_MS = 1500
# Rows the anchor terms of a timed-out query may match together; ranking that many rows
# stays well inside the search timeout.
_ANCHOR_ROW_BUDGET = 1000
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
    """Index chunk texts. Returns rows written (0 when disabled or on error).

    Called next to every Chroma add, so it also advances the knowledge-base generation.
    """
    try:
        return _upsert_chunks(collection_name, ids, documents, metadatas)
    finally:
        kb_generation.bump()


def _upsert_chunks(
    collection_name: Optional[str],
    ids: Sequence[str],
    documents: Sequence[str],
    metadatas: Optional[Sequence[Optional[Dict[str, Any]]]],
) -> int:
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
    try:
        _delete_where(collection_name, ids=ids, document_id=document_id, source_file=source_file, project_id=project_id)
    finally:
        kb_generation.bump()


def _delete_where(
    collection_name: Optional[str],
    *,
    ids: Optional[Sequence[str]],
    document_id: Optional[str],
    source_file: Optional[str],
    project_id: Optional[str],
) -> None:
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


class _SearchTimeout(Exception):
    pass


def search(
    collection_name: Optional[str],
    project_id: Optional[str],
    keywords: Sequence[str],
    limit: int = 40,
    lang: Optional[str] = None,
    source_ids: Optional[Sequence[str]] = None,
    required: Optional[Sequence[str]] = None,
    document_ids: Optional[Sequence[str]] = None,
    absent: Optional[Sequence[str]] = None,
) -> List[Tuple[str, float]]:
    """Return ``[(chunk_id, rank)]`` best-first; empty when disabled or nothing matches.

    ``lang`` (the question's language) enables light stemming; stems are prefix-matched,
    so they also hit indexed compound tails ("verschlepp:*" → "verschleppung").
    ``source_ids`` limits hits to those sources (document id or ``crawl_source_<id>``).
    ``required`` (exact terms, e.g. one identifier) keeps only rows matching one of them
    and, with ``absent``, none of those;
    ``document_ids`` keeps only rows of those documents (single pages).
    When a query of several keywords times out (common words such as "price" or short
    prefixes such as ``stand:*`` over a large collection), it is retried once: ranked by
    every keyword but only over the rows of its rarest terms, or, when every term is
    common, with only codes and long words. A ``query_keywords.Phrase`` keyword matches
    its words in sequence.
    """
    if not collection_name or not is_enabled():
        return []
    if document_ids is not None and not document_ids:
        return []
    if required or document_ids:
        try:
            return _search_once(
                collection_name, project_id, keywords, limit, lang, source_ids, required, document_ids,
                absent=absent,
            )
        except _SearchTimeout:
            logger.info("lexical index scoped search timed out for %s", collection_name)
            return []
    try:
        return _search_once(collection_name, project_id, keywords, limit, lang, source_ids)
    except _SearchTimeout:
        if len(set(keywords)) < 2:
            logger.info("lexical index search timed out for %s", collection_name)
            return []
        anchors = _anchor_terms(collection_name, project_id, keywords)
        if anchors and len(anchors) < len(set(keywords)):
            logger.info("lexical index search timed out for %s; ranking within %s", collection_name, anchors)
            try:
                return _search_once(collection_name, project_id, keywords, limit, lang, source_ids, anchors)
            except _SearchTimeout:
                logger.info("lexical index anchored search timed out for %s", collection_name)
                return []
        narrowed = query_keywords.informative_terms(keywords)
        if not narrowed or len(narrowed) == len(keywords):
            logger.info("lexical index search timed out for %s", collection_name)
            return []
        logger.info("lexical index search timed out for %s; retrying with %s", collection_name, narrowed)
        try:
            return _search_once(collection_name, project_id, narrowed, limit, lang, source_ids)
        except _SearchTimeout:
            logger.info("lexical index narrowed search timed out for %s", collection_name)
            return []


def _exclusions(project_id: Optional[str]) -> Tuple[List[str], List[str]]:
    """``(source_file values, document ids)`` of sources switched off for answers."""
    if not project_id or not source_availability.prefilter_enabled():
        return [], []
    off = source_availability.disabled(project_id)
    return source_availability.excluded_source_files(off.crawl_sources), sorted(off.documents)


def _search_once(
    collection_name: str,
    project_id: Optional[str],
    keywords: Sequence[str],
    limit: int,
    lang: Optional[str],
    source_ids: Optional[Sequence[str]],
    required: Optional[Sequence[str]] = None,
    document_ids: Optional[Sequence[str]] = None,
    absent: Optional[Sequence[str]] = None,
) -> List[Tuple[str, float]]:
    """One ranked query; raises ``_SearchTimeout`` on statement timeout, ``[]`` on other errors."""
    query = query_keywords.tsquery_text(keywords, lang)
    if not query:
        return []
    must = query_keywords.tsquery_text(required, None) if required else ""
    if required and not must:
        return []
    without = query_keywords.tsquery_text(absent, None) if must and absent else ""
    if without:
        must = f"({must}) & !({without})"
    project_clause = "AND project_id = :project_id" if project_id else ""
    excluded, excluded_docs = _exclusions(project_id)
    stmt = search_sql(
        project_clause,
        SOURCE_CLAUSE if source_ids else "",
        required=bool(must),
        documents=bool(document_ids),
        exclude=bool(excluded),
        exclude_documents=bool(excluded_docs),
    )
    params: Dict[str, Any] = {"q": query, "collection_name": collection_name, "limit": int(limit)}
    if excluded:
        params["excluded_files"] = excluded
    if excluded_docs:
        params["excluded_docs"] = excluded_docs
    if must:
        params["must"] = must
    if document_ids:
        params["doc_ids"] = [str(i) for i in document_ids]
    if project_id:
        params["project_id"] = str(project_id)
    if source_ids:
        ids = [str(i) for i in source_ids]
        params["src_ids"] = ids
        params["src_files"] = [f"crawl_source_{i}" for i in ids]
    try:
        with _get_engine().begin() as conn:
            conn.execute(text(f"SET LOCAL statement_timeout = {_SEARCH_TIMEOUT_MS}"))
            # The planner does not cost reading toasted tsvectors, so it picks a seq scan
            # that is several times slower than the GIN bitmap scan on large collections.
            conn.execute(text("SET LOCAL enable_seqscan = off"))
            rows = conn.execute(stmt, params).fetchall()
    except Exception as exc:
        if "statement timeout" in str(exc).lower():
            raise _SearchTimeout() from exc
        logger.info("lexical index search skipped for %s: %s", collection_name, exc)
        return []
    return [(str(r[0]), float(r[1] or 0.0)) for r in rows]


def _anchor_terms(collection_name: str, project_id: Optional[str], keywords: Sequence[str]) -> List[str]:
    """Rarest ``keywords`` whose rows together stay within ``_ANCHOR_ROW_BUDGET`` (``[]`` if none fit)."""
    counts = _term_counts(collection_name, project_id, keywords, _ANCHOR_ROW_BUDGET + 1)
    anchors: List[str] = []
    total = 0
    for term in sorted((kw for kw in counts if counts[kw] > 0), key=counts.__getitem__):
        total += counts[term]
        if total > _ANCHOR_ROW_BUDGET:
            break
        anchors.append(term)
    return anchors


def _term_counts(
    collection_name: str, project_id: Optional[str], keywords: Sequence[str], cap: int,
) -> Dict[str, int]:
    """Rows matching each keyword exactly as ``required`` matches it, counted up to ``cap``."""
    queries = {kw: query_keywords.tsquery_text([kw], None) for kw in dict.fromkeys(keywords)}
    queries = {kw: q for kw, q in queries.items() if q}
    if not queries:
        return {}
    project_clause = "AND project_id = :project_id" if project_id else ""
    params: Dict[str, Any] = {
        "collection_name": collection_name,
        "queries": list(queries.values()),
        "cap": int(cap),
    }
    if project_id:
        params["project_id"] = str(project_id)
    try:
        with _get_engine().begin() as conn:
            conn.execute(text(f"SET LOCAL statement_timeout = {_SEARCH_TIMEOUT_MS}"))
            conn.execute(text("SET LOCAL enable_seqscan = off"))
            rows = conn.execute(term_counts_sql(project_clause), params).fetchall()
    except Exception as exc:
        logger.info("lexical index term counts skipped for %s: %s", collection_name, exc)
        return {}
    terms = list(queries)
    return {terms[int(position) - 1]: int(count or 0) for position, count in rows}


def term_counts(
    collection_name: Optional[str], project_id: Optional[str], keywords: Sequence[str], cap: int,
) -> Dict[str, int]:
    """``{keyword: rows matching it (up to cap)}``; empty when disabled or unknown."""
    if not collection_name or not keywords or not is_enabled():
        return {}
    return _term_counts(collection_name, project_id, keywords, cap)


def project_words(project_id: Optional[str], words: Sequence[str]) -> Optional[Set[str]]:
    """The ``words`` occurring in some indexed chunk of the project (``None`` when unknown)."""
    queries = {w: q for w in dict.fromkeys(words) if (q := query_keywords.tsquery_text([w], None))}
    if not project_id or not queries or not is_enabled():
        return None
    try:
        with _get_engine().begin() as conn:
            conn.execute(text(f"SET LOCAL statement_timeout = {_SEARCH_TIMEOUT_MS}"))
            rows = conn.execute(
                mentions_sql(), {"project_id": str(project_id), "queries": list(queries.values())}
            ).fetchall()
    except Exception as exc:
        logger.info("lexical index word check skipped for project %s: %s", project_id, exc)
        return None
    terms = list(queries)
    return {terms[int(position) - 1] for (position,) in rows}


def project_mentions(project_id: Optional[str], words: Sequence[str]) -> bool:
    """Whether every word occurs in some indexed chunk of the project (``False`` when unknown)."""
    queried = [w for w in dict.fromkeys(words) if query_keywords.tsquery_text([w], None)]
    found = project_words(project_id, queried) if queried else None
    return found is not None and set(queried) <= found


def page_documents(
    collection_name: Optional[str],
    project_id: Optional[str],
    chunk_ids: Sequence[str],
    max_chunks: int,
) -> List[str]:
    """Document ids of ``chunk_ids`` that are single pages (at most ``max_chunks`` chunks)."""
    if not collection_name or not chunk_ids or not is_enabled():
        return []
    project_clause = "AND project_id = :project_id" if project_id else ""
    params: Dict[str, Any] = {
        "collection_name": collection_name,
        "chunk_ids": [str(c) for c in chunk_ids],
        "max_chunks": int(max_chunks),
    }
    if project_id:
        params["project_id"] = str(project_id)
    try:
        with _get_engine().begin() as conn:
            conn.execute(text(f"SET LOCAL statement_timeout = {_SEARCH_TIMEOUT_MS}"))
            rows = conn.execute(page_documents_sql(project_clause), params).fetchall()
    except Exception as exc:
        logger.info("lexical index page lookup skipped for %s: %s", collection_name, exc)
        return []
    return [str(r[0]) for r in rows if r[0]]


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
    finally:
        kb_generation.bump()
