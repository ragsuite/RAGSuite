"""Filter retrieved chunks to documents / crawl sources that still exist in the project."""
from __future__ import annotations

from typing import Any, Optional, Set

_CRAWL_SOURCE_FILE_PREFIX = "crawl_source_"


def chunk_references_live_item(meta: Any, live_item_ids: Optional[Set[str]]) -> bool:
    """True when chunk metadata points at a live uploaded document or crawl source.

    ``live_item_ids`` holds uploaded-document ids and crawl-source ids (``None`` = no filter).
    Crawl chunks carry a per-page ``document_id`` that is never in that set, so every id key
    and the ``crawl_source_<id>`` source file must be checked, not just the first key present.
    """
    if live_item_ids is None:
        return True
    if not isinstance(meta, dict):
        return False
    for key in ("document_id", "crawl_source_id", "source_id"):
        val = meta.get(key)
        if val and str(val).strip() and str(val) in live_item_ids:
            return True
    source_file = str(meta.get("source_file") or "")
    if source_file.startswith(_CRAWL_SOURCE_FILE_PREFIX):
        if source_file[len(_CRAWL_SOURCE_FILE_PREFIX):] in live_item_ids:
            return True
    return False


__all__ = ["chunk_references_live_item"]
