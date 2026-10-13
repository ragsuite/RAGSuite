"""Pages read for Train saved pages runs (services/crawl_run_pages.py)."""
from __future__ import annotations

import copy
import uuid
from types import SimpleNamespace

from app.models import BackgroundJob, CrawlJobStatus, JobArchive
from app.services import crawl_run_pages as crp
from app.services.crawl_status_urls import page_url_entries


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return list(self._rows)


class _Db:
    """``query(Model.payload)`` per queue table, ``query(Document.id, Document.url)`` for pages."""

    def __init__(self, *, live=(), archived=(), pages=()):
        self._payloads = {BackgroundJob: [(p,) for p in live], JobArchive: [(p,) for p in archived]}
        self._pages = list(pages)
        self.page_queries = 0

    def query(self, *columns):
        if len(columns) == 1:
            return _Query(self._payloads[columns[0].class_])
        self.page_queries += 1
        return _Query(self._pages)


def _ids(n):
    return [uuid.uuid4() for _ in range(n)]


def _index_only_job(errors=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        errors=errors if errors is not None else [{"type": "indexing_progress", "batches_total": 2}],
    )


def test_index_run_diagnostics_lists_every_trained_page():
    diag = crp.index_run_diagnostics(["https://ex.com/b", "https://ex.com/a"])
    assert diag["type"] == "crawl_diagnostics" and diag["crawled_urls_total"] == 2
    assert diag["skipped_count"] == diag["failed_count"] == 0
    items, total = page_url_entries(diag, "crawled")
    assert total == 2 and [i["url"] for i in items] == ["https://ex.com/a", "https://ex.com/b"]


def test_page_urls_keep_requested_order_and_drop_unknown_ids(monkeypatch):
    a, b, c = _ids(3)
    db = _Db(pages=[(b, "https://ex.com/b"), (a, "https://ex.com/a")])
    monkeypatch.setattr(crp, "_ID_CHUNK", 2)
    assert crp.page_urls_for_documents(db, [str(a), str(b), str(c)]) == ["https://ex.com/a", "https://ex.com/b"]
    assert db.page_queries == 2


def test_stored_diagnostics_win_without_queries():
    stored = {"type": "crawl_diagnostics", "crawled_urls": [{"url": "https://ex.com/x"}]}
    job = _index_only_job([stored, {"type": "indexing_progress"}])
    db = _Db()
    assert crp.run_url_diagnostics(db, job) is stored
    assert db.page_queries == 0


def test_crawler_run_without_diagnostics_is_not_rebuilt():
    job = _index_only_job([])
    assert crp.run_url_diagnostics(_Db(), job) == {}


def test_older_index_run_is_rebuilt_from_live_and_archived_batches():
    a, b, c = _ids(3)
    job = _index_only_job()
    snapshot = copy.deepcopy(job.errors)
    db = _Db(
        live=[{"batch_index": 1, "document_ids": [str(c)]}],
        archived=[{"batch_index": 0, "document_ids": [str(a), str(b)]}],
        pages=[(a, "https://ex.com/a"), (b, "https://ex.com/b"), (c, "https://ex.com/c")],
    )
    diag = crp.run_url_diagnostics(db, job)
    assert diag["crawled_urls_total"] == 3
    assert [e["url"] for e in diag["crawled_urls"]] == ["https://ex.com/a", "https://ex.com/b", "https://ex.com/c"]
    assert job.errors == snapshot


def test_index_run_without_batches_has_no_pages():
    assert crp.run_url_diagnostics(_Db(), _index_only_job()) == {}


def _rebuildable(status):
    (a,) = _ids(1)
    job = _index_only_job()
    job.status = status
    db = _Db(live=[{"batch_index": 0, "document_ids": [str(a)]}], pages=[(a, "https://ex.com/a")])
    return job, db


def test_finished_run_is_rebuilt_once_for_paging():
    job, db = _rebuildable(CrawlJobStatus.CANCELLED)
    first = crp.run_url_diagnostics(db, job)
    assert crp.run_url_diagnostics(db, job) is first
    assert db.page_queries == 1


def test_running_index_run_is_rebuilt_each_time():
    job, db = _rebuildable(CrawlJobStatus.INDEXING)
    crp.run_url_diagnostics(db, job)
    crp.run_url_diagnostics(db, job)
    assert db.page_queries == 2
