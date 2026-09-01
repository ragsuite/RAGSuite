"""Tests for surface-scoped crawl source embedding coverage."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.reindex_service import (
    assess_embedding_coverage,
    count_reindex_items,
    enqueue_durable_reindex,
    get_item_embedding_coverage,
)


def _sample_source(*, ingest_embedding_target=None, project_id=None):
    source = MagicMock()
    source.id = uuid.uuid4()
    source.project_id = project_id or uuid.uuid4()
    source.ingest_embedding_target = ingest_embedding_target
    return source


@patch("app.services.crawl_source_embedding.embedded_models_by_item_id")
def test_crawl_source_ids_expected_for_surface_explicit_targets(mock_embedded):
    from app.services.crawl_source_embedding import crawl_source_ids_expected_for_surface

    project_id = uuid.uuid4()
    chat_src = _sample_source(ingest_embedding_target="chat", project_id=project_id)
    search_src = _sample_source(ingest_embedding_target="search", project_id=project_id)
    mock_embedded.return_value = {}

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [chat_src, search_src]

    ids = {str(chat_src.id), str(search_src.id)}
    assert crawl_source_ids_expected_for_surface(db, project_id, "chat", ids) == {
        str(chat_src.id)
    }
    assert crawl_source_ids_expected_for_surface(db, project_id, "search", ids) == {
        str(search_src.id)
    }


@patch("app.services.crawl_source_embedding.build_embedding_target_options")
@patch("app.services.crawl_source_embedding.embedded_models_by_item_id")
def test_crawl_source_ids_expected_for_surface_legacy_infers_from_chroma(
    mock_embedded,
    mock_options,
):
    from app.services.crawl_source_embedding import crawl_source_ids_expected_for_surface

    project_id = uuid.uuid4()
    legacy_search = _sample_source(ingest_embedding_target=None, project_id=project_id)
    legacy_chat = _sample_source(ingest_embedding_target=None, project_id=project_id)
    mock_options.return_value = {
        "search": {"collection": "proj_mistral"},
        "chat": {"collection": "proj_openai"},
        "same_collection": False,
        "default_target": "search",
    }
    mock_embedded.return_value = {
        str(legacy_search.id): [{"collection": "proj_mistral"}],
        str(legacy_chat.id): [{"collection": "proj_openai"}],
    }

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [
        legacy_search,
        legacy_chat,
    ]
    ids = {str(legacy_search.id), str(legacy_chat.id)}

    assert crawl_source_ids_expected_for_surface(db, project_id, "search", ids) == {
        str(legacy_search.id)
    }
    assert crawl_source_ids_expected_for_surface(db, project_id, "chat", ids) == {
        str(legacy_chat.id)
    }


@patch("app.services.crawl_source_embedding.build_embedding_target_options")
@patch("app.services.crawl_source_embedding.embedded_models_by_item_id")
def test_chat_target_with_stale_other_collection_not_in_search_scope(
    mock_embedded,
    mock_options,
):
    from app.services.crawl_source_embedding import crawl_source_ids_expected_for_surface

    project_id = uuid.uuid4()
    chat_src = _sample_source(ingest_embedding_target="chat", project_id=project_id)
    mock_options.return_value = {
        "search": {"collection": "proj_mistral"},
        "chat": {"collection": "proj_openai"},
        "same_collection": False,
        "default_target": "search",
    }
    mock_embedded.return_value = {
        str(chat_src.id): [
            {"collection": "proj_openai"},
            {"collection": "proj_mistral"},
        ],
    }

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [chat_src]
    ids = {str(chat_src.id)}

    assert crawl_source_ids_expected_for_surface(db, project_id, "chat", ids) == ids
    assert crawl_source_ids_expected_for_surface(db, project_id, "search", ids) == set()


@patch("app.services.reindex_service._saved_collection_for_source", return_value=None)
@patch("app.services.reindex_service._embedded_coverage_ids")
@patch("app.services.crawl_source_embedding.crawl_source_ids_expected_for_surface")
@patch("app.services.reindex_service.expected_coverage_item_ids")
def test_assess_coverage_scopes_expected_crawl_sources(
    mock_expected,
    mock_scoped,
    mock_embedded,
    _saved,
):
    project_id = uuid.uuid4()
    upload_id = str(uuid.uuid4())
    all_crawl = {str(uuid.uuid4()) for _ in range(5)}
    chat_crawl = set(list(all_crawl)[:2])
    search_crawl = set(list(all_crawl)[2:])

    mock_expected.return_value = (
        {upload_id} | all_crawl,
        {upload_id},
        all_crawl,
        10,
    )
    mock_embedded.return_value = {upload_id} | chat_crawl | search_crawl

    db = MagicMock()

    mock_scoped.side_effect = lambda _db, _pid, surface, crawl_ids: (
        chat_crawl if surface == "chat" else search_crawl
    )

    chat_report = assess_embedding_coverage(
        db, project_id, "proj_openai", source="chat"
    )
    search_report = assess_embedding_coverage(
        db, project_id, "proj_mistral", source="search"
    )

    assert chat_report.coverage_items_total == 3
    assert chat_report.coverage_items_embedded == 3
    assert chat_report.coverage_items_missing == 0
    assert chat_report.needs_reindex is False
    assert chat_report.missing_crawl_sources_count == 0

    assert search_report.coverage_items_total == 4
    assert search_report.coverage_items_embedded == 4
    assert search_report.coverage_items_missing == 0
    assert search_report.needs_reindex is False
    assert search_report.missing_crawl_sources_count == 0


@patch("app.services.crawl_source_embedding.crawl_source_ids_expected_for_surface")
@patch("app.services.reindex_service.expected_coverage_item_ids")
def test_count_reindex_items_scopes_crawl_sources(mock_expected, mock_scoped):
    project_id = uuid.uuid4()
    upload_id = str(uuid.uuid4())
    all_crawl = {str(uuid.uuid4()) for _ in range(5)}
    chat_crawl = set(list(all_crawl)[:2])

    mock_expected.return_value = (
        {upload_id} | all_crawl,
        {upload_id},
        all_crawl,
        10,
    )
    mock_scoped.return_value = chat_crawl

    db = MagicMock()
    total = count_reindex_items(db, project_id, include_crawled=True, source="chat")
    assert total == 3


@patch("app.services.reindex_service._saved_collection_for_source", return_value=None)
@patch("app.services.reindex_service._probe_item_coverage_in_collections")
@patch("app.services.crawl_source_embedding.crawl_source_ids_expected_for_surface")
@patch("app.services.reindex_service.expected_coverage_item_ids")
@patch("app.services.reindex_service.collection_name_for", return_value="proj_openai")
@patch(
    "app.services.reindex_service.resolve_for_project",
    return_value=("openai", "text-embedding-3-small", "key"),
)
def test_get_item_embedding_coverage_missing_active_only_for_surface_crawl(
    _resolve,
    _collection_name,
    mock_expected,
    mock_scoped,
    mock_probe,
    _saved,
):
    project_id = uuid.uuid4()
    chat_crawl = str(uuid.uuid4())
    search_only_crawl = str(uuid.uuid4())
    mock_expected.return_value = (
        {chat_crawl, search_only_crawl},
        set(),
        {chat_crawl, search_only_crawl},
        2,
    )
    mock_scoped.return_value = {chat_crawl}
    mock_probe.return_value = {
        chat_crawl: {
            "proj_openai": {
                "provider": "openai",
                "model": "text-embedding-3-small",
                "collection": "proj_openai",
            }
        }
    }

    db = MagicMock()
    result = get_item_embedding_coverage(db, project_id, source="chat")

    by_id = {entry["id"]: entry for entry in result["crawl_sources"]}
    assert by_id[chat_crawl]["missing_active"] is False
    assert by_id[search_only_crawl]["missing_active"] is False


@patch("app.services.job_queue.enqueue_job")
@patch("app.services.crawl_source_embedding.crawl_source_ids_expected_for_surface")
@patch("app.services.reindex_service.expected_coverage_item_ids")
def test_enqueue_durable_reindex_only_schedules_surface_crawl_sources(
    mock_expected,
    mock_scoped,
    mock_enqueue,
):
    project_id = uuid.uuid4()
    crawl_a, crawl_b, crawl_c = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    mock_expected.return_value = (
        {crawl_a, crawl_b, crawl_c},
        set(),
        {crawl_a, crawl_b, crawl_c},
        3,
    )
    mock_scoped.return_value = {crawl_a, crawl_b}

    db = MagicMock()
    _, job_count = enqueue_durable_reindex(
        db,
        project_id=project_id,
        source="search",
        user_id=1,
        document_ids=[],
        include_crawled=True,
    )

    crawl_jobs = [
        call
        for call in mock_enqueue.call_args_list
        if call.kwargs.get("job_type") == "REINDEX"
        and call.kwargs.get("payload", {}).get("phase") == "crawl"
    ]
    scheduled_ids = {
        call.kwargs["payload"]["crawl_source_id"] for call in crawl_jobs
    }
    assert scheduled_ids == {crawl_a, crawl_b}
    assert job_count == 2


@patch("app.services.crawl_source_embedding.crawl_source_ids_expected_for_surface")
@patch("app.services.reindex_service.expected_coverage_item_ids")
def test_crawl_surface_counts_for_embedding_status(mock_expected, mock_scoped):
    from app.routes.embeddings import _crawl_surface_counts

    project_id = uuid.uuid4()
    all_crawl = {str(uuid.uuid4()) for _ in range(5)}
    scoped = set(list(all_crawl)[:2])
    mock_expected.return_value = (set(), set(), all_crawl, 10)
    mock_scoped.return_value = scoped

    db = MagicMock()
    total, expected, other_surface = _crawl_surface_counts(db, project_id, "chat")

    assert total == 5
    assert expected == 2
    assert other_surface == 3
    mock_scoped.assert_called_once_with(db, project_id, "chat", all_crawl)
