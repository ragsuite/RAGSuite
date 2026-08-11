"""Tests for shared connector framework helpers."""
from __future__ import annotations

import sys
import uuid
from unittest.mock import MagicMock

from app.services.connectors.framework import (
    CONNECTOR_TYPE_CONFLUENCE,
    CONNECTOR_TYPE_GOOGLE_DRIVE,
    CONNECTOR_TYPE_NOTION,
    CONNECTOR_TYPE_SHAREPOINT,
    CONNECTOR_TYPE_SLACK,
    SOURCE_CONFLUENCE,
    SOURCE_GOOGLE_DRIVE,
    SOURCE_NOTION,
    SOURCE_SHAREPOINT,
    SOURCE_SLACK,
    purge_integration_documents_by_id,
    source_for_connector_type,
    validate_confluence_settings,
    validate_sharepoint_settings,
    validate_slack_settings,
)


def test_purge_integration_documents_by_id_deletes_matching_uploads():
    integration_id = uuid.uuid4()
    project_id = uuid.uuid4()
    keep_id = uuid.uuid4()
    remove_id = uuid.uuid4()

    integration = MagicMock()
    integration.connector_type = CONNECTOR_TYPE_GOOGLE_DRIVE

    keep_doc = MagicMock()
    keep_doc.id = keep_id
    keep_doc.meta_data = {"integration_id": str(uuid.uuid4())}

    remove_doc = MagicMock()
    remove_doc.id = remove_id
    remove_doc.meta_data = {"integration_id": str(integration_id)}

    db = MagicMock()
    # First query resolves ConnectorIntegration; second lists UploadedDocument.
    db.query.return_value.filter.return_value.first.return_value = integration
    db.query.return_value.filter.return_value.all.return_value = [keep_doc, remove_doc]

    mock_delete = MagicMock()
    fake_singleton = MagicMock()
    fake_singleton.locked_delete_document_embeddings = mock_delete
    fake_rag = MagicMock()
    fake_rag.singleton = fake_singleton

    prev_rag = sys.modules.get("app.services.rag")
    prev_singleton = sys.modules.get("app.services.rag.singleton")
    sys.modules["app.services.rag"] = fake_rag
    sys.modules["app.services.rag.singleton"] = fake_singleton
    try:
        deleted = purge_integration_documents_by_id(db, integration_id, project_id)
    finally:
        if prev_rag is None:
            sys.modules.pop("app.services.rag", None)
        else:
            sys.modules["app.services.rag"] = prev_rag
        if prev_singleton is None:
            sys.modules.pop("app.services.rag.singleton", None)
        else:
            sys.modules["app.services.rag.singleton"] = prev_singleton

    assert deleted == 1
    mock_delete.assert_called_once_with(str(remove_id))
    db.delete.assert_called_once_with(remove_doc)
    db.commit.assert_called_once()


def test_source_for_connector_type_mapping():
    assert source_for_connector_type(CONNECTOR_TYPE_GOOGLE_DRIVE) == SOURCE_GOOGLE_DRIVE
    assert source_for_connector_type(CONNECTOR_TYPE_NOTION) == SOURCE_NOTION
    assert source_for_connector_type(CONNECTOR_TYPE_CONFLUENCE) == SOURCE_CONFLUENCE
    assert source_for_connector_type(CONNECTOR_TYPE_SHAREPOINT) == SOURCE_SHAREPOINT
    assert source_for_connector_type(CONNECTOR_TYPE_SLACK) == SOURCE_SLACK
    assert source_for_connector_type("unknown") == SOURCE_GOOGLE_DRIVE


def test_validate_confluence_settings_defaults_and_clamps():
    cfg = validate_confluence_settings({})
    assert cfg["cadence_minutes"] == 30
    assert cfg["max_pages"] == 100
    assert cfg["max_size_mb"] == 50

    clamped = validate_confluence_settings({"cadence_minutes": 1, "max_pages": 9999, "max_size_mb": 0})
    assert clamped["cadence_minutes"] == 5
    assert clamped["max_pages"] == 500
    assert clamped["max_size_mb"] == 1


def test_validate_sharepoint_settings_defaults_and_clamps():
    cfg = validate_sharepoint_settings({})
    assert cfg["max_files"] == 100
    assert cfg["exclude_images"] is True

    clamped = validate_sharepoint_settings(
        {"cadence_minutes": 2, "max_files": 9999, "exclude_videos": False}
    )
    assert clamped["cadence_minutes"] == 5
    assert clamped["max_files"] == 500
    assert clamped["exclude_videos"] is False


def test_validate_slack_settings_defaults_and_clamps():
    cfg = validate_slack_settings({})
    assert cfg["max_messages"] == 200
    assert cfg["include_threads"] is True
    assert cfg["include_files"] is True

    clamped = validate_slack_settings(
        {"cadence_minutes": 1, "max_messages": 5000, "include_files": False}
    )
    assert clamped["cadence_minutes"] == 5
    assert clamped["max_messages"] == 1000
    assert clamped["include_files"] is False
