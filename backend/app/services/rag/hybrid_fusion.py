"""Rank fusion helpers for large-collection hybrid retrieval.

Reciprocal Rank Fusion (RRF) depends only on ranks, so semantic and keyword evidence
combine the same way whatever the embedding model's similarity scale is. Distances in
the fused output stay *real* cosine distances (keyword-only hits are scored against the
query vector), so similarity thresholds, confidence and display percentages remain
comparable across chunks.
"""
from __future__ import annotations

import math
import re
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple

RankedList = Tuple[List[str], List[str], List[Any], List[float]]
KeyFn = Callable[[str, Any], str]

RRF_K = 60
SEMANTIC_WEIGHT = 1.0
SCOPED_WEIGHT = 1.0
# Equal weights interleave the best semantic and full-text hits; any lower weight
# pushes the top full-text hit below semantic rank ~10, i.e. out of every top_k.
# Keyword-only noise is removed by the true-cosine floors in resolve_distances.
KEYWORD_WEIGHT = 1.0
# Keyword-only hits must stay semantically close to the best semantic hit.
KEYWORD_ONLY_RELATIVE_FLOOR = 0.75


def cosine_distance(query_vec: Sequence[float], vec: Sequence[float]) -> Optional[float]:
    if query_vec is None or vec is None:
        return None
    try:
        dot = sum(float(a) * float(b) for a, b in zip(query_vec, vec))
        nq = math.sqrt(sum(float(a) * float(a) for a in query_vec))
        nv = math.sqrt(sum(float(b) * float(b) for b in vec))
    except (TypeError, ValueError):
        return None
    if nq == 0 or nv == 0:
        return None
    return max(0.0, min(2.0, 1.0 - dot / (nq * nv)))


def rrf_fuse(
    weighted_lists: Iterable[Tuple[RankedList, float, str]],
    key_fn: KeyFn,
    k: int = RRF_K,
) -> List[Dict[str, Any]]:
    """Fuse ranked lists; returns entries sorted by fused score (best first).

    Each entry keeps the best semantic distance seen (``sem_dist``), the keyword
    pseudo-distance (``kw_dist``) and which lists contributed (``origins``).
    """
    fused: Dict[str, Dict[str, Any]] = {}
    for (docs, ids, metas, dists), weight, origin in weighted_lists:
        for rank, (doc, doc_id, meta, dist) in enumerate(zip(docs, ids, metas, dists)):
            if not doc or not str(doc).strip():
                continue
            key = key_fn(doc, meta)
            entry = fused.setdefault(
                key,
                {"key": key, "doc": doc, "id": doc_id, "meta": meta, "score": 0.0,
                 "sem_dist": None, "kw_dist": None, "origins": set()},
            )
            entry["score"] += weight / (k + rank + 1)
            entry["origins"].add(origin)
            d = float(dist) if dist is not None else 1.0
            if origin == "keyword":
                entry["kw_dist"] = d if entry["kw_dist"] is None else min(entry["kw_dist"], d)
            else:
                entry["sem_dist"] = d if entry["sem_dist"] is None else min(entry["sem_dist"], d)
    return sorted(fused.values(), key=lambda e: e["score"], reverse=True)


def resolve_distances(
    entries: List[Dict[str, Any]],
    *,
    query_vec: Optional[Sequence[float]],
    keyword_embeddings: Dict[str, Sequence[float]],
    similarity_threshold: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Attach a real cosine ``dist`` to every entry; drop weak keyword-only noise."""
    sem_sims = [1.0 - e["sem_dist"] for e in entries if e["sem_dist"] is not None]
    top_sem_sim = max(sem_sims) if sem_sims else None
    out: List[Dict[str, Any]] = []
    for entry in entries:
        if entry["sem_dist"] is not None:
            entry["dist"] = entry["sem_dist"]
            out.append(entry)
            continue
        true_dist = cosine_distance(query_vec, keyword_embeddings.get(entry["key"])) if query_vec else None
        if true_dist is None:
            entry["dist"] = entry["kw_dist"] if entry["kw_dist"] is not None else 1.0
            out.append(entry)
            continue
        sim = 1.0 - true_dist
        if similarity_threshold is not None and sim < similarity_threshold:
            continue
        if top_sem_sim is not None and sim < top_sem_sim * KEYWORD_ONLY_RELATIVE_FLOOR:
            continue
        entry["dist"] = true_dist
        out.append(entry)
    return out


def prioritize_routed(entries: List[Dict[str, Any]], routed_ids: Set[str]) -> List[Dict[str, Any]]:
    """Stable partition: chunks of sources named in the query come first."""
    if not routed_ids:
        return entries
    from .source_routing import chunk_belongs_to

    flags = [chunk_belongs_to(e.get("meta"), routed_ids) for e in entries]
    return [e for e, f in zip(entries, flags) if f] + [e for e, f in zip(entries, flags) if not f]


def _body_key(doc: str) -> str:
    norm = re.sub(r"[\W_]+", " ", (doc or "").lower())
    return re.sub(r"\s+", " ", norm).strip()[:300]


def dedupe_preserving_order(
    entries: List[Dict[str, Any]],
    key_fn: KeyFn,
    top_k: int,
) -> RankedList:
    """Keep the first entry per dedupe key and per near-identical body, in ranked order."""
    seen_keys: Set[str] = set()
    seen_bodies: Set[str] = set()
    docs: List[str] = []
    ids: List[str] = []
    metas: List[Any] = []
    dists: List[float] = []
    for entry in entries:
        doc = entry.get("doc") or ""
        if not str(doc).strip():
            continue
        key = key_fn(doc, entry.get("meta"))
        body = _body_key(doc)
        if key in seen_keys or (body and body in seen_bodies):
            continue
        seen_keys.add(key)
        if body:
            seen_bodies.add(body)
        docs.append(doc)
        ids.append(entry.get("id") or "unknown")
        metas.append(entry.get("meta"))
        dists.append(float(entry.get("dist", 1.0)))
        if len(docs) >= max(1, int(top_k)):
            break
    return docs, ids, metas, dists


def entries_from_lists(docs: List[str], ids: List[str], metas: List[Any], dists: List[float]) -> List[Dict[str, Any]]:
    return [
        {"doc": d, "id": i, "meta": m, "dist": float(x) if x is not None else 1.0}
        for d, i, m, x in zip(docs, ids, metas, dists)
    ]


def merge_by_distance(primary: RankedList, extra: RankedList, key_fn: KeyFn) -> RankedList:
    """Union of two semantic lists (best distance per chunk), sorted by distance."""
    best: Dict[str, Tuple[float, int, str, str, Any]] = {}
    position = 0
    for docs, ids, metas, dists in (primary, extra):
        for doc, doc_id, meta, dist in zip(docs, ids, metas, dists):
            if not doc or not str(doc).strip():
                continue
            key = key_fn(doc, meta)
            d = float(dist) if dist is not None else 1.0
            if key not in best or d < best[key][0]:
                best[key] = (d, best[key][1] if key in best else position, doc, doc_id, meta)
            position += 1
    ranked = sorted(best.values(), key=lambda row: (row[0], row[1]))
    return (
        [row[2] for row in ranked],
        [row[3] for row in ranked],
        [row[4] for row in ranked],
        [row[0] for row in ranked],
    )


def filter_by_similarity(lists: RankedList, threshold: Optional[float]) -> RankedList:
    if threshold is None:
        return lists
    docs, ids, metas, dists = lists
    keep = [i for i, d in enumerate(dists) if (1.0 - float(d)) >= threshold]
    return (
        [docs[i] for i in keep],
        [ids[i] for i in keep],
        [metas[i] for i in keep],
        [dists[i] for i in keep],
    )
