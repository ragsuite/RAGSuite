"""Compare Models retrieval uses project embedding config (not default rag_collection)."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.ee


def _import_compare_route_helpers():
    """Helpers live in EE compare_models (CE rag routes no longer define them)."""
    from ragsuite_modules.compare_models.backend.compare_routes import (
        _compare_retrieve_kwargs,
        _raise_if_compare_retrieval_failed,
    )

    return _compare_retrieve_kwargs, _raise_if_compare_retrieval_failed


class _Req:
    query = "what is nitsan"
    topK = 5
    similarityThreshold = 0.2
    maxTokens = None


def test_resolve_compare_retrieval_embedding_chat_source():
    db = MagicMock()
    project_id = uuid4()
    with patch(
        "ragsuite_modules.compare_models.backend.compare_profiles.settings"
    ) as ee_settings:
        ee_settings.compare_model_config_source = "chat"
        with patch(
            "app.services.rag.embedding_resolver.resolve_for_project",
            return_value=("mistral", "mistral-embed", "key"),
        ) as resolve:
            from ragsuite_modules.compare_models.backend import compare_profiles as ee_cp

            provider, model, key = ee_cp.resolve_compare_retrieval_embedding(db, project_id)
    resolve.assert_called_once_with(db, project_id, source="chat")
    assert provider == "mistral"
    assert model == "mistral-embed"
    assert key == "key"


def test_resolve_compare_retrieval_embedding_both_uses_ingest():
    db = MagicMock()
    project_id = uuid4()
    with patch(
        "ragsuite_modules.compare_models.backend.compare_profiles.settings"
    ) as ee_settings:
        ee_settings.compare_model_config_source = "both"
        with patch(
            "app.services.rag.embedding_resolver.resolve_ingest_for_project",
            return_value=("openai", "text-embedding-3-small", "sk"),
        ) as resolve_ingest:
            from ragsuite_modules.compare_models.backend import compare_profiles as ee_cp

            provider, model, key = ee_cp.resolve_compare_retrieval_embedding(db, project_id)
    resolve_ingest.assert_called_once_with(db, project_id)
    assert provider == "openai"


def test_compare_retrieve_kwargs_includes_embedding():
    _compare_retrieve_kwargs, _ = _import_compare_route_helpers()
    db = MagicMock()
    with patch(
        "ragsuite_modules.compare_models.backend.compare_routes.resolve_compare_retrieval_embedding",
        return_value=("mistral", "mistral-embed", "secret"),
    ):
        kwargs = _compare_retrieve_kwargs(
            _Req(),
            user_id=1,
            project_id="proj-1",
            db=db,
            live_item_ids={"live-a", "live-b"},
        )
    assert kwargs["embedding_provider"] == "mistral"
    assert kwargs["embedding_model"] == "mistral-embed"
    assert kwargs["embedding_api_key"] == "secret"
    assert kwargs["project_id"] == "proj-1"
    assert kwargs["live_item_ids"] == {"live-a", "live-b"}


def test_build_compare_shared_sources_dedupes_urls():
    from ragsuite_modules.compare_models.backend.compare_routes import (
        _build_compare_shared_sources,
    )

    raw = [
        {
            "title": "Gujarat Tourism Homestay",
            "url": "https://gujarattourism.com/policy.pdf",
            "crawl_source_id": "guj-1",
        },
        {
            "title": "BGE German doc",
            "url": "https://bge.de/fileadmin/x.pdf",
            "crawl_source_id": "bge-deleted",
        },
        {
            "title": "BGE German doc duplicate",
            "url": "https://bge.de/fileadmin/x.pdf",
            "crawl_source_id": "bge-deleted",
        },
    ]
    sources = _build_compare_shared_sources(raw, limit=5)
    assert len(sources) == 2
    assert "gujarattourism" in sources[0]["url"]
    assert sources[1]["url"].startswith("https://bge.de")


def test_raise_if_compare_retrieval_vector_error():
    _, _raise_if_compare_retrieval_failed = _import_compare_route_helpers()
    with pytest.raises(HTTPException) as exc:
        _raise_if_compare_retrieval_failed(
            {"error": "no_contexts", "retrieval_meta": {"fallback_reason": "embed_error"}}
        )
    assert exc.value.status_code == 503


def test_raise_if_compare_retrieval_no_docs():
    _, _raise_if_compare_retrieval_failed = _import_compare_route_helpers()
    with pytest.raises(HTTPException) as exc:
        _raise_if_compare_retrieval_failed(
            {"error": "no_contexts", "retrieval_meta": {"fallback_reason": "no_docs"}}
        )
    assert exc.value.status_code == 404
