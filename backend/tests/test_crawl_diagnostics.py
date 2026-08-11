"""Tests for crawl diagnostics referrer tracking."""

import threading

from app.services.crawl_diagnostics import CrawlDiagnosticsCollector


def test_note_discovery_accumulates_multiple_referrers():
    collector = CrawlDiagnosticsCollector(max_referrers_per_url=5)
    collector.note_discovery("https://example.com/target", "https://example.com/a")
    collector.note_discovery("https://example.com/target", "https://example.com/b")

    collector.record_skipped("https://example.com/target", "external_domain")
    skipped, _ = collector.finalize()

    assert len(skipped) == 1
    assert skipped[0]["referrers"] == [
        "https://example.com/a",
        "https://example.com/b",
    ]


def test_referrer_cap_sets_truncated_flag():
    collector = CrawlDiagnosticsCollector(max_referrers_per_url=2)
    collector.note_discovery("https://example.com/t", "https://example.com/p1")
    collector.note_discovery("https://example.com/t", "https://example.com/p2")
    collector.note_discovery("https://example.com/t", "https://example.com/p3")

    collector.record_skipped("https://example.com/t", "external_domain")
    skipped, _ = collector.finalize()

    assert len(skipped[0]["referrers"]) == 2
    assert skipped[0]["referrers_truncated"] is True


def test_dedup_by_url_and_reason():
    collector = CrawlDiagnosticsCollector()
    collector.note_discovery("https://example.com/t", "https://example.com/a")
    collector.record_skipped("https://example.com/t", "external_domain")
    collector.note_discovery("https://example.com/t", "https://example.com/b")
    collector.record_skipped("https://example.com/t", "external_domain")

    skipped, _ = collector.finalize()
    assert len(skipped) == 1
    assert skipped[0]["referrers"] == [
        "https://example.com/a",
        "https://example.com/b",
    ]


def test_no_content_change_has_no_referrers():
    collector = CrawlDiagnosticsCollector()
    collector.note_discovery("https://example.com/page", "https://example.com/parent")
    collector.record_skipped("https://example.com/page", "no_content_change")

    skipped, _ = collector.finalize()
    assert skipped[0]["referrers"] == []


def test_failed_url_gets_referrers_from_discovery_map():
    collector = CrawlDiagnosticsCollector()
    collector.note_discovery("https://example.com/missing", "https://example.com/jobs")
    collector.record_failed("https://example.com/missing", "http_404", status_code=404)

    _, failed = collector.finalize()
    assert failed[0]["referrers"] == ["https://example.com/jobs"]
    assert failed[0]["status_code"] == 404


def test_max_tracked_entries():
    collector = CrawlDiagnosticsCollector(max_tracked=2)
    collector.record_skipped("https://example.com/1", "external_domain")
    collector.record_skipped("https://example.com/2", "external_domain")
    collector.record_skipped("https://example.com/3", "external_domain")

    skipped, _ = collector.finalize()
    assert len(skipped) == 2


def test_thread_safe_note_discovery():
    collector = CrawlDiagnosticsCollector(max_referrers_per_url=20)
    target = "https://example.com/target"

    def worker(prefix: str) -> None:
        for i in range(10):
            collector.note_discovery(target, f"https://example.com/{prefix}-{i}")

    threads = [threading.Thread(target=worker, args=(str(t),)) for t in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    collector.record_skipped(target, "external_domain")
    skipped, _ = collector.finalize()
    assert len(skipped) == 1
    assert len(skipped[0]["referrers"]) <= 20
