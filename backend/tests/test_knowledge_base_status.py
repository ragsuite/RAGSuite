"""Tests for knowledge-base readiness (correct Chroma collection)."""
import uuid
from unittest.mock import MagicMock, patch

import app.services.knowledge_base_status as kb_status
from app.services.knowledge_base_status import (
    invalidate_kb_cache,
    mark_kb_ready,
    project_has_retrievable_content,
)

_PROJECT = str(uuid.uuid4())


def setup_function():
    invalidate_kb_cache(_PROJECT)
    with kb_status._kb_readiness_lock:
        kb_status._kb_readiness_cache.clear()


@patch("app.services.knowledge_base_status._project_has_expected_content", return_value=True)
@patch("app.services.knowledge_base_status.collection_name_for", return_value="proj_test__mistral__x")
@patch(
    "app.services.knowledge_base_status.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_live_content_uses_existence_count_only(_resolve, _collection, _expected):
    vdb = MagicMock()
    vdb.count.return_value = 1
    db = MagicMock()

    assert project_has_retrievable_content(vdb, db, _PROJECT, 2, source="chat") is True
    # Gate must not walk coverage item ids — only cheap existence count.
    vdb.count.assert_called()
    assert vdb.count.call_count == 1


@patch("app.services.knowledge_base_status._project_has_expected_content", return_value=False)
@patch("app.services.knowledge_base_status.collection_name_for", return_value="proj_test__mistral__x")
@patch(
    "app.services.knowledge_base_status.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_no_live_documents_blocks_without_chroma(_resolve, _collection, _expected):
    vdb = MagicMock()
    vdb.count.return_value = 99
    db = MagicMock()

    assert project_has_retrievable_content(vdb, db, _PROJECT, 2, source="chat") is False
    vdb.count.assert_not_called()


@patch("app.services.knowledge_base_status._project_has_expected_content", return_value=True)
@patch("app.services.knowledge_base_status.collection_name_for", return_value="proj_test__mistral__x")
@patch(
    "app.services.knowledge_base_status.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_legacy_chunks_project_only_count(_resolve, _collection, _expected):
    vdb = MagicMock()
    vdb.count.side_effect = [0, 1]
    db = MagicMock()

    assert project_has_retrievable_content(vdb, db, _PROJECT, 2, source="chat") is True
    assert vdb.count.call_args_list[0].kwargs["collection_name"] == "proj_test__mistral__x"
    assert vdb.count.call_args_list[1].kwargs["user_id"] is None


@patch("app.services.knowledge_base_status._project_has_expected_content", return_value=True)
@patch("app.services.knowledge_base_status.collection_name_for", return_value="proj_test__mistral__x")
@patch(
    "app.services.knowledge_base_status.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_readiness_cache_and_mark_kb_ready(_resolve, _collection, _expected):
    vdb = MagicMock()
    vdb.count.return_value = 5
    db = MagicMock()

    assert project_has_retrievable_content(vdb, db, _PROJECT, 2, source="chat") is True
    assert project_has_retrievable_content(vdb, db, _PROJECT, 2, source="chat") is True
    assert vdb.count.call_count == 1

    invalidate_kb_cache(_PROJECT)
    mark_kb_ready(_PROJECT)
    # mark_kb_ready only warms existing keys; after invalidate the next call recomputes.
    assert project_has_retrievable_content(vdb, db, _PROJECT, 2, source="chat") is True
    assert vdb.count.call_count == 2

    mark_kb_ready(_PROJECT)
    assert project_has_retrievable_content(vdb, db, _PROJECT, 2, source="chat") is True
    # Warm path: no extra count after mark_kb_ready.
    assert vdb.count.call_count == 2
