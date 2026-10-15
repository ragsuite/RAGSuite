"""Evidence chunks for catalog records: the pages the exact item query selected.

One metadata-filtered ``get`` (fast even on large collections, unlike a filtered vector
query) fetches every chunk of the selected pages; per page the chunk that carries the
record's own values (name, price) wins, ties broken by similarity to the question.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .hybrid_fusion import cosine_distance

logger = logging.getLogger(__name__)

# Exact structured matches are strong evidence even when the page text is phrased far
# from the question ("mobiles under 15000" vs a product page), so their distance is
# capped: they are never hidden by similarity display floors.
RECORD_MAX_DISTANCE = 0.45
MAX_CHUNKS_PER_FETCH = 400
RecordRequest = Tuple[str, Sequence[str]]


def _where(document_ids: List[str], project_id: Optional[str], user_id: Optional[int]) -> Dict[str, Any]:
    conditions: List[Dict[str, Any]] = [{"document_id": {"$in": document_ids}}]
    if project_id is not None:
        conditions.append({"project_id": str(project_id)})
    if user_id is not None:
        conditions.append({"user_id": user_id})
    return conditions[0] if len(conditions) == 1 else {"$and": conditions}


def _hint_score(text: str, hints: Sequence[str]) -> int:
    low = (text or "").lower()
    return sum(1 for h in hints if h and h.lower() in low)


def fetch_entries(
    vdb: Any,
    requests: Sequence[RecordRequest],
    *,
    collection_name: Optional[str],
    project_id: Optional[str],
    user_id: Optional[int],
    query_vector: Optional[List[float]] = None,
) -> List[Dict[str, Any]]:
    """Fusion entries (``doc/id/meta/dist/origins``) in request order, one per page."""
    document_ids = [str(doc_id) for doc_id, _ in requests if doc_id]
    if not document_ids:
        return []
    collection = vdb.get_collection(collection_name)
    raw = collection.get(
        where=_where(document_ids, project_id, user_id),
        limit=MAX_CHUNKS_PER_FETCH,
        include=["documents", "metadatas", "embeddings"],
    ) or {}
    docs = list(raw.get("documents") or [])
    metas = list(raw.get("metadatas") or [])
    embs = raw.get("embeddings")
    embs = list(embs) if embs is not None else []
    hints = {str(doc_id): list(h) for doc_id, h in requests}
    best: Dict[str, Tuple[Tuple[int, float, int], Dict[str, Any]]] = {}
    for i, doc in enumerate(docs):
        meta = metas[i] if i < len(metas) and isinstance(metas[i], dict) else {}
        doc_id = str(meta.get("document_id") or "")
        if not doc_id or not str(doc or "").strip():
            continue
        dist = cosine_distance(query_vector, embs[i]) if query_vector is not None and i < len(embs) else None
        dist = RECORD_MAX_DISTANCE if dist is None else min(dist, RECORD_MAX_DISTANCE)
        try:
            chunk_index = int(meta.get("chunk_index") or 0)
        except (TypeError, ValueError):
            chunk_index = 0
        rank = (-_hint_score(doc, hints.get(doc_id, ())), dist, chunk_index)
        current = best.get(doc_id)
        if current is None or rank < current[0]:
            emb = embs[i] if i < len(embs) else None
            best[doc_id] = (
                rank,
                {"doc": doc, "id": doc_id, "meta": meta, "dist": dist, "origins": {"record"}, "emb": emb},
            )
    return [best[d][1] for d in document_ids if d in best]


def apply_query_vector(entries: List[Dict[str, Any]], query_vector: Optional[List[float]]) -> List[Dict[str, Any]]:
    """Real (capped) distances once the query vector is known; drops the raw embeddings."""
    out = []
    for entry in entries:
        emb = entry.pop("emb", None)
        dist = cosine_distance(query_vector, emb) if query_vector is not None and emb is not None else None
        if dist is not None:
            entry["dist"] = min(dist, RECORD_MAX_DISTANCE)
        out.append(entry)
    return out
