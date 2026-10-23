"""Factory aliases: one Gemini row; Google Cloud is not a catalog provider."""
from __future__ import annotations

from app.services.provider_factories import (
    SKIP_FACTORIES,
    convert_factories,
    convert_factory,
    factory_id,
)
from app.services.provider_marketplace import invalidate_catalog, load_catalog


def test_gemini_aliases_and_google_cloud_skipped():
    assert factory_id("Gemini") == "gemini"
    assert factory_id("Google Gemini") == "gemini"
    assert factory_id("google-gemini") == "gemini"
    assert "google_cloud" in SKIP_FACTORIES
    assert convert_factory({"name": "Google Cloud", "llm": [], "tags": "LLM"}) is None


def test_catalog_has_one_gemini_and_no_google_cloud():
    convert_factories.cache_clear()
    invalidate_catalog()
    ids = [str(row.get("id")) for row in load_catalog()]
    assert ids.count("gemini") == 1
    assert "google_cloud" not in ids
    assert "google_gemini" not in ids
