"""Sources-table Chroma enrichment must honour its timeout and fail soft."""
import threading
import time

import pytest

from app.routes import crawl as crawl_routes


@pytest.fixture
def short_timeout(monkeypatch):
    monkeypatch.setattr(crawl_routes, "_SITES_CHROMA_TIMEOUT_SECONDS", 0.2)


def _patch_lookup(monkeypatch, fn):
    import app.services.reindex_service as reindex_service

    monkeypatch.setattr(reindex_service, "embedded_models_by_item_id", fn)


def test_returns_coverage_when_fast(monkeypatch, short_timeout):
    coverage = {"s1": [{"collection": "c", "provider": "p", "model": "m"}]}
    _patch_lookup(monkeypatch, lambda pid, candidate_ids: coverage)

    assert crawl_routes._sites_embedded_models("p1", {"s1"}) == coverage


def test_slow_scan_returns_empty_without_waiting_for_it(monkeypatch, short_timeout):
    release = threading.Event()

    def slow_lookup(pid, candidate_ids):
        release.wait(5)
        return {"s1": []}

    _patch_lookup(monkeypatch, slow_lookup)
    started = time.monotonic()
    try:
        result = crawl_routes._sites_embedded_models("p1", {"s1"})
        elapsed = time.monotonic() - started
    finally:
        release.set()

    assert result == {}
    assert elapsed < 1.5


def test_lookup_error_returns_empty(monkeypatch, short_timeout):
    def broken_lookup(pid, candidate_ids):
        raise RuntimeError("chroma down")

    _patch_lookup(monkeypatch, broken_lookup)

    assert crawl_routes._sites_embedded_models("p1", {"s1"}) == {}
