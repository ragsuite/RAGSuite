"""Hard source scope: restrict retrieval to the one source a query explicitly names.

Soft routing (``source_routing.match_source_ids``) only ranks named sources first.
When the query names exactly one source by a distinctive phrase — its site host
(``paysafecard``, ``t3planet``) or an uploaded document title — every retrieval list
is limited to that source, including fallbacks. Matches that come only from words in
a source's display name stay soft, because names often contain generic words.

Controlled by ``RAG_SOURCE_HARD_FILTER`` (default on).
"""
from __future__ import annotations

import os
from typing import Any, List, Optional, Sequence, Set, Tuple

from . import source_routing

RankedList = Tuple[List[str], List[str], List[Any], List[float]]


def is_enabled() -> bool:
    raw = (os.environ.get("RAG_SOURCE_HARD_FILTER") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _query_phrases(query: str) -> Set[str]:
    return {gram for _start, _end, gram in source_routing._query_ngrams(query)}


def hard_scope_ids(project_id: Optional[str], query: str, routed_ids: Sequence[str]) -> List[str]:
    """``routed_ids`` when they form one distinctly-named source, else ``[]``.

    Several crawl sources on the same host (e.g. two sections of one site) count as
    one source.
    """
    if not routed_ids or not is_enabled():
        return []
    project_uuid = source_routing._valid_project_uuid(project_id)
    if project_uuid is None:
        return []
    _phrases, host_of = source_routing._registry(project_uuid)
    hosts = {host_of.get(str(i), str(i)) for i in routed_ids}
    if len(hosts) != 1:
        return []
    host = next(iter(hosts))
    if host.startswith("doc:"):
        return [str(i) for i in routed_ids]
    if host in {str(i) for i in routed_ids}:
        # Unknown host key (id fallback): not distinctive enough to exclude others.
        return []
    if _query_phrases(query) & source_routing.host_phrases(host):
        return [str(i) for i in routed_ids]
    return []


def filter_ranked(lists: RankedList, source_ids: Set[str]) -> RankedList:
    """Keep only rows whose metadata belongs to ``source_ids`` (order preserved)."""
    docs, ids, metas, dists = lists
    keep = [i for i, meta in enumerate(metas) if source_routing.chunk_belongs_to(meta, source_ids)]
    return (
        [docs[i] for i in keep if i < len(docs)],
        [ids[i] for i in keep if i < len(ids)],
        [metas[i] for i in keep],
        [dists[i] for i in keep if i < len(dists)],
    )
