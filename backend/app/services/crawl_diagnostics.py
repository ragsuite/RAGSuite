"""In-memory crawl diagnostics: skipped/failed URLs with referrer tracking."""

from __future__ import annotations

from threading import Lock
from typing import Any, Optional


class CrawlDiagnosticsCollector:
    """Thread-safe collector for skipped/failed URL diagnostics with referrers."""

    DEFAULT_MAX_TRACKED = 10000
    DEFAULT_MAX_REFERRERS_PER_URL = 5

    def __init__(
        self,
        max_tracked: int = DEFAULT_MAX_TRACKED,
        max_referrers_per_url: int = DEFAULT_MAX_REFERRERS_PER_URL,
    ) -> None:
        self._max_tracked = max_tracked
        self._max_referrers = max_referrers_per_url
        self._lock = Lock()
        self._referrer_index: dict[str, set[str]] = {}
        self._referrer_truncated: set[str] = set()
        self._skipped: dict[tuple[str, str], dict[str, Any]] = {}
        self._failed: dict[tuple[str, str, Optional[int]], dict[str, Any]] = {}
        self._skipped_total = 0
        self._failed_total = 0

    def note_discovery(self, target_url: str, parent_url: str) -> None:
        """Record that parent_url links to target_url."""
        if not target_url or not parent_url or target_url == parent_url:
            return
        with self._lock:
            refs = self._referrer_index.setdefault(target_url, set())
            if parent_url in refs:
                return
            if len(refs) >= self._max_referrers:
                self._referrer_truncated.add(target_url)
                return
            refs.add(parent_url)

    def record_skipped(self, url: str, reason: str) -> None:
        if reason == "no_content_change":
            self._upsert_skipped(url, reason, include_referrers=False)
            return
        self._upsert_skipped(url, reason, include_referrers=True)

    def record_failed(
        self,
        url: str,
        reason: str,
        status_code: Optional[int] = None,
        attempt_count: Optional[int] = None,
    ) -> None:
        key = (url, reason, status_code)
        with self._lock:
            is_new = key not in self._failed
            if is_new:
                self._failed_total += 1
            if len(self._failed) >= self._max_tracked and key not in self._failed:
                return
            payload: dict[str, Any] = {
                "url": url,
                "reason": reason,
                **self._referrer_payload(url),
            }
            if status_code is not None:
                payload["status_code"] = status_code
            if attempt_count is not None:
                payload["attempt_count"] = attempt_count
            self._failed[key] = payload

    def _upsert_skipped(self, url: str, reason: str, *, include_referrers: bool) -> None:
        key = (url, reason)
        with self._lock:
            is_new = key not in self._skipped
            if is_new:
                self._skipped_total += 1
            if len(self._skipped) >= self._max_tracked and key not in self._skipped:
                return
            payload: dict[str, Any] = {"url": url, "reason": reason}
            if include_referrers:
                payload.update(self._referrer_payload(url))
            else:
                # Explicit empty list so callers can rely on the key always existing.
                payload["referrers"] = []
            self._skipped[key] = payload

    def _referrer_payload(self, url: str) -> dict[str, Any]:
        refs = sorted(self._referrer_index.get(url, set()))
        payload: dict[str, Any] = {"referrers": refs}
        if url in self._referrer_truncated:
            payload["referrers_truncated"] = True
        return payload

    def finalize(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, int]:
        with self._lock:
            skipped = list(self._skipped.values())[: self._max_tracked]
            failed = list(self._failed.values())[: self._max_tracked]
            skipped_total = self._skipped_total
            failed_total = self._failed_total
        return skipped, failed, skipped_total, failed_total
