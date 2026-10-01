"""Response shaping for crawl-run URL lists (crawled / skipped / failed).

Large crawls store tens of thousands of URL entries in the ``crawl_diagnostics``
entry of ``CrawlJob.errors``. These helpers page, filter and trim those lists for
API responses only — the stored job data is never modified.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

UrlKind = Literal["crawled", "skipped", "failed"]
UrlSort = Literal["url", "referrer"]

URL_LIST_KEYS: dict[str, str] = {
    "crawled": "crawled_urls",
    "skipped": "skipped_urls",
    "failed": "failed_urls",
}


def find_crawl_diagnostics(errors: Any) -> dict:
    if isinstance(errors, list):
        for entry in errors:
            if isinstance(entry, dict) and entry.get("type") == "crawl_diagnostics":
                return entry
    return {}


def _normalize_entry(item: Any) -> Optional[dict]:
    if isinstance(item, str):
        return {"url": item}
    if isinstance(item, dict) and isinstance(item.get("url"), str):
        return item
    return None


def stored_url_entries(diagnostics: dict, kind: UrlKind) -> list[dict]:
    raw = diagnostics.get(URL_LIST_KEYS[kind])
    if not isinstance(raw, list):
        return []
    entries = (_normalize_entry(item) for item in raw)
    return [entry for entry in entries if entry is not None]


def _referrers(entry: dict) -> list[str]:
    refs = entry.get("referrers")
    return [r for r in refs if isinstance(r, str)] if isinstance(refs, list) else []


def _matches(entry: dict, needle: str) -> bool:
    if needle in entry["url"].lower():
        return True
    return any(needle in ref.lower() for ref in _referrers(entry))


def _sort_key(sort: UrlSort):
    if sort == "referrer":
        return lambda e: ((_referrers(e) or [""])[0], e["url"])
    return lambda e: e["url"]


def page_url_entries(
    diagnostics: dict,
    kind: UrlKind,
    *,
    offset: int = 0,
    limit: int = 100,
    q: Optional[str] = None,
    sort: UrlSort = "url",
) -> tuple[list[dict], int]:
    """Return ``(page, total)`` for one URL list after filtering and sorting."""
    entries = stored_url_entries(diagnostics, kind)
    needle = (q or "").strip().lower()
    if needle:
        entries = [e for e in entries if _matches(e, needle)]
    entries.sort(key=_sort_key(sort))
    start = max(0, offset)
    return entries[start : start + max(0, limit)], len(entries)


def url_list_totals(diagnostics: dict) -> dict[str, int]:
    """Number of stored entries per list (what the paging endpoint can return)."""
    return {
        "skipped_urls_total": len(stored_url_entries(diagnostics, "skipped")),
        "failed_urls_total": len(stored_url_entries(diagnostics, "failed")),
    }


def errors_without_url_lists(errors: Any) -> list:
    """Copy of ``errors`` with URL arrays removed from the diagnostics entry."""
    if not isinstance(errors, list):
        return []
    trimmed: list = []
    for entry in errors:
        if isinstance(entry, dict) and entry.get("type") == "crawl_diagnostics":
            trimmed.append({k: v for k, v in entry.items() if k not in URL_LIST_KEYS.values()})
        else:
            trimmed.append(entry)
    return trimmed
