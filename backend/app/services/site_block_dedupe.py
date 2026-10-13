"""Near-identical site header/footer blocks count as one block.

A header often carries a few page-specific words (a teaser line, the active menu item),
so its exact hash differs on every page although the block is the same mega-menu.
Blocks of one kind whose word sets overlap at least ``NEAR_DUPLICATE_OVERLAP`` are
treated as the same block: only the first is stored and embedded.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Dict, Iterable, List

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

NEAR_DUPLICATE_OVERLAP = 0.9
_WORD_RE = re.compile(r"\w+", re.UNICODE)


def block_words(text: str) -> frozenset:
    return frozenset(_WORD_RE.findall((text or "").lower()))


def is_near_duplicate(words: frozenset, kept: Iterable[frozenset]) -> bool:
    """True when ``words`` overlap one of the ``kept`` word sets enough to be the same block."""
    for other in kept:
        union = len(words | other)
        if union and len(words & other) / union >= NEAR_DUPLICATE_OVERLAP:
            return True
    return False


def prune_duplicate_site_block_documents(
    db: Session, source_id: uuid.UUID, *, dry_run: bool = False
) -> Dict[str, int]:
    """Delete stored blocks that nearly repeat an older block of the same kind.

    The oldest block of each group is kept. A row whose vectors cannot be deleted is kept
    for a later retry. Returns ``{"kept": n, "duplicates": n, "removed": n}``.
    """
    from ..models import Document
    from .site_chrome_blocks import site_block_document_clause

    docs = (
        db.query(Document)
        .filter(Document.source_id == source_id, site_block_document_clause())
        .order_by(Document.indexed_at, Document.id)
        .all()
    )
    kept: Dict[str, List[frozenset]] = {}
    duplicates = []
    for doc in docs:
        kind = (doc.meta_data or {}).get("content_kind") or ""
        words = block_words(doc.text_content or "")
        if is_near_duplicate(words, kept.get(kind, ())):
            duplicates.append(doc)
        else:
            kept.setdefault(kind, []).append(words)
    summary = {"kept": sum(len(v) for v in kept.values()), "duplicates": len(duplicates), "removed": 0}
    if dry_run or not duplicates:
        return summary

    from .rag.singleton import locked_delete_document_embeddings

    for doc in duplicates:
        try:
            locked_delete_document_embeddings(str(doc.id))
        except Exception as exc:
            logger.warning("Site block %s vectors not deleted; keeping row for retry: %s", doc.id, exc)
            continue
        db.delete(doc)
        summary["removed"] += 1
    db.commit()
    logger.info(
        "Pruned %d near-duplicate site header/footer document(s) for source %s",
        summary["removed"], source_id,
    )
    return summary
