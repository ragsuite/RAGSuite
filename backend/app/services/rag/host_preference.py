"""Soft-prefer each crawl source's primary host (base_url) over sibling subdomains.

Crawl of ``https://example.com`` may also index ``docs.example.com`` under the same
source. These helpers only reorder candidates (stable, never drop) so apex/www pages
rank ahead of docs/blog sibling hosts when both appear in the fused pool — unless a
sibling is clearly more similar, or the caller skips sibling demotion (setup queries).
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Mapping, Optional, Tuple
from urllib.parse import urlsplit

from . import denylist_filter


def _normalized_host(url: str) -> str:
    host = (urlsplit(url if "://" in (url or "") else f"https://{url or ''}").hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _registrable_host(host: str) -> str:
    parts = (host or "").split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host or ""


def host_rank(url: str, primary_host: str) -> int:
    """Lower is better: primary/www=0, same-site sibling subdomain=1+, foreign=3."""
    primary = (primary_host or "").lower().removeprefix("www.")
    if not primary or primary.startswith("doc:"):
        return 1
    host = _normalized_host(url)
    if not host:
        return 1
    if host == primary:
        return 0
    root = _registrable_host(host)
    primary_root = _registrable_host(primary)
    if root != primary_root:
        return 3
    # Sibling subdomain of the crawl base host (docs., blog., …).
    suffix = f".{primary_root}"
    if host.endswith(suffix):
        prefix = host[: -len(suffix)]
        return 1 + (prefix.count(".") if prefix else 0)
    return 2


def similarity_margin() -> float:
    """Sibling may stay ahead when its similarity exceeds best primary by more than this."""
    try:
        return max(0.0, float(os.getenv("RAG_HOST_PREFERENCE_MARGIN", "0.08")))
    except ValueError:
        return 0.08


def _entry_url(entry: Dict[str, Any]) -> str:
    meta = entry.get("meta") if isinstance(entry.get("meta"), dict) else {}
    return denylist_filter.chunk_url(meta)


def _entry_source_id(entry: Dict[str, Any]) -> str:
    meta = entry.get("meta") if isinstance(entry.get("meta"), dict) else {}
    return denylist_filter.chunk_crawl_source_id(meta)


def _similarity(entry: Dict[str, Any]) -> float:
    try:
        return 1.0 - float(entry.get("dist", 1.0))
    except (TypeError, ValueError):
        return 0.0


def prefer_primary_host(
    entries: List[Dict[str, Any]],
    primary_by_source_id: Mapping[str, str],
    *,
    skip_sibling_demotion: bool = False,
    margin: Optional[float] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Soft-prefer crawl base_url host over siblings. Never drop.

    When ``skip_sibling_demotion`` is true (setup/install queries), leave fused order
    unchanged so a closer docs.* chunk is not forced behind apex marketing pages.

    Otherwise demote same-site siblings only when they are not clearly more similar
    than the best primary-host chunk (margin, default 0.08).
    """
    if not entries or not primary_by_source_id:
        return entries, {"applied": False, "reason": "no_registry"}
    if skip_sibling_demotion:
        return entries, {"applied": False, "reason": "setup_skip_sibling"}

    ranks: List[int] = []
    saw_primary = False
    saw_sibling = False
    best_primary_sim = 0.0
    for entry in entries:
        sid = _entry_source_id(entry)
        primary = ""
        if sid:
            primary = (
                primary_by_source_id.get(sid)
                or primary_by_source_id.get(sid.lower())
                or ""
            )
        rank = host_rank(_entry_url(entry), primary)
        ranks.append(rank)
        if rank == 0:
            saw_primary = True
            best_primary_sim = max(best_primary_sim, _similarity(entry))
        elif rank >= 1 and primary and not str(primary).startswith("doc:"):
            # Only count same-site sibling demotion when we know the crawl primary.
            if rank < 3:
                saw_sibling = True

    if not (saw_primary and saw_sibling):
        return entries, {"applied": False, "reason": "no_mix"}

    gap = similarity_margin() if margin is None else max(0.0, float(margin))

    def _sort_key(pair: Tuple[int, Dict[str, Any]]) -> Tuple[int, float, int]:
        idx, entry = pair
        rank = ranks[idx]
        sim = _similarity(entry)
        if rank == 0:
            # Primary band: similarity desc, then stable index.
            return (0, -sim, idx)
        if 0 < rank < 3:
            if sim > best_primary_sim + gap:
                # Clearly closer sibling competes in the primary band.
                return (0, -sim, idx)
            return (1, float(idx), idx)
        return (2, float(idx), idx)

    indexed = list(enumerate(entries))
    indexed.sort(key=_sort_key)
    ranked = [entry for _, entry in indexed]
    demoted = 0
    promoted = 0
    for idx, entry in enumerate(entries):
        rank = ranks[idx]
        if rank == 0:
            promoted += 1
        elif 0 < rank < 3 and not (_similarity(entry) > best_primary_sim + gap):
            demoted += 1
    return ranked, {
        "applied": ranked != list(entries),
        "reason": "primary_host",
        "promoted": promoted,
        "demoted": demoted,
        "margin": gap,
    }


def primary_hosts_for_project(project_id: Optional[str]) -> Dict[str, str]:
    """``crawl_source_id → www-stripped base_url host`` from the source-routing registry."""
    from . import source_routing

    project_uuid = source_routing._valid_project_uuid(project_id)
    if project_uuid is None:
        return {}
    try:
        _phrases, host_of = source_routing._registry(project_uuid)
    except Exception:
        return {}
    return {
        sid: host
        for sid, host in (host_of or {}).items()
        if host and not str(host).startswith("doc:")
    }
