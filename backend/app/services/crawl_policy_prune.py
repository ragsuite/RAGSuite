"""Drop crawl documents whose URLs the current source policy would skip."""
from __future__ import annotations

import logging
import uuid
from typing import Callable

from sqlalchemy.orm import Session

from ..models import Document

logger = logging.getLogger(__name__)


def prune_policy_skipped_documents(
    db: Session,
    source_id: uuid.UUID,
    is_skipped: Callable[[str], bool],
) -> int:
    """Delete documents (and their vectors) whose URL the crawl policy would skip.

    ``is_skipped`` is the source's current denylist/allowlist decision. Vectors are
    removed first; a failed vector delete keeps the row for retry.
    """
    docs = db.query(Document).filter(Document.source_id == source_id).all()
    stale = [doc for doc in docs if is_skipped(doc.url or "")]
    if not stale:
        return 0

    from .rag.singleton import locked_delete_document_embeddings

    removed = 0
    for doc in stale:
        try:
            locked_delete_document_embeddings(str(doc.id))
        except Exception as exc:
            logger.warning(
                "Policy-skipped %s vectors not deleted; keeping row for retry: %s",
                doc.id,
                exc,
            )
            continue
        db.delete(doc)
        removed += 1
    db.commit()
    if removed:
        logger.info(
            "Pruned %d policy-skipped document(s) for source %s",
            removed,
            source_id,
        )
        try:
            from .rag.singleton import get_pipeline

            pipeline = get_pipeline()
            if pipeline is not None:
                pipeline.clear_query_cache()
        except Exception as exc:
            logger.warning("clear_query_cache after policy prune failed: %s", exc)
    return removed
