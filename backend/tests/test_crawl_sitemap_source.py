"""Sitemap XML crawl sources: schema rules, migration, and run_crawl_fetch seeding from the sitemap."""
from __future__ import annotations

import importlib.util
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models import CrawlJob, CrawlJobStatus, CrawlSource
from app.schemas import CrawlSourceCreate, CrawlSourceOut, CrawlSourceUpdate
from app.services import crawler
from app.services import sitemap_discovery as sd

MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "l2m3n4o5p6q7_add_source_type_to_crawl_sources.py"


# --- schemas -----------------------------------------------------------------


def test_create_defaults_to_domain_and_keeps_depth():
    data = CrawlSourceCreate(name="Docs", base_url="https://example.com")
    assert data.source_type == "domain"
    assert data.depth == 3


def test_sitemap_create_forces_listed_pages_only():
    data = CrawlSourceCreate(
        name="Sitemap",
        base_url="https://example.com/sitemap.xml",
        source_type="sitemap",
        depth=4,
        rescope_root_links=True,
    )
    assert data.source_type == "sitemap"
    assert data.depth == 0
    assert data.rescope_root_links is False


def test_unknown_source_type_is_rejected():
    with pytest.raises(ValueError):
        CrawlSourceCreate(name="x", base_url="https://example.com", source_type="rss")


def test_source_type_is_not_updatable_and_is_returned():
    assert "source_type" not in CrawlSourceUpdate.model_fields
    assert CrawlSourceOut.model_fields["source_type"].default == "domain"


# --- migration ---------------------------------------------------------------


def _load_migration():
    spec = importlib.util.spec_from_file_location("sitemap_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_migration_chain():
    module = _load_migration()
    assert module.revision == "l2m3n4o5p6q7"
    assert module.down_revision == "k1l2m3n4o5p6"


def test_migration_upgrade_backfills_domain_and_downgrade_removes_column():
    module = _load_migration()
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE crawl_sources (id INTEGER PRIMARY KEY, name TEXT)"))
        conn.execute(sa.text("INSERT INTO crawl_sources (id, name) VALUES (1, 'existing')"))
        module.op = Operations(MigrationContext.configure(conn))

        module.upgrade()
        cols = {c["name"] for c in sa.inspect(conn).get_columns("crawl_sources")}
        assert "source_type" in cols
        assert conn.execute(sa.text("SELECT source_type FROM crawl_sources")).scalar_one() == "domain"

        module.downgrade()
        cols = {c["name"] for c in sa.inspect(conn).get_columns("crawl_sources")}
        assert "source_type" not in cols
        assert conn.execute(sa.text("SELECT name FROM crawl_sources")).scalar_one() == "existing"


# --- crawler -----------------------------------------------------------------


class _Query:
    def __init__(self, obj):
        self._obj = obj

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._obj

    def count(self):
        return 0


class _FakeDB:
    def __init__(self, job, source):
        self.job = job
        self.source = source

    def query(self, model):
        if model is CrawlJob:
            return _Query(self.job)
        if model is CrawlSource:
            return _Query(self.source)
        return _Query(None)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    def refresh(self, obj):
        pass


class _SpiderCalled(Exception):
    pass


def _make_source(source_type: str, depth: int, trained_at=None, index_header=False, index_footer=False):
    return SimpleNamespace(
        index_site_header=index_header,
        index_site_footer=index_footer,
        id=uuid.uuid4(),
        base_url="https://example.com/sitemap.xml" if source_type == "sitemap" else "https://example.com",
        source_type=source_type,
        depth=depth,
        max_pages=None,
        trained_at=trained_at,
        last_crawl_at=None,
        max_runtime_minutes=None,
        delay_seconds=None,
        max_links_per_page=None,
        headless=None,
        allowlist=[],
        denylist=[],
        skip_header_footer=True,
        rescope_root_links=False,
        created_by_id=uuid.uuid4(),
    )


@pytest.fixture
def fetch_env(monkeypatch):
    """Patch DB, reachability, notifications and the spider around run_crawl_fetch."""

    def setup(source):
        job = SimpleNamespace(
            id=uuid.uuid4(), status=CrawlJobStatus.PENDING, started_at=None,
            pages_fetched=None, errors=None, finished_at=None,
        )
        db = _FakeDB(job, source)
        monkeypatch.setattr("app.db.SessionLocal", lambda: db)
        monkeypatch.setattr(crawler, "SessionLocal", lambda: db)
        monkeypatch.setattr(crawler, "validate_url_reachable", lambda url, timeout=10: (True, "ok"))
        monkeypatch.setattr(crawler, "create_notification", MagicMock())
        monkeypatch.setattr(
            "app.services.concurrency_limits.promote_all_waiting_for_user", MagicMock()
        )
        spider = AsyncMock(side_effect=_SpiderCalled())
        monkeypatch.setattr(crawler, "_run_scrapy_spider", spider)
        return job, spider

    return setup


async def test_sitemap_source_seeds_spider_with_listed_pages(fetch_env, monkeypatch):
    source = _make_source("sitemap", depth=0)
    job, spider = fetch_env(source)
    pages = ["https://example.com/a", "https://example.com/b"]
    discover = AsyncMock(return_value=(pages, {"urls_found": 2}))
    monkeypatch.setattr(crawler, "_discover_sitemap_seed_urls", discover)
    errors_at_spider_start: list = []

    def capture_errors(**_kwargs):
        errors_at_spider_start.extend(job.errors or [])
        raise _SpiderCalled()

    spider.side_effect = capture_errors

    await crawler.run_crawl_fetch(job.id, source.id)

    discover.assert_awaited_once()
    assert discover.await_args.args[0] == source.base_url
    assert discover.await_args.kwargs["max_pages"] == crawler.DEFAULT_CRAWL_SETTINGS["max_pages"]
    kwargs = spider.await_args.kwargs
    assert kwargs["seed_urls"] == pages
    assert kwargs["max_depth"] == 0
    assert kwargs["max_pages"] == crawler.DEFAULT_CRAWL_SETTINGS["max_pages"]
    assert {"type": "crawl_plan", "planned_pages": 2} in errors_at_spider_start


async def test_sitemap_source_honours_configured_max_pages(fetch_env, monkeypatch):
    source = _make_source("sitemap", depth=0)
    source.max_pages = 25
    job, spider = fetch_env(source)
    monkeypatch.setattr(
        crawler, "_discover_sitemap_seed_urls", AsyncMock(return_value=(["https://example.com/a"], {}))
    )

    await crawler.run_crawl_fetch(job.id, source.id)

    assert spider.await_args.kwargs["max_pages"] == 25


async def test_domain_source_is_unchanged(fetch_env, monkeypatch):
    source = _make_source("domain", depth=2)
    job, spider = fetch_env(source)
    discover = AsyncMock()
    monkeypatch.setattr(crawler, "_discover_sitemap_seed_urls", discover)

    await crawler.run_crawl_fetch(job.id, source.id)

    discover.assert_not_awaited()
    kwargs = spider.await_args.kwargs
    assert kwargs["seed_urls"] is None
    assert kwargs["max_depth"] == 2
    assert kwargs["start_url"] == "https://example.com"


@pytest.mark.parametrize("source_type,depth", [("domain", 2), ("sitemap", 0)])
@pytest.mark.parametrize(
    "index_header,index_footer,expected",
    [
        (False, False, set()),
        (True, False, {"site_header"}),
        (False, True, {"site_footer"}),
        (True, True, {"site_header", "site_footer"}),
    ],
)
async def test_site_block_flags_reach_spider(
    fetch_env, monkeypatch, source_type, depth, index_header, index_footer, expected
):
    source = _make_source(source_type, depth, index_header=index_header, index_footer=index_footer)
    job, spider = fetch_env(source)
    monkeypatch.setattr(
        crawler, "_discover_sitemap_seed_urls", AsyncMock(return_value=(["https://example.com/a"], {}))
    )

    await crawler.run_crawl_fetch(job.id, source.id)

    assert set(spider.await_args.kwargs["site_blocks"].enabled_kinds) == expected


async def test_empty_sitemap_fails_job_and_keeps_previous_training(fetch_env, monkeypatch):
    trained_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    source = _make_source("sitemap", depth=0, trained_at=trained_at)
    job, spider = fetch_env(source)
    summary = {"urls_found": 0, "errors": ["https://example.com/sitemap.xml: HTTP 404"]}
    monkeypatch.setattr(crawler, "_discover_sitemap_seed_urls", AsyncMock(return_value=([], summary)))

    await crawler.run_crawl_fetch(job.id, source.id)

    spider.assert_not_awaited()
    assert job.status == CrawlJobStatus.FAILED
    assert job.finished_at is not None
    assert "Sitemap has no crawlable page URLs" in job.errors[0]["error"]
    assert "HTTP 404" in job.errors[0]["error"]
    assert job.errors[1] == {"type": "crawl_diagnostics", "sitemap": summary}
    assert source.trained_at == trained_at
    crawler.create_notification.assert_called_once()


async def test_discover_seed_urls_applies_crawl_url_policy(monkeypatch):
    candidates = [
        "https://example.com/docs/a",
        "https://other.test/page",
        "https://example.com/private/x",
        "https://example.com/image.png",
    ]

    async def fake_discover(sitemap_url, *, max_urls, url_filter, ssl):
        result = sd.SitemapDiscovery(sitemaps_read=1)
        for url in candidates:
            allowed, reason = url_filter(url)
            if allowed:
                result.urls.append(url)
            else:
                result.skip(reason)
        return result

    monkeypatch.setattr(sd, "discover_sitemap_urls", fake_discover)

    urls, summary = await crawler._discover_sitemap_seed_urls(
        "https://example.com/sitemap.xml", max_pages=100, allowlist=[], denylist=["/private/*"]
    )

    assert urls == ["https://example.com/docs/a"]
    assert summary["skipped"] == {"external_domain": 1, "denylist_match": 1, "binary_extension": 1}
