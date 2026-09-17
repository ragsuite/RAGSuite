"""AI Assistant message citations persistence helpers."""

from __future__ import annotations

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.ai_assistant.backend.routes import (  # noqa: E402
    _normalize_persisted_citations,
)


def test_normalize_persisted_citations_keeps_title_url_image():
    items = _normalize_persisted_citations(
        [
            {"title": "GDPR", "url": "https://example.com/a", "image": "https://example.com/a.png"},
            {"title": "", "url": "https://example.com/b"},
            {"junk": True},
            "skip",
        ]
    )
    assert items == [
        {
            "title": "GDPR",
            "url": "https://example.com/a",
            "image": "https://example.com/a.png",
        },
        {"title": "https://example.com/b", "url": "https://example.com/b"},
    ]


def test_normalize_persisted_citations_empty():
    assert _normalize_persisted_citations(None) is None
    assert _normalize_persisted_citations([]) is None
    assert _normalize_persisted_citations([{"title": "", "url": ""}]) is None
