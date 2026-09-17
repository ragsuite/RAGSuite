#!/usr/bin/env python3
"""Regenerate modules/ai_assistant/backend/data/ui_surface_snapshot.json from frontend nav + en.ts.

Run from repo root (or backend/) with the CE monorepo checkout so frontend/ is present:

  cd backend && .venv/bin/python ../modules/ai_assistant/scripts/generate_ui_surface_snapshot.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND = REPO_ROOT / "backend"
MODULES = REPO_ROOT / "modules"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(MODULES))

from app.platform.module_bootstrap import ensure_ragsuite_modules_path  # noqa: E402

ensure_ragsuite_modules_path()

from ragsuite_modules.ai_assistant.backend.ui_catalog import (  # noqa: E402
    _parse_en_labels,
    _repo_root,
)
from ragsuite_modules.ai_assistant.backend.ui_config_surfaces import (  # noqa: E402
    _PRODUCT_META,
    _parse_training_sub_tabs,
    _setup_subtitle_key,
    load_config_sections,
)

_LABEL_PREFIXES = (
    "chatbot.",
    "search.",
    "nav.",
    "integrations.",
)

_OUT = Path(__file__).resolve().parents[1] / "backend" / "data" / "ui_surface_snapshot.json"


def main() -> int:
    root = _repo_root()
    en_path = root / "frontend" / "src" / "i18n" / "locales" / "en.ts"
    all_labels = _parse_en_labels(en_path)
    if not all_labels:
        print(f"error: could not parse labels from {en_path}", file=sys.stderr)
        return 1

    labels = {
        key: value
        for key, value in all_labels.items()
        if any(key.startswith(prefix) for prefix in _LABEL_PREFIXES)
    }

    sections_live = load_config_sections()
    if not sections_live:
        print("error: load_config_sections() returned empty (nav parse failed)", file=sys.stderr)
        return 1

    config_sections: list[dict[str, object]] = []
    for section in sections_live:
        config_sections.append(
            {
                "route": section.route,
                "section_id": section.section_id,
                "title_key": section.title_key,
                "subtitle_key": section.subtitle_key,
                "nav_title_key": section.nav_title_key or "",
                "detail_route": section.detail_route or "",
                "feature_prefixes": list(section.feature_prefixes),
            }
        )

    setup_modules: dict[str, list[dict[str, str]]] = {}
    for route, meta in _PRODUCT_META.items():
        nav_path = root / str(meta["nav_file"])
        tabs = _parse_training_sub_tabs(nav_path)
        setup_modules[route] = [
            {
                "key": tab["key"],
                "title_key": tab["title_key"],
                "subtitle_key": _setup_subtitle_key(route, tab["key"]),
                "route": tab.get("route") or "",
            }
            for tab in tabs
        ]

    payload = {
        "version": 1,
        "source": {
            "en_locale": "frontend/src/i18n/locales/en.ts",
            "nav_files": [str(meta["nav_file"]) for meta in _PRODUCT_META.values()],
        },
        "labels": labels,
        "config_sections": config_sections,
        "setup_modules": setup_modules,
    }

    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {_OUT.relative_to(REPO_ROOT)} "
        f"({len(config_sections)} sections, {len(labels)} labels, "
        f"{sum(len(v) for v in setup_modules.values())} setup tabs)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
