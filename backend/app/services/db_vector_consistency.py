"""
Helpers for safer Postgres <-> Chroma mutation ordering.

Principle:
- Prefer relational delete/commit first.
- Run vector purge after successful DB commit.
- On DB write failure after vector ingest, try compensating vector purge.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from .job_queue import enqueue_purge_crawl_source, enqueue_purge_uploaded_document
from .rag.singleton import (
    chroma_write_lock,
    get_pipeline,
    locked_delete_crawl_source_embeddings,
    locked_purge_document,
)

logger = logging.getLogger(__name__)


def purge_uploaded_document_after_db_delete(document_id: str) -> bool:
    """
    Best-effort vector purge after DB row is already deleted.
    Queue durable job first; fallback to inline lock-guarded purge.
    """
    if enqueue_purge_uploaded_document(str(document_id), pattern=f"{document_id}_%"):
        return True
    return bool(
        locked_purge_document(str(document_id), source_file_pattern=f"{document_id}_%")
    )


def compensate_uploaded_document_on_db_failure(document_id: str) -> None:
    """
    DB commit failed after ingest; attempt immediate vector compensation.
    """
    try:
        ok = locked_purge_document(str(document_id), source_file_pattern=f"{document_id}_%")
        if not ok:
            logger.warning(
                "Compensation purge may be incomplete for uploaded document %s", document_id
            )
    except Exception as exc:
        logger.error(
            "Compensation purge failed for uploaded document %s: %s",
            document_id,
            exc,
        )


def purge_crawl_source_after_db_delete(source_id: str, user_id: Optional[int]) -> bool:
    """
    Best-effort crawl source vector purge after DB delete/commit.
    """
    if enqueue_purge_crawl_source(str(source_id), user_id=user_id):
        return True
    return bool(locked_delete_crawl_source_embeddings(str(source_id)))


def purge_project_after_db_delete(project_id: str) -> bool:
    """
    Best-effort project vector purge after DB delete/commit.
    """
    from .rag.singleton import locked_delete_project_embeddings

    return bool(locked_delete_project_embeddings(str(project_id)))


def safe_transfer_project_embeddings(
    *,
    from_project_id: str,
    to_project_id: str,
) -> int:
    """
    Safely re-associate vectors from one project to another.

    Strategy:
    1) Read source project vectors.
    2) Add cloned vectors to destination (new IDs + updated metadata).
    3) Delete old source vectors only after destination add succeeds.

    This avoids the high-risk delete-then-add window.
    """
    pipeline = get_pipeline()
    if not pipeline:
        return 0

    source_project = str(from_project_id)
    target_project = str(to_project_id)

    with chroma_write_lock():
        all_results = pipeline.vdb.collection.get(
            where={"project_id": source_project},
            limit=999999,
            include=["metadatas", "embeddings", "documents"],
        )
        if not all_results or not all_results.get("ids"):
            return 0

        ids = all_results.get("ids") or []
        metadatas = all_results.get("metadatas") or []
        embeddings = all_results.get("embeddings") or []
        documents = all_results.get("documents") or []

        if not ids or len(ids) != len(embeddings) or len(ids) != len(documents):
            logger.warning(
                "Skipping project embedding transfer due to mismatched vectors: ids=%s, embeddings=%s, documents=%s",
                len(ids),
                len(embeddings),
                len(documents),
            )
            return 0

        updated_metadatas = []
        for idx, meta in enumerate(metadatas):
            m = (meta or {}).copy()
            m["project_id"] = target_project
            m["transfer_from_project_id"] = source_project
            m["transfer_index"] = idx
            updated_metadatas.append(m)
        while len(updated_metadatas) < len(ids):
            updated_metadatas.append(
                {
                    "project_id": target_project,
                    "transfer_from_project_id": source_project,
                }
            )

        # New ids avoid collisions and keep operation additive-first.
        new_ids = [f"{row_id}__xfer__{uuid.uuid4().hex[:10]}" for row_id in ids]

        pipeline.vdb.collection.add(
            ids=new_ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=updated_metadatas[: len(new_ids)],
        )

        # Remove old only after destination add succeeded.
        pipeline.vdb.collection.delete(ids=ids)
        return len(new_ids)
