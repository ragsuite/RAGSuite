"""Crawl sources indexed with a Model Configuration provider (not a widget surface)."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, CrawlSource, Project, ProjectModelProvider, SearchSettings, User
from app.schemas import CrawlEmbeddingTargetOptionsOut
from app.services import crawl_provider_targets as targets_svc
from app.services.crawl_source_embedding import (
    build_embedding_target_options,
    crawl_create_ingest_targets,
    crawl_source_expected_for_surface,
    crawl_source_ids_expected_for_collection,
    purge_stale_crawl_source_embedding_collections,
)
from app.services.rag.embedder_factory import collection_name_for
from app.services.rag.embedding_resolver import resolve_crawl_ingest_targets

MISTRAL_KEY = "mistral-test-key-abcdefghijklmnopqrstuvwxyz"
OPENAI_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123"
OPENAI_401 = "chat_model: Failed: Error code: 401 - {'error': {'message': 'Incorrect API key provided'}}"


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def project(db):
    owner = User(username="owner", email="owner@example.com", hashed_password="x" * 60)
    db.add(owner)
    db.flush()
    proj = Project(name="Main", owner_id=owner.id)
    db.add(proj)
    db.commit()
    return proj


def _provider(db, project, provider, **fields):
    row = ProjectModelProvider(project_id=project.id, provider=provider, **fields)
    db.add(row)
    db.commit()
    return row


def _configure_defaults(db, project):
    _provider(
        db, project, "mistral",
        chat_model="ministral-8b-latest", embedding_model="mistral-embed",
        api_key=MISTRAL_KEY, last_test_status="success",
    )
    _provider(
        db, project, "openai",
        chat_model="gpt-4o-mini", embedding_model="text-embedding-3-small",
        api_key=OPENAI_KEY, last_test_status="failed", last_test_message=OPENAI_401,
    )
    _provider(db, project, "anthropic", chat_model="claude-sonnet-4", api_key="sk-ant-test-0000000000000000000")
    db.add(
        SearchSettings(
            user_id=project.owner_id, project_id=project.id, model_provider="mistral",
            search_model="ministral-8b-latest", embedding_model="mistral-embed", api_key=MISTRAL_KEY,
        )
    )
    db.commit()


def _source(project, target):
    return CrawlSource(
        id=uuid.uuid4(), name="Docs", base_url="https://example.com", depth=2, project_id=project.id,
        created_by_id=project.owner_id, ingest_embedding_target=target,
    )


def test_options_list_only_providers_that_can_embed(db, project):
    _configure_defaults(db, project)

    options = targets_svc.list_embedding_provider_options(db, project.id)

    assert [o["provider"] for o in options] == ["mistral"]
    mistral = options[0]
    assert mistral["model"] == "mistral-embed"
    assert mistral["label"] == "Mistral"
    assert mistral["collection"] == collection_name_for(project.id, "mistral", "mistral-embed")
    assert mistral["used_by"] == ["search"]


def test_options_payload_validates_against_schema(db, project):
    _configure_defaults(db, project)

    payload = build_embedding_target_options(db, project.id, include_providers=True)
    out = CrawlEmbeddingTargetOptionsOut(**payload)

    assert out.default_provider == "mistral"
    assert out.provider_labels["openai"] == "OpenAI"
    assert "anthropic" not in out.provider_labels


def test_provider_without_embedding_model_is_excluded(db, project):
    _provider(db, project, "mistral", chat_model="ministral-8b-latest", api_key=MISTRAL_KEY)

    assert targets_svc.list_embedding_provider_options(db, project.id) == []
    assert targets_svc.default_provider_option([]) is None


def test_provider_target_resolves_current_embedding_model(db, project):
    _configure_defaults(db, project)
    row = db.query(ProjectModelProvider).filter_by(provider="mistral").one()

    first = resolve_crawl_ingest_targets(db, project.id, "mistral")
    assert [(t.provider, t.model, t.source) for t in first] == [("mistral", "mistral-embed", "search")]

    row.embedding_model = "codestral-embed"
    db.commit()
    second = resolve_crawl_ingest_targets(db, project.id, "mistral")
    assert second[0].model == "codestral-embed"
    assert second[0].collection == collection_name_for(project.id, "mistral", "codestral-embed")


def test_rejected_or_missing_provider_resolves_to_no_targets(db, project):
    _configure_defaults(db, project)

    assert resolve_crawl_ingest_targets(db, project.id, "openai") == []
    assert resolve_crawl_ingest_targets(db, project.id, "gemini") == []
    reason = targets_svc.crawl_source_unavailable_reason(db, _source(project, "openai"))
    assert reason and reason.startswith("Indexing paused: OpenAI")
    assert targets_svc.crawl_source_unavailable_reason(db, _source(project, "mistral")) is None
    assert targets_svc.crawl_source_unavailable_reason(db, _source(project, "search")) is None


def test_selection_error_only_for_unusable_provider(db, project):
    _configure_defaults(db, project)

    assert targets_svc.provider_target_selection_error(db, project.id, "mistral") is None
    assert targets_svc.provider_target_selection_error(db, project.id, "search") is None
    assert "OpenAI" in (targets_svc.provider_target_selection_error(db, project.id, "openai") or "")


def test_route_guard_rejects_unusable_provider_with_400(db, project):
    from app.routes.crawl import _reject_unusable_provider_target
    from app.schemas import CrawlIngestEmbeddingTarget

    _configure_defaults(db, project)

    _reject_unusable_provider_target(db, project.id, CrawlIngestEmbeddingTarget.MISTRAL)
    _reject_unusable_provider_target(db, project.id, CrawlIngestEmbeddingTarget.SEARCH)
    _reject_unusable_provider_target(db, project.id, None)
    with pytest.raises(HTTPException) as exc:
        _reject_unusable_provider_target(db, project.id, CrawlIngestEmbeddingTarget.OPENAI)
    assert exc.value.status_code == 400


def test_create_keeps_provider_key_as_single_source(db, project):
    _configure_defaults(db, project)

    assert crawl_create_ingest_targets(db, project.id, "mistral") == ["mistral"]


def test_surface_expectation_follows_collection(db, project):
    _configure_defaults(db, project)
    source = _source(project, "mistral")
    db.add(source)
    db.commit()
    search_collection = collection_name_for(project.id, "mistral", "mistral-embed")

    assert crawl_source_expected_for_surface(db, source, "search", embedded_by_id={}) is True
    assert crawl_source_expected_for_surface(db, source, "chat", embedded_by_id={}) is False
    assert crawl_source_ids_expected_for_collection(
        db, project.id, search_collection, {str(source.id)}
    ) == {str(source.id)}

    paused = _source(project, "openai")
    db.add(paused)
    db.commit()
    assert crawl_source_expected_for_surface(db, paused, "search", embedded_by_id={}) is False


@patch("app.services.rag.singleton.locked_delete_document_embeddings")
@patch("app.services.crawl_source_embedding.embedded_models_by_item_id")
def test_purge_skips_paused_source(mock_embedded, mock_delete, db, project):
    _configure_defaults(db, project)
    source = _source(project, "openai")
    mock_embedded.return_value = {str(source.id): [{"collection": "proj_openai"}]}

    purge_stale_crawl_source_embedding_collections(db, source)

    mock_delete.assert_not_called()
    mock_embedded.assert_not_called()


@patch("app.services.crawl_source_embedding.purge_stale_crawl_source_embedding_collections")
@patch("app.services.crawler._write_prepared_ingest_in_batches")
@patch("app.services.rag.utils_rag.chunks_for_crawled_document", return_value=["chunk-a"])
def test_crawl_ingest_pauses_without_purge_or_write(mock_chunks, mock_write, mock_purge, db, project):
    from app.services.crawler import _ingest_crawl_documents_for_source

    _configure_defaults(db, project)
    source = _source(project, "openai")
    doc = MagicMock(url="https://example.com/", title="Example", text_content="Hello world.", meta_data={})

    result = _ingest_crawl_documents_for_source(db, source, [doc])

    assert result["chunks"] == 0
    assert str(result["status"]).startswith("Indexing paused")
    mock_purge.assert_not_called()
    mock_write.assert_not_called()


@patch("app.services.rag.singleton.locked_delete_document_embeddings")
@patch("app.services.crawl_source_embedding.purge_stale_crawl_source_embedding_collections")
@patch(
    "app.services.crawler._write_prepared_ingest_in_batches",
    side_effect=RuntimeError("Failed to connect to Ollama."),
)
@patch("app.services.rag.utils_rag.chunks_for_crawled_document", return_value=["chunk-a"])
def test_crawl_ingest_reports_embed_exception(mock_chunks, mock_write, mock_purge, mock_delete, db, project):
    from app.services.crawler import _ingest_crawl_documents_for_source

    _configure_defaults(db, project)
    source = _source(project, "mistral")
    doc = MagicMock(url="https://example.com/", title="Example", text_content="Hello world.", meta_data={})

    result = _ingest_crawl_documents_for_source(db, source, [doc])

    assert result["chunks"] == 0
    assert result["status"] == "Indexing Failed"
    assert result["error"] == "Failed to connect to Ollama."
    mock_write.assert_called_once()


def test_start_crawl_refuses_paused_source(db, project):
    from app.services.crawl_orchestration import start_crawl_for_source

    _configure_defaults(db, project)
    source = _source(project, "openai")
    db.add(source)
    db.commit()

    with patch("app.services.crawl_orchestration.source_has_active_crawl", return_value=False), patch(
        "app.services.crawl_orchestration.create_crawl_job"
    ) as mock_create:
        with pytest.raises(HTTPException) as exc:
            start_crawl_for_source(db, source.id, user_id=project.owner_id)

    assert exc.value.status_code == 409
    assert "Indexing paused" in str(exc.value.detail)
    mock_create.assert_not_called()
