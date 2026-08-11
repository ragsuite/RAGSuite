"""
Unified document ingest path: queue via durable jobs (like crawl) or inline fallback.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..settings import settings

logger = logging.getLogger(__name__)


@dataclass
class DocumentIngestResult:
    doc_status: str
    chunks_count: int
    message: str
    async_queued: bool = False
    enqueue_status: Optional[str] = None
    http_status: int = 200


def use_async_document_ingest() -> bool:
    return bool(settings.enable_durable_jobs and settings.enable_async_document_ingest)


def staging_path_for_document(document_id: str, entry_name: str) -> str:
    base = (settings.document_staging_dir or "data/staging").strip()
    os.makedirs(base, exist_ok=True)
    safe_name = Path(entry_name).name or "upload"
    return os.path.join(base, f"{document_id}_{safe_name}")


def _parse_ingest_result(result) -> Tuple[str, int]:
    if isinstance(result, dict):
        chunks = int(result.get("chunks", 0) or 0)
        status = str(result.get("status") or "Indexed")
        if chunks == 0:
            if status.lower() in ("indexed", "index"):
                return "No Text Extracted", 0
            return status if status else "No Text Extracted", 0
        return status if status else "Indexed", chunks
    chunks = int(result) if result else 0
    return ("Indexed" if chunks > 0 else "No Text Extracted", chunks)


def _ingest_kwargs_for_target(
    *,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
    target,
) -> dict[str, Any]:
    return {
        "save_path": save_path,
        "document_id": document_id,
        "user_id": user_id,
        "project_id": str(project_id),
        "embedding_provider": target.provider,
        "embedding_model": target.model,
        "embedding_api_key": target.api_key,
    }


def ingest_document_to_all_targets_sync(
    db: Session,
    *,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
    run_ingest: Callable[..., Any],
) -> Tuple[str, int]:
    """
    Embed an upload into every distinct Search/Chat collection for the project.
    Returns status/chunks from the Search ingest (Documents UI).
    """
    from .rag.embedding_resolver import resolve_upload_ingest_targets
    from .rag.singleton import locked_ingest

    targets = resolve_upload_ingest_targets(db, project_id)
    if not targets:
        return "Indexing Failed", 0

    primary_status, primary_chunks = "Indexing Failed", 0
    for idx, target in enumerate(targets):
        kwargs = _ingest_kwargs_for_target(
            save_path=save_path,
            document_id=document_id,
            user_id=user_id,
            project_id=project_id,
            target=target,
        )
        try:
            result = run_ingest(locked_ingest, save_path, **{
                k: v for k, v in kwargs.items() if k != "save_path"
            })
            status, chunks = _parse_ingest_result(result)
        except Exception as exc:
            from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

            if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
                raise
            logger.error(
                "Ingest failed for document %s target=%s: %s",
                document_id,
                target.source,
                exc,
            )
            status, chunks = "Indexing Failed", 0

        if idx == 0:
            primary_status, primary_chunks = status, chunks
        elif chunks == 0:
            logger.warning(
                "Secondary ingest produced 0 chunks document=%s target=%s collection=%s",
                document_id,
                target.source,
                target.collection,
            )
        else:
            logger.info(
                "Secondary ingest ok document=%s target=%s collection=%s chunks=%s",
                document_id,
                target.source,
                target.collection,
                chunks,
            )

    return primary_status, primary_chunks


async def ingest_document_inline(
    db: Session,
    *,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
) -> Tuple[str, int]:
    """Run ingest in the ingest thread pool (same as pre-async upload behavior)."""
    from .ingest_runtime import run_ingest_async
    from .rag.embedding_resolver import resolve_upload_ingest_targets

    targets = resolve_upload_ingest_targets(db, project_id)
    if not targets:
        return "Indexing Failed", 0

    ingest_timeout = max(60, int(settings.document_ingest_timeout_seconds))
    primary_status, primary_chunks = "Indexing Failed", 0

    async def _run_one(target) -> Tuple[str, int]:
        from .rag.singleton import locked_ingest

        kwargs = _ingest_kwargs_for_target(
            save_path=save_path,
            document_id=document_id,
            user_id=user_id,
            project_id=project_id,
            target=target,
        )
        result = await asyncio.wait_for(
            run_ingest_async(
                locked_ingest,
                save_path,
                document_id=kwargs["document_id"],
                user_id=kwargs["user_id"],
                project_id=kwargs["project_id"],
                embedding_provider=kwargs["embedding_provider"],
                embedding_model=kwargs["embedding_model"],
                embedding_api_key=kwargs["embedding_api_key"],
            ),
            timeout=ingest_timeout,
        )
        return _parse_ingest_result(result)

    try:
        for idx, target in enumerate(targets):
            status, chunks = await _run_one(target)
            if idx == 0:
                primary_status, primary_chunks = status, chunks
            elif chunks == 0:
                logger.warning(
                    "Secondary ingest produced 0 chunks document=%s target=%s collection=%s",
                    document_id,
                    target.source,
                    target.collection,
                )
        return primary_status, primary_chunks
    except asyncio.TimeoutError:
        logger.error(
            "Timed out ingesting document %s after %ss", document_id, ingest_timeout
        )
        return "Indexing Timed Out", 0
    except Exception as exc:
        from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

        if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
            raise
        logger.error("Failed to ingest document %s: %s", document_id, exc)
        return "Indexing Failed", 0


def queue_document_ingest(
    db: Session,
    *,
    document_id: uuid.UUID,
    staging_path: str,
    user_id: int,
    project_id: uuid.UUID,
    title: str,
) -> DocumentIngestResult:
    """Enqueue background indexing; caller must have committed Processing row first."""
    from ..models import UploadedDocument
    from .job_queue import (
        enqueue_document_ingest,
        wait_for_job_worker,
        worker_is_running,
    )

    enqueued = enqueue_document_ingest(
        str(document_id),
        staging_path,
        user_id=user_id,
        project_id=project_id,
    )
    if not enqueued:
        doc = db.query(UploadedDocument).filter(UploadedDocument.id == document_id).first()
        if doc:
            doc.status = "Indexing Failed"
            doc.chunks = 0
            db.commit()
        logger.error("Failed to enqueue document ingest document_id=%s", document_id)
        raise HTTPException(
            status_code=503,
            detail="Could not enqueue document indexing. Try again shortly.",
        )

    if not worker_is_running():
        ready = wait_for_job_worker(timeout_sec=30.0)
        if not ready:
            logger.error(
                "Background job worker not ready; document_id=%s left Processing",
                document_id,
            )
            return DocumentIngestResult(
                doc_status="Queued",
                chunks_count=0,
                message=(
                    f"Document '{title}' uploaded; indexing is queued "
                    "(background worker is starting)."
                ),
                async_queued=True,
                enqueue_status="pending_worker",
                http_status=202,
            )

    logger.info("Document ingest enqueued document_id=%s", document_id)
    return DocumentIngestResult(
        doc_status="Queued",
        chunks_count=0,
        message=f"Document '{title}' uploaded and queued for indexing.",
        async_queued=True,
        http_status=200,
    )
