"""Glue between ``RAG.query`` / ``RAG.stream_query`` and catalog item context.

Kept outside ``rag.py`` so the pipeline only calls a handful of small hooks; every hook
is a no-op when no item context was resolved for the question.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)

RECORD_BLOCK_HEADER_LIMIT = 6000


def record_requests(item_context: Any) -> Optional[List[Tuple[str, List[str]]]]:
    if item_context is None:
        return None
    try:
        return item_context.evidence_requests() or None
    except Exception:
        return None


def has_rows(item_context: Any) -> bool:
    return bool(item_context is not None and getattr(item_context, "has_rows", False))


def informs_answer(item_context: Any) -> bool:
    """Rows, closest matches or an explicit "not available" are all answerable."""
    if item_context is None:
        return False
    r = item_context.result
    return bool(r.rows or r.closest or r.brand_counts or r.mode in ("missing", "list"))


def outside_item_names(item_context: Any, query: str) -> str:
    """``query`` without the words of the item it names ("The Secret" is a book title, not a
    request for secrets), so query guards judge only what the user asks about the item."""
    if item_context is None or item_context.result.mode != "lookup" or not item_context.rows:
        return query
    named = {w.lower() for e in item_context.rows for w in re.findall(r"\w+", e.display_name)}
    return " ".join(w for w in re.findall(r"\S+", query or "") if re.sub(r"\W", "", w).lower() not in named)


def _doc_ids(passage_metas: Optional[Sequence[Any]]) -> List[Optional[str]]:
    out: List[Optional[str]] = []
    for meta in passage_metas or []:
        out.append(str(meta.get("document_id")) if isinstance(meta, dict) and meta.get("document_id") else None)
    return out


def context_with_records(item_context: Any, combined_context: str, passage_metas: Optional[Sequence[Any]]) -> str:
    if not informs_answer(item_context):
        return combined_context
    block = item_context.prompt_block(_doc_ids(passage_metas))[:RECORD_BLOCK_HEADER_LIMIT]
    return f"{block}\n\nPAGE PASSAGES:\n{combined_context}" if combined_context else block


def complete_answer(item_context: Any, answer: str) -> str:
    """A consistent answer that skipped the offered alternatives or the match count gets them added."""
    if not informs_answer(item_context) or not (answer or "").strip():
        return answer
    try:
        return item_context.complete(answer)
    except Exception as exc:
        logger.warning("Item answer completion skipped: %s", exc)
        return answer


def guard_answer(
    item_context: Any,
    answer: str,
    passage_metas: Optional[Sequence[Any]],
    *,
    refused: bool,
    retrieval_meta: Dict[str, Any],
) -> Optional[Tuple[str, List[int]]]:
    """Deterministic replacement when the model refused or contradicted the rows."""
    if not informs_answer(item_context):
        return None
    reason = "refused" if refused else item_context.contradicts(answer)
    retrieval_meta["item_records"] = {**item_context.to_meta(), "guard": reason}
    if reason is None:
        return None
    logger.info("Item records guard (%s) replaced answer: %.200s", reason, (answer or "").replace("\n", " "))
    fallback = item_context.fallback_answer()
    if not fallback:
        return None
    return fallback, item_context.passage_indices(_doc_ids(passage_metas))
