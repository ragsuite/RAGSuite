"""Tests for Google Drive connector sync selection."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services.connectors.google_drive import _collect_files_for_sync


def _meta(file_id: str, name: str = "doc") -> dict:
    return {"id": file_id, "name": name, "mimeType": "text/plain"}


@patch("app.services.connectors.google_drive._fetch_file_metas_by_ids")
@patch("app.services.connectors.google_drive._collect_files_recursive")
def test_collect_files_for_sync_merges_folders_and_explicit_files(mock_recursive, mock_fetch):
    mock_recursive.return_value = [_meta("f1"), _meta("f2")]
    mock_fetch.return_value = [_meta("f3")]

    service = MagicMock()
    result = _collect_files_for_sync(service, ["folder-a"], ["f2", "f3"], max_files=10)

    assert [m["id"] for m in result] == ["f1", "f2", "f3"]
    mock_fetch.assert_called_once_with(service, ["f3"])


@patch("app.services.connectors.google_drive._fetch_file_metas_by_ids")
@patch("app.services.connectors.google_drive._collect_files_recursive")
def test_collect_files_for_sync_files_only(mock_recursive, mock_fetch):
    mock_recursive.return_value = []
    mock_fetch.return_value = [_meta("only-file")]

    service = MagicMock()
    result = _collect_files_for_sync(service, [], ["only-file"], max_files=5)

    assert len(result) == 1
    assert result[0]["id"] == "only-file"
    mock_recursive.assert_called_once()
    mock_fetch.assert_called_once_with(service, ["only-file"])
