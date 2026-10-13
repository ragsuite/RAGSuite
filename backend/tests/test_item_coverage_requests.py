"""Embedding item coverage on the request path: bounded wait, shared passes, last known fallback."""
import threading
import time
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.routes import embeddings as embedding_routes
from app.services import item_coverage_requests as icr


@pytest.fixture(autouse=True)
def short_waits(monkeypatch):
    monkeypatch.setattr(icr, "FIRST_PASS_WAIT_SECONDS", 0.3)
    monkeypatch.setattr(icr, "REFRESH_WAIT_SECONDS", 0.2)
    icr.clear()
    yield
    icr.clear()


@pytest.fixture
def project():
    return uuid.uuid4()


def _db():
    db = MagicMock()
    db.get_bind.return_value = None
    return db


def _patch_pass(monkeypatch, fn):
    import app.services.reindex_service as reindex_service

    monkeypatch.setattr(reindex_service, "get_item_embedding_coverage", fn)


def _payload(project, model="mistral-embed"):
    return {
        "project_id": str(project),
        "source": "chat",
        "active_provider": "mistral",
        "active_model": model,
        "active_collection": "c",
        "documents": [],
        "crawl_sources": [],
    }


def test_returns_a_fast_pass(monkeypatch, project):
    payload = _payload(project)
    _patch_pass(monkeypatch, lambda _db, _pid, source, skip_cache: payload)
    assert icr.item_coverage(_db(), project, "chat") == payload


def test_first_slow_pass_reports_pending_without_waiting_for_it(monkeypatch, project):
    release = threading.Event()

    def slow(_db, _pid, source, skip_cache):
        release.wait(5)
        return _payload(project)

    _patch_pass(monkeypatch, slow)
    started = time.monotonic()
    try:
        with pytest.raises(icr.CoveragePending):
            icr.item_coverage(_db(), project, "chat")
    finally:
        release.set()
    assert time.monotonic() - started < 1.5


def test_slow_refresh_serves_last_known_result(monkeypatch, project):
    known = _payload(project)
    _patch_pass(monkeypatch, lambda _db, _pid, source, skip_cache: known)
    icr.item_coverage(_db(), project, "chat")

    release = threading.Event()

    def slow(_db, _pid, source, skip_cache):
        release.wait(5)
        return _payload(project, model="newer")

    _patch_pass(monkeypatch, slow)
    try:
        assert icr.item_coverage(_db(), project, "chat") == known
    finally:
        release.set()


def test_failed_refresh_serves_last_known_result(monkeypatch, project):
    known = _payload(project)
    _patch_pass(monkeypatch, lambda _db, _pid, source, skip_cache: known)
    icr.item_coverage(_db(), project, "chat")

    def broken(_db, _pid, source, skip_cache):
        raise RuntimeError("chroma down")

    _patch_pass(monkeypatch, broken)
    assert icr.item_coverage(_db(), project, "chat") == known


def test_failure_without_last_known_result_propagates(monkeypatch, project):
    def broken(_db, _pid, source, skip_cache):
        raise RuntimeError("chroma down")

    _patch_pass(monkeypatch, broken)
    with pytest.raises(RuntimeError):
        icr.item_coverage(_db(), project, "chat")


def test_concurrent_callers_share_one_pass(monkeypatch, project):
    release = threading.Event()
    calls = []

    def slow(_db, _pid, source, skip_cache):
        calls.append(source)
        release.wait(5)
        return _payload(project)

    _patch_pass(monkeypatch, slow)
    try:
        for _ in range(3):
            with pytest.raises(icr.CoveragePending):
                icr.item_coverage(_db(), project, "chat")
    finally:
        release.set()
    assert calls == ["chat"]


def test_last_known_result_is_per_project_and_source(monkeypatch, project):
    _patch_pass(monkeypatch, lambda _db, _pid, source, skip_cache: _payload(project))
    icr.item_coverage(_db(), project, "chat")

    release = threading.Event()
    _patch_pass(monkeypatch, lambda *_a, **_kw: release.wait(5))
    try:
        with pytest.raises(icr.CoveragePending):
            icr.item_coverage(_db(), project, "search")
        with pytest.raises(icr.CoveragePending):
            icr.item_coverage(_db(), uuid.uuid4(), "chat")
    finally:
        release.set()


def test_route_answers_503_while_the_first_pass_runs(monkeypatch, project):
    def pending(*_a, **_kw):
        raise icr.CoveragePending("Embedding coverage is still being checked")

    monkeypatch.setattr(embedding_routes, "_project_owned_by_user", lambda *_a: None)
    monkeypatch.setattr(icr, "item_coverage", pending)
    with pytest.raises(HTTPException) as exc:
        embedding_routes.get_embedding_item_coverage(
            str(project), source="chat", skip_cache=False, db=_db(), current_user=MagicMock(id=1)
        )
    assert exc.value.status_code == 503
    assert exc.value.headers == {"Retry-After": "15"}
