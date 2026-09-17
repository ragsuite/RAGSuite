"""Shipped UI surface snapshot for AI Assistant (Docker-safe, no RAG).

Live monorepo loads frontend nav + en.ts. API images copy modules/ but not
frontend/, so Settings inventory would otherwise collapse to Setup + Integrations.
This snapshot is generated from the same nav/i18n sources and travels with the module.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_SNAPSHOT_NAME = "ui_surface_snapshot.json"


def _snapshot_path() -> Path:
    return Path(__file__).resolve().parent / "data" / _SNAPSHOT_NAME


@lru_cache(maxsize=1)
def load_ui_surface_snapshot() -> dict[str, Any]:
    path = _snapshot_path()
    if not path.is_file():
        logger.warning("AI Assistant: ui_surface_snapshot missing at %s", path)
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("AI Assistant: failed to read ui_surface_snapshot: %s", exc)
        return {}
    return raw if isinstance(raw, dict) else {}


def snapshot_labels() -> dict[str, str]:
    raw = load_ui_surface_snapshot().get("labels") or {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        if isinstance(key, str) and isinstance(value, str) and key.strip() and value.strip():
            out[key] = value
    return out


def snapshot_config_sections() -> list[dict[str, Any]]:
    raw = load_ui_surface_snapshot().get("config_sections") or []
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict) and item.get("section_id")]


def snapshot_setup_modules(route: str) -> list[dict[str, Any]]:
    by_route = load_ui_surface_snapshot().get("setup_modules") or {}
    if not isinstance(by_route, dict):
        return []
    items = by_route.get(route) or []
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict) and item.get("title_key")]


def snapshot_has_config_sections() -> bool:
    return bool(snapshot_config_sections())
