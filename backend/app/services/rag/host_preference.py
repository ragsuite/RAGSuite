"""Soft-prefer each crawl source's primary host (base_url) over sibling subdomains.

Crawl of ``https://example.com`` may also index ``docs.example.com`` under the same
source. These helpers only reorder candidates (stable, never drop) so apex/www pages
rank ahead of docs/blog sibling hosts when both appear in the fused pool.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
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


def _entry_url(entry: Dict[str, Any]) -> str:
    meta = entry.get("meta") if isinstance(entry.get("meta"), dict) else {}
    return denylist_filter.chunk_url(meta)


def _entry_source_id(entry: Dict[str, Any]) -> str:
    meta = entry.get("meta") if isinstance(entry.get("meta"), dict) else {}
    return denylist_filter.chunk_crawl_source_id(meta)


def prefer_primary_host(
    entries: List[Dict[str, Any]],
    primary_by_source_id: Mapping[str, str],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Stable-partition: crawl base_url host first, sibling hosts after. Never drop."""
    if not entries or not primary_by_source_id:
        return entries, {"applied": False, "reason": "no_registry"}

    ranks: List[int] = []
    saw_primary = False
    saw_sibling = False
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
        elif rank >= 1 and primary and not str(primary).startswith("doc:"):
            # Only count same-site sibling demotion when we know the crawl primary.
            if rank < 3:
                saw_sibling = True

    if not (saw_primary and saw_sibling):
        return entries, {"applied": False, "reason": "no_mix"}

    indexed = list(enumerate(entries))
    indexed.sort(key=lambda pair: (ranks[pair[0]], pair[0]))
    ranked = [entry for _, entry in indexed]
    return ranked, {
        "applied": ranked != list(entries),
        "reason": "primary_host",
        "promoted": sum(1 for r in ranks if r == 0),
        "demoted": sum(1 for r in ranks if 0 < r < 3),
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
