"""Sources-table Chroma enrichment must honour its timeout, fail soft and never stack scans."""
import threading
import time
import uuid

import pytest

from app.routes import crawl as crawl_routes
from app.services import crawl_sites_coverage


@pytest.fixture(autouse=True)
def short_timeout(monkeypatch):
    monkeypatch.setattr(crawl_routes, "_SITES_CHROMA_TIMEOUT_SECONDS", 0.2)
    crawl_sites_coverage.clear()
    yield
    crawl_sites_coverage.clear()


@pytest.fixture
def project():
    return f"p-{uuid.uuid4().hex}"


def _patch_lookup(monkeypatch, fn):
    import app.services.reindex_service as reindex_service

    monkeypatch.setattr(reindex_service, "embedded_models_by_item_id", fn)


def test_returns_coverage_when_fast(monkeypatch, project):
    coverage = {"s1": [{"collection": "c", "provider": "p", "model": "m"}]}
    _patch_lookup(monkeypatch, lambda pid, candidate_ids: coverage)

    assert crawl_routes._sites_embedded_models(project, {"s1"}) == coverage


def test_slow_scan_returns_empty_without_waiting_for_it(monkeypatch, project):
    release = threading.Event()

    def slow_lookup(pid, candidate_ids):
        release.wait(5)
        return {"s1": []}

    _patch_lookup(monkeypatch, slow_lookup)
    started = time.monotonic()
    try:
        result = crawl_routes._sites_embedded_models(project, {"s1"})
        elapsed = time.monotonic() - started
    finally:
        release.set()

    assert result == {}
    assert elapsed < 1.5


def test_lookup_error_returns_empty(monkeypatch, project):
    def broken_lookup(pid, candidate_ids):
        raise RuntimeError("chroma down")

    _patch_lookup(monkeypatch, broken_lookup)

    assert crawl_routes._sites_embedded_models(project, {"s1"}) == {}


def test_polls_share_one_running_scan(monkeypatch, project):
    release = threading.Event()
    calls = []

    def slow_lookup(pid, candidate_ids):
        calls.append(pid)
        release.wait(5)
        return {"s1": []}

    _patch_lookup(monkeypatch, slow_lookup)
    try:
        for _ in range(3):
            assert crawl_routes._sites_embedded_models(project, {"s1"}) == {}
    finally:
        release.set()

    assert calls == [project]


def test_recent_coverage_is_reused(monkeypatch, project):
    calls = []

    def lookup(pid, candidate_ids):
        calls.append(pid)
        return {"s1": []}

    _patch_lookup(monkeypatch, lookup)
    crawl_routes._sites_embedded_models(project, {"s1"})
    crawl_routes._sites_embedded_models(project, {"s1"})

    assert calls == [project]


def test_slow_refresh_serves_last_known_coverage(monkeypatch, project):
    coverage = {"s1": [{"collection": "c", "provider": "p", "model": "m"}]}
    _patch_lookup(monkeypatch, lambda pid, candidate_ids: coverage)
    assert crawl_routes._sites_embedded_models(project, {"s1"}) == coverage

    monkeypatch.setattr(crawl_sites_coverage, "CACHE_TTL_SECONDS", 0.0)
    release = threading.Event()

    def slow_lookup(pid, candidate_ids):
        release.wait(5)
        return {}

    _patch_lookup(monkeypatch, slow_lookup)
    try:
        assert crawl_routes._sites_embedded_models(project, {"s1"}) == coverage
    finally:
        release.set()
