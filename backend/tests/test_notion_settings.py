"""Tests for Notion connector settings validation."""
from __future__ import annotations

from app.services.connectors.framework import validate_notion_settings


def test_validate_notion_settings_defaults():
    cfg = validate_notion_settings({})
    assert cfg["cadence_minutes"] == 30
    assert cfg["max_pages"] == 100
    assert cfg["include_attachments"] is True
    assert cfg["include_comments"] is True


def test_validate_notion_settings_clamps():
    cfg = validate_notion_settings(
        {
            "cadence_minutes": 1,
            "max_pages": 9999,
            "include_attachments": False,
        }
    )
    assert cfg["cadence_minutes"] == 5
    assert cfg["max_pages"] == 500
    assert cfg["include_attachments"] is False
