"""Structured item records extracted automatically from crawled pages.

Pages stay the source of truth: records are derived (schema.org data, page text, optional
model gap-fill), refreshed on every crawl, and used to answer list / filter / lowest /
brand questions exactly while the answer still cites the item pages.
"""
from __future__ import annotations

import os


def is_enabled() -> bool:
    return (os.getenv("RAG_CATALOG_ENABLED") or "1").strip().lower() not in ("0", "false", "no", "off")
