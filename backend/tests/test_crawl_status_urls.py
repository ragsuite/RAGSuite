"""Crawl status URL lists: opt-in trimming, totals and paging (response shaping only)."""
from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.models import CrawlJob, CrawlJobStatus, CrawlSource
from app.services.crawl_status_urls import (
    errors_without_url_lists,
    find_crawl_diagnostics,
    page_url_entries,
    url_list_totals,
)


def _errors() -> list:
    return [
        {
            "type": "crawl_diagnostics",
            "failed_count": 2,
            "skipped_count": 3,
            "crawled_urls_total": 4,
            "crawled_urls": [
                {"url": "https://ex.com/d"},
                {"url": "https://ex.com/a"},
                "https://ex.com/c",
                {"url": "https://ex.com/b"},
            ],
            "skipped_urls": [
                {"url": "https://ex.com/z.png", "reason": "binary_extension", "referrers": ["https://ex.com/gallery"]},
                {"url": "https://ex.com/y.pdf", "reason": "binary_extension", "referrers": ["https://ex.com/docs"]},
                {"url": "https://ex.com/x.zip", "reason": "binary_extension", "referrers": ["https://ex.com/about"]},
            ],
            "failed_urls": [
                {"url": "https://ex.com/404", "reason": "http_404", "status_code": 404},
                {"url": "https://ex.com/500", "reason": "http_500", "status_code": 500},
            ],
        },
        {"type": "indexing_progress", "batches_total": 1, "completed_batches": [0]},
    ]


class TestService:
    def test_page_sorted_by_url_with_string_entries_normalized(self):
        items, total = page_url_entries(find_crawl_diagnostics(_errors()), "crawled", limit=2)
        assert total == 4
        assert [i["url"] for i in items] == ["https://ex.com/a", "https://ex.com/b"]

    def test_offset_continues_the_same_order(self):
        diag = find_crawl_diagnostics(_errors())
        items, _ = page_url_entries(diag, "crawled", offset=2, limit=10)
        assert [i["url"] for i in items] == ["https://ex.com/c", "https://ex.com/d"]

    def test_query_matches_url_or_referrer(self):
        diag = find_crawl_diagnostics(_errors())
        by_url, total_url = page_url_entries(diag, "skipped", q="PDF")
        by_ref, total_ref = page_url_entries(diag, "skipped", q="gallery")
        assert (total_url, by_url[0]["url"]) == (1, "https://ex.com/y.pdf")
        assert (total_ref, by_ref[0]["url"]) == (1, "https://ex.com/z.png")

    def test_sort_by_referrer(self):
        items, _ = page_url_entries(find_crawl_diagnostics(_errors()), "skipped", sort="referrer")
        assert [i["referrers"][0] for i in items] == [
            "https://ex.com/about",
            "https://ex.com/docs",
            "https://ex.com/gallery",
        ]

    def test_stored_data_is_not_mutated(self):
        errors = _errors()
        snapshot = copy.deepcopy(errors)
        diag = find_crawl_diagnostics(errors)
        page_url_entries(diag, "crawled", q="ex", sort="referrer")
        errors_without_url_lists(errors)
        assert errors == snapshot

    def test_errors_without_url_lists_keeps_counts_and_other_entries(self):
        trimmed = errors_without_url_lists(_errors())
        diag = trimmed[0]
        assert "crawled_urls" not in diag and "skipped_urls" not in diag and "failed_urls" not in diag
        assert diag["failed_count"] == 2 and diag["crawled_urls_total"] == 4
        assert trimmed[1]["type"] == "indexing_progress"

    def test_totals_and_missing_diagnostics(self):
        assert url_list_totals(find_crawl_diagnostics(_errors())) == {
            "skipped_urls_total": 3,
            "failed_urls_total": 2,
        }
        assert page_url_entries(find_crawl_diagnostics(None), "failed") == ([], 0)
        assert errors_without_url_lists(None) == []


class _Query:
    def __init__(self, result):
        self._result = result

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._result


class _Db:
    def __init__(self, job, source):
        self._rows = {CrawlJob: job, CrawlSource: source}

    def query(self, model):
        return _Query(self._rows.get(model))

    def expire_all(self):
        pass


def _job_and_source():
    source = SimpleNamespace(
        id=uuid.uuid4(), project_id=uuid.uuid4(), max_pages=100, trained_at=None
    )
    errors = _errors()
    diag = errors[0]
    diag["crawled_urls"] = [u if isinstance(u, dict) else {"url": u} for u in diag["crawled_urls"]]
    job = SimpleNamespace(
        id=uuid.uuid4(),
        source_id=source.id,
        status=CrawlJobStatus.COMPLETED,
        pages_fetched=4,
        errors=errors,
        queued_at=datetime.now(timezone.utc),
        started_at=None,
        finished_at=None,
    )
    return job, source


@pytest.fixture
def route_env():
    with patch("app.routes.crawl._can_manage_project", return_value=True), patch(
        "app.routes.crawl.source_has_vectors_in_target_collection", return_value=True
    ):
        yield


class TestRoutes:
    def test_default_status_response_is_unchanged(self, route_env):
        from app.routes.crawl import get_crawl_status

        job, source = _job_and_source()
        out = get_crawl_status(job_id=job.id, url_limit=None, db=_Db(job, source), current_user=SimpleNamespace())
        assert len(out.crawled_urls) == 4 and len(out.skipped_urls) == 3 and len(out.failed_urls) == 2
        assert out.errors == job.errors
        assert (out.skipped_urls_total, out.failed_urls_total, out.crawled_urls_total) == (3, 2, 4)
        assert (out.skipped_count, out.failed_count) == (3, 2)

    def test_url_limit_trims_lists_and_errors(self, route_env):
        from app.routes.crawl import get_crawl_status

        job, source = _job_and_source()
        snapshot = copy.deepcopy(job.errors)
        out = get_crawl_status(job_id=job.id, url_limit=1, db=_Db(job, source), current_user=SimpleNamespace())
        assert [u["url"] for u in out.crawled_urls] == ["https://ex.com/a"]
        assert len(out.skipped_urls) == 1 and len(out.failed_urls) == 1
        assert "crawled_urls" not in out.errors[0]
        assert (out.skipped_urls_total, out.failed_urls_total, out.crawled_urls_total) == (3, 2, 4)
        assert job.errors == snapshot

    def test_url_limit_zero_returns_no_urls(self, route_env):
        from app.routes.crawl import get_crawl_status

        job, source = _job_and_source()
        out = get_crawl_status(job_id=job.id, url_limit=0, db=_Db(job, source), current_user=SimpleNamespace())
        assert out.crawled_urls == [] and out.skipped_urls == [] and out.failed_urls == []
        assert out.crawled_urls_total == 4

    def test_urls_endpoint_pages(self, route_env):
        from app.routes.crawl import get_crawl_status_urls

        job, source = _job_and_source()
        out = get_crawl_status_urls(
            job_id=job.id, kind="crawled", offset=1, limit=2, q=None, sort="url",
            db=_Db(job, source), current_user=SimpleNamespace(),
        )
        assert [i["url"] for i in out.items] == ["https://ex.com/b", "https://ex.com/c"]
        assert (out.total, out.offset, out.limit, out.kind) == (4, 1, 2, "crawled")

    def test_urls_endpoint_access_denied(self):
        from app.routes.crawl import get_crawl_status_urls

        job, source = _job_and_source()
        with patch("app.routes.crawl._can_manage_project", return_value=False):
            with pytest.raises(HTTPException) as exc:
                get_crawl_status_urls(
                    job_id=job.id, kind="failed", offset=0, limit=10, q=None, sort="url",
                    db=_Db(job, source), current_user=SimpleNamespace(),
                )
        assert exc.value.status_code == 403

    def test_urls_endpoint_missing_job(self):
        from app.routes.crawl import get_crawl_status_urls

        with pytest.raises(HTTPException) as exc:
            get_crawl_status_urls(
                job_id=uuid.uuid4(), kind="failed", offset=0, limit=10, q=None, sort="url",
                db=_Db(None, None), current_user=SimpleNamespace(),
            )
        assert exc.value.status_code == 404
