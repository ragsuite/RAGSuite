"""Soft-prefer crawl base_url host over sibling docs/blog hosts."""
from __future__ import annotations

from app.services.rag import host_preference as hp


def _entry(url: str, source_id: str = "src-1", doc_id: str = "") -> dict:
    return {
        "id": doc_id or url,
        "doc": f"body for {url}",
        "meta": {"url": url, "crawl_source_id": source_id},
        "dist": 0.1,
    }


def test_prefer_primary_host_promotes_apex_over_docs():
    entries = [
        _entry("https://docs.ragsuite.de/GettingStarted/What", doc_id="d1"),
        _entry("https://ragsuite.de/", doc_id="a1"),
        _entry("https://docs.ragsuite.de/Platform/Architecture", doc_id="d2"),
        _entry("https://ragsuite.de/mobile-app/", doc_id="a2"),
    ]
    ranked, info = hp.prefer_primary_host(entries, {"src-1": "ragsuite.de"})
    assert info["applied"] is True
    assert info["reason"] == "primary_host"
    hosts = [e["meta"]["url"] for e in ranked]
    assert hosts[0].startswith("https://ragsuite.de")
    assert hosts[1].startswith("https://ragsuite.de")
    assert "docs.ragsuite.de" in hosts[2]
    assert "docs.ragsuite.de" in hosts[3]


def test_prefer_primary_host_noop_when_all_docs():
    entries = [
        _entry("https://docs.ragsuite.de/a", doc_id="d1"),
        _entry("https://docs.ragsuite.de/b", doc_id="d2"),
    ]
    ranked, info = hp.prefer_primary_host(entries, {"src-1": "ragsuite.de"})
    assert info["applied"] is False
    assert ranked == entries


def test_prefer_primary_host_noop_without_registry():
    entries = [_entry("https://docs.ragsuite.de/a"), _entry("https://ragsuite.de/")]
    ranked, info = hp.prefer_primary_host(entries, {})
    assert info["applied"] is False
    assert ranked == entries


def test_host_rank_penalties():
    assert hp.host_rank("https://ragsuite.de/page", "ragsuite.de") == 0
    assert hp.host_rank("https://www.ragsuite.de/page", "ragsuite.de") == 0
    assert hp.host_rank("https://docs.ragsuite.de/page", "ragsuite.de") == 1
    assert hp.host_rank("https://other.example.com/", "ragsuite.de") == 3
