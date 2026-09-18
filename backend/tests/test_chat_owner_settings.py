"""Owner-first chat settings resolution (API keys preserved)."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.crawler import _validate_crawl_url
from app.services.rag.embedding_resolver import _select_settings_row


def test_crawl_allows_docs_subdomain_under_base_host():
    """Same-site policy includes product docs subdomains of the configured base URL."""
    ok, reason = _validate_crawl_url(
        "https://docs.ragsuite.de/ce-ee",
        "https://ragsuite.de/",
    )
    assert ok is True, reason


def test_crawl_still_blocks_external_social_hosts():
    ok, reason = _validate_crawl_url(
        "https://m.facebook.com/share",
        "https://ragsuite.de/",
    )
    assert ok is False
    assert reason == "blocked_external_domain"


def test_select_settings_row_owner_first_preserves_api_key():
    project_id = uuid.uuid4()
    owner = SimpleNamespace(
        user_id=10,
        project_id=project_id,
        model_provider="mistral",
        api_key="sk-owner-secret-key",
        embedding_model="mistral-embed",
    )
    other = SimpleNamespace(
        user_id=99,
        project_id=project_id,
        model_provider="mistral",
        api_key="",
        embedding_model="mistral-embed",
    )
    chosen = _select_settings_row([other, owner], owner_id=10)
    assert chosen is owner
    assert chosen.api_key == "sk-owner-secret-key"


def test_canonical_chatbot_settings_helper_uses_read_project(monkeypatch):
    from app.routes import rag as rag_routes

    project_id = uuid.uuid4()
    row = SimpleNamespace(api_key="sk-keep-me", user_id=1, project_id=project_id)
    called = {}

    def _fake_read(db, pid):
        called["pid"] = pid
        return row

    monkeypatch.setattr(
        "app.services.rag.embedding_resolver.read_project_chatbot_settings",
        _fake_read,
    )
    db = MagicMock()
    got = rag_routes._canonical_chatbot_settings_for_project(db, project_id)
    assert got is row
    assert got.api_key == "sk-keep-me"
    assert called["pid"] == project_id
