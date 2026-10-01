"""Nearest chunks *within* the sources a query names (see ``source_routing``).

Chroma's filtered HNSW search degrades badly when the filter matches only a few
chunks (a 1-chunk PDF took >40s on a 30k collection), while metadata-only ``get``
stays fast. So: list the routed chunk ids first; small sources are ranked locally by
cosine distance, and only large sources use the filtered vector query.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from . import source_routing
from .hybrid_fusion import cosine_distance

logger = logging.getLogger(__name__)

RankedList = Tuple[List[str], List[str], List[Any], List[float]]
_EMPTY: RankedList = ([], [], [], [])


def _small_limit() -> int:
    try:
        return max(1, int(os.environ.get("RAG_SCOPED_LOCAL_RANK_MAX", "150")))
    except ValueError:
        return 150


def _where(source_where: Dict[str, Any], user_id: Optional[int], project_id: Optional[str]) -> Dict[str, Any]:
    conditions: List[Dict[str, Any]] = [source_where]
    if user_id is not None:
        conditions.append({"user_id": user_id})
    if project_id is not None:
        conditions.append({"project_id": str(project_id)})
    return conditions[0] if len(conditions) == 1 else {"$and": conditions}


def _rank_locally(collection, ids: List[str], embedding: List[float], top_k: int) -> RankedList:
    raw = collection.get(ids=ids, include=["documents", "metadatas", "embeddings"])
    docs = list(raw.get("documents") or [])
    metas = list(raw.get("metadatas") or [])
    embs = raw.get("embeddings")
    embs = list(embs) if embs is not None else []
    scored: List[Tuple[float, str, Any]] = []
    for i, doc in enumerate(docs):
        if not doc or not str(doc).strip() or i >= len(embs):
            continue
        dist = cosine_distance(embedding, embs[i])
        if dist is None:
            continue
        scored.append((dist, doc, metas[i] if i < len(metas) else None))
    scored.sort(key=lambda row: row[0])
    top = scored[:top_k]
    return (
        [row[1] for row in top],
        [(row[2] or {}).get("document_id", "unknown") if isinstance(row[2], dict) else "unknown" for row in top],
        [row[2] for row in top],
        [row[0] for row in top],
    )


def query_routed_sources(
    vdb: Any,
    embedding: List[float],
    source_ids: List[str],
    *,
    top_k: int,
    user_id: Optional[int],
    project_id: Optional[str],
    collection_name: Optional[str],
) -> RankedList:
    """Top ``top_k`` chunks of ``source_ids`` by cosine distance to ``embedding``."""
    if not source_ids or embedding is None:
        return _EMPTY
    from .singleton import chroma_read_lock

    where = _where(source_routing.chroma_where(source_ids, project_id=project_id), user_id, project_id)
    collection = vdb.get_collection(collection_name)
    limit = _small_limit()
    with chroma_read_lock(collection_name):
        ids = list((collection.get(where=where, limit=limit + 1, include=[]) or {}).get("ids") or [])
        if not ids:
            return _EMPTY
        if len(ids) <= limit:
            return _rank_locally(collection, ids, embedding, top_k)
        res = collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            where=where,
            include=["documents", "distances", "metadatas"],
        )
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    doc_ids = [m.get("document_id", "unknown") if isinstance(m, dict) else "unknown" for m in metas]
    return docs, doc_ids, metas, dists
