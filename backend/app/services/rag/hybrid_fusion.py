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
# Exact matches of an identifier named in the question ("EK-H1", "1.2024") form a third
# list: their pages outrank pages that only share common words, and the cosine floors
# never drop them (a spec table is semantically far from a conversational question).
EXACT_WEIGHT = 1.0
# Chunks holding a query word found in only a few chunks ("founded in 2015 by …") form a
# fourth list, so a fact stated once is not outranked by chrome repeating a common query
# word; unlike identifier hits they still pass the cosine floors. They rank behind both
# identifier tiers in the keyword list, so at weight 1.0 a brand name scoped like an
# identifier ("SUGAR Cosmetics") keeps them below the prompt's character budget.
RARE_WEIGHT = 1.5
# Pages of catalog items matched by name, identifier or filter: the strongest evidence
# for item questions, never dropped by the cosine floors (like exact identifier hits).
RECORD_WEIGHT = 2.0
_KEYWORD_ORIGINS = frozenset({"keyword", "exact", "rare", "record"})
_FLOOR_EXEMPT_ORIGINS = frozenset({"exact", "record"})
# A site header/footer lists every product name, so it matches any product question;
# beyond this many it only takes context slots from the pages that answer it.
MAX_SITE_BLOCK_CHUNKS = 1


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
    A key counts once per list and ranks advance only on new keys, so copies of one
    chunk (the same page ingested several times) neither add up nor push others down.
    """
    fused: Dict[str, Dict[str, Any]] = {}
    for (docs, ids, metas, dists), weight, origin in weighted_lists:
        seen: set = set()
        rank = -1
        for doc, doc_id, meta, dist in zip(docs, ids, metas, dists):
            if not doc or not str(doc).strip():
                continue
            key = key_fn(doc, meta)
            if key in seen:
                continue
            seen.add(key)
            rank += 1
            entry = fused.setdefault(
                key,
                {"key": key, "doc": doc, "id": doc_id, "meta": meta, "score": 0.0,
                 "sem_dist": None, "kw_dist": None, "origins": set()},
            )
            entry["score"] += weight / (k + rank + 1)
            entry["origins"].add(origin)
            d = float(dist) if dist is not None else 1.0
            if origin in _KEYWORD_ORIGINS:
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
        if not _FLOOR_EXEMPT_ORIGINS & entry["origins"]:
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


def defer_site_blocks(entries: List[Dict[str, Any]], keep: int = MAX_SITE_BLOCK_CHUNKS) -> List[Dict[str, Any]]:
    """Site header/footer chunks after the first ``keep`` move to the end (stable)."""
    from .chunk_context import is_site_block

    head: List[Dict[str, Any]] = []
    deferred: List[Dict[str, Any]] = []
    for entry in entries:
        if is_site_block(entry.get("meta")):
            if keep > 0:
                keep -= 1
            else:
                deferred.append(entry)
                continue
        head.append(entry)
    return head + deferred if deferred else entries


def _body_key(doc: str) -> str:
    norm = re.sub(r"[\W_]+", " ", (doc or "").lower())
    return re.sub(r"\s+", " ", norm).strip()[:300]


NEAR_DUPLICATE_WORD_OVERLAP = 0.5
_WORD_RE = re.compile(r"\w+", re.UNICODE)


class ChunkIdentity:
    """Dedupe keys where one key (URL + chunk index) holds only near-identical text.

    A re-ingested page keeps its chunk boundaries, so its chunk N repeats the old chunk N;
    another extraction of the page (flat text vs. table) chunks differently, and its
    chunk N is other content that must not be collapsed away.
    """

    def __init__(self) -> None:
        self._variants: Dict[str, List[frozenset]] = {}

    def key(self, base: str, text: str) -> str:
        words = frozenset(_WORD_RE.findall((text or "").lower()))
        variants = self._variants.setdefault(base, [])
        for i, other in enumerate(variants):
            union = words | other
            if not union or len(words & other) / len(union) >= NEAR_DUPLICATE_WORD_OVERLAP:
                return base if i == 0 else f"{base}#{i}"
        variants.append(words)
        n = len(variants) - 1
        return base if n == 0 else f"{base}#{n}"


CROSS_PAGE_DUPLICATE_OVERLAP = 0.9
_SHINGLE = 3


class NearDuplicateBodies:
    """Chunks whose word 3-gram sets overlap >= 90% are one result, whatever their URL.

    Sites publish the same text under many URLs (tracking parameters, variant pages, store
    copies); without this, copies of one page fill every context slot.
    """

    def __init__(self, threshold: float = CROSS_PAGE_DUPLICATE_OVERLAP) -> None:
        self.threshold = threshold
        self._kept: List[frozenset] = []

    @staticmethod
    def _shingles(text: str) -> frozenset:
        words = _WORD_RE.findall((text or "").lower())
        if len(words) < _SHINGLE:
            return frozenset([" ".join(words)]) if words else frozenset()
        return frozenset(" ".join(words[i: i + _SHINGLE]) for i in range(len(words) - _SHINGLE + 1))

    def seen(self, text: str) -> bool:
        """True when ``text`` near-duplicates a kept body; otherwise remember it."""
        grams = self._shingles(text)
        if not grams:
            return False
        for other in self._kept:
            small, big = (grams, other) if len(grams) <= len(other) else (other, grams)
            if len(small) / len(big) < self.threshold:
                continue
            if len(grams & other) / len(grams | other) >= self.threshold:
                return True
        self._kept.append(grams)
        return False


def dedupe_preserving_order(
    entries: List[Dict[str, Any]],
    key_fn: KeyFn,
    top_k: int,
) -> RankedList:
    """Keep the first entry per dedupe key and per near-identical body, in ranked order."""
    identity = ChunkIdentity()
    near_dupes = NearDuplicateBodies()
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
        key = identity.key(key_fn(doc, entry.get("meta")), doc)
        body = _body_key(doc)
        if key in seen_keys or (body and body in seen_bodies) or near_dupes.seen(doc):
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
