"""Elasticsearch backend for the ``lexical_index`` public API.

Same function contracts as the Postgres tsvector sidecar. Rank order feeds RRF;
cosine floors still come from the vector query.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from . import kb_generation, query_keywords, source_availability
from .vector_store import es_client

logger = logging.getLogger(__name__)

_HAS_ROWS_TTL_SECONDS = 60.0
_has_rows_cache: Dict[str, Tuple[bool, float]] = {}


def _index(collection_name: str) -> str:
    return es_client.index_name_for(collection_name)


def _exists(collection_name: str) -> bool:
    client = es_client.get_es()
    return bool(client.indices.exists(index=_index(collection_name)))


def upsert_chunks(
    collection_name: Optional[str],
    ids: Sequence[str],
    documents: Sequence[str],
    metadatas: Optional[Sequence[Optional[Dict[str, Any]]]] = None,
) -> int:
    """Chunks already carry ``text`` from vector ingest; refresh so keyword sees them."""
    if not collection_name or not ids:
        return 0
    try:
        if _exists(collection_name):
            es_client.get_es().indices.refresh(index=_index(collection_name))
    except Exception as exc:
        logger.warning("lexical ES upsert refresh failed for %s: %s", collection_name, exc)
        return 0
    finally:
        kb_generation.bump()
    return len([i for i in ids if i])


def delete_where(
    collection_name: Optional[str],
    *,
    ids: Optional[Sequence[str]] = None,
    document_id: Optional[str] = None,
    source_file: Optional[str] = None,
    project_id: Optional[str] = None,
) -> None:
    """Vector deletes already remove ES docs; this is a no-op plus generation bump."""
    kb_generation.bump()


def _exclusions(project_id: Optional[str]) -> Tuple[List[str], List[str]]:
    if not project_id or not source_availability.prefilter_enabled():
        return [], []
    off = source_availability.disabled(project_id)
    return source_availability.excluded_source_files(off.crawl_sources), sorted(off.documents)


def _filter_clause(
    collection_name: str,
    project_id: Optional[str],
    source_ids: Optional[Sequence[str]] = None,
    document_ids: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    must: List[Dict[str, Any]] = []
    if project_id:
        must.append({"term": {"project_id": str(project_id)}})
    if document_ids:
        must.append({"terms": {"document_id": [str(i) for i in document_ids]}})
    if source_ids:
        ids = [str(i) for i in source_ids]
        must.append({
            "bool": {
                "should": [
                    {"terms": {"document_id": ids}},
                    {"terms": {"source_file": [f"crawl_source_{i}" for i in ids]}},
                ],
                "minimum_should_match": 1,
            }
        })
    excluded, excluded_docs = _exclusions(project_id)
    must_not: List[Dict[str, Any]] = []
    if excluded:
        must_not.append({"terms": {"source_file": excluded}})
    if excluded_docs:
        must_not.append({"terms": {"document_id": excluded_docs}})
    if not must and not must_not:
        return {"match_all": {}}
    clause: Dict[str, Any] = {"bool": {}}
    if must:
        clause["bool"]["must"] = must
    if must_not:
        clause["bool"]["must_not"] = must_not
    return clause


def _text_query(keywords: Sequence[str], lang: Optional[str]) -> Optional[Dict[str, Any]]:
    words = [str(k).strip() for k in keywords if str(k).strip()]
    if not words:
        return None
    # query_keywords may wrap phrases; flatten to text.
    text = " ".join(getattr(k, "text", None) or str(k) for k in words)
    if not text.strip():
        return None
    return {"multi_match": {"query": text, "fields": ["text", "head^2"], "type": "best_fields"}}


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
    if not collection_name or not es_client.configured():
        return []
    if document_ids is not None and not document_ids:
        return []
    if not _exists(collection_name):
        return []
    should = _text_query(keywords, lang)
    if required and not _text_query(required, None):
        return []
    filt = _filter_clause(collection_name, project_id, source_ids, document_ids)
    must: List[Dict[str, Any]] = [filt]
    if required:
        must.append(_text_query(required, None) or {"match_all": {}})
    if absent:
        absent_q = _text_query(absent, None)
        if absent_q:
            filt = {"bool": {"must": [filt], "must_not": [absent_q]}}
            must[0] = filt
    query: Dict[str, Any] = {"bool": {"must": must}}
    if should:
        query["bool"]["should"] = [should]
        query["bool"]["minimum_should_match"] = 1
    try:
        result = es_client.get_es().search(
            index=_index(collection_name),
            query=query,
            size=max(1, int(limit)),
            _source=["chunk_id"],
        )
    except Exception as exc:
        logger.info("lexical ES search skipped for %s: %s", collection_name, exc)
        return []
    out: List[Tuple[str, float]] = []
    for rank, hit in enumerate(result.get("hits", {}).get("hits", []), start=1):
        cid = (hit.get("_source") or {}).get("chunk_id") or hit.get("_id")
        if cid:
            out.append((str(cid), float(rank)))
    return out


def term_counts(
    collection_name: Optional[str],
    project_id: Optional[str],
    keywords: Sequence[str],
    cap: int,
) -> Dict[str, int]:
    if not collection_name or not keywords or not es_client.configured() or not _exists(collection_name):
        return {}
    counts: Dict[str, int] = {}
    filt = _filter_clause(collection_name, project_id)
    client = es_client.get_es()
    for kw in dict.fromkeys(keywords):
        q = _text_query([kw], None)
        if not q:
            continue
        try:
            result = client.count(
                index=_index(collection_name),
                query={"bool": {"must": [filt, q]}},
            )
            counts[str(kw)] = min(int(result.get("count") or 0), int(cap))
        except Exception as exc:
            logger.info("lexical ES term count skipped for %s/%s: %s", collection_name, kw, exc)
    return counts


def project_words(project_id: Optional[str], words: Sequence[str]) -> Optional[Set[str]]:
    if not project_id or not words or not es_client.configured():
        return None
    found: Set[str] = set()
    names = es_client.list_collection_names()
    for name in names:
        counts = term_counts(name, project_id, words, cap=1)
        found.update(k for k, n in counts.items() if n > 0)
    return found


def project_mentions(project_id: Optional[str], words: Sequence[str]) -> bool:
    queried = [w for w in dict.fromkeys(words) if str(w).strip()]
    found = project_words(project_id, queried) if queried else None
    return found is not None and set(queried) <= found


def page_documents(
    collection_name: Optional[str],
    project_id: Optional[str],
    chunk_ids: Sequence[str],
    max_chunks: int,
) -> List[str]:
    if not collection_name or not chunk_ids or not es_client.configured() or not _exists(collection_name):
        return []
    try:
        result = es_client.get_es().search(
            index=_index(collection_name),
            query={"terms": {"chunk_id": [str(c) for c in chunk_ids]}},
            size=min(10000, max(1, len(chunk_ids))),
            _source=["document_id", "source_file"],
        )
    except Exception as exc:
        logger.info("lexical ES page lookup skipped for %s: %s", collection_name, exc)
        return []
    doc_ids = []
    for hit in result.get("hits", {}).get("hits", []):
        src = hit.get("_source") or {}
        did = src.get("document_id")
        source_file = src.get("source_file") or ""
        if did and source_file != f"crawl_source_{did}":
            doc_ids.append(str(did))
    unique = list(dict.fromkeys(doc_ids))
    kept: List[str] = []
    for did in unique:
        try:
            count = es_client.get_es().count(
                index=_index(collection_name),
                query={"bool": {"must": [{"term": {"document_id": did}}] + (
                    [{"term": {"project_id": str(project_id)}}] if project_id else []
                )}},
            ).get("count") or 0
        except Exception:
            continue
        if 0 < int(count) <= int(max_chunks):
            kept.append(did)
    return kept


def has_rows(collection_name: Optional[str]) -> bool:
    if not collection_name or not es_client.configured():
        return False
    now = time.monotonic()
    cached = _has_rows_cache.get(collection_name)
    if cached and now - cached[1] < _HAS_ROWS_TTL_SECONDS:
        return cached[0]
    try:
        present = _exists(collection_name) and es_client.get_es().count(index=_index(collection_name)).get("count", 0) > 0
    except Exception:
        present = False
    _has_rows_cache[collection_name] = (bool(present), now)
    return bool(present)


def count_rows(collection_name: str) -> int:
    if not collection_name or not _exists(collection_name):
        return 0
    return int(es_client.get_es().count(index=_index(collection_name)).get("count") or 0)


def count_outdated_rows(collection_name: str) -> int:
    return 0


def delete_outdated_rows(collection_name: str) -> int:
    return 0
