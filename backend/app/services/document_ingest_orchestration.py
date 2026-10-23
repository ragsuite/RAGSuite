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
from typing import TYPE_CHECKING, Any, Callable, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..settings import settings

if TYPE_CHECKING:
    from .document_training_progress import DocumentTrainingProgress

logger = logging.getLogger(__name__)

_SPLIT_UNSET = object()


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


def write_ingest_bytes(
    *,
    project_id,
    document_id: str,
    filename: str,
    content: bytes,
) -> tuple[str, Optional[str]]:
    """Persist ingest bytes to MinIO when configured. Returns (path_or_key, storage_key)."""
    from app.platform import blob_store

    if blob_store.configured():
        key = blob_store.blob_key(project_id, document_id, filename)
        blob_store.put(key, content or b"")
        return key, key
    path = staging_path_for_document(str(document_id), filename)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(content or b"")
    return path, None


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
    db: Session,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
    target,
    language: Optional[str] = None,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "save_path": save_path,
        "document_id": document_id,
        "user_id": user_id,
        "project_id": str(project_id),
        "embedding_provider": target.provider,
        "embedding_model": target.model,
        "embedding_api_key": target.api_key,
        "embedding_endpoint": getattr(target, "endpoint", None),
        "embedding_api_version": getattr(target, "api_version", None),
    }
    if language:
        kwargs["language"] = language
    try:
        from ..models import Project, UploadedDocument
        from .rag.chunk_profiles import profile_for_source
        from .rag.pdf_page_extract import ingest_kwargs_from_document

        kwargs["chunk_profile"] = profile_for_source(filename=save_path)
        project = db.get(Project, project_id)
        if project is not None:
            kwargs["enhance_index"] = getattr(project, "enhance_index", None)
        try:
            doc_uuid = uuid.UUID(str(document_id))
        except (TypeError, ValueError):
            doc_uuid = None
        if doc_uuid is not None:
            uploaded = db.get(UploadedDocument, doc_uuid)
            if uploaded is not None:
                kwargs.update(ingest_kwargs_from_document(uploaded))
    except Exception:
        pass
    return kwargs


def _document_targets(db: Session, project_id: uuid.UUID, document_id: str):
    """Pinned provider target, else every distinct Search/Chat collection."""
    from .document_embedding_target import document_ingest_targets, stored_document_ingest_target

    targets = document_ingest_targets(db, project_id, stored_document_ingest_target(db, document_id))
    if not targets:
        logger.warning(
            "No usable embedding target for document %s (pinned provider not configured)",
            document_id,
        )
    return targets


def _purge_stale_targets(db: Session, document_id: str, targets, chunks: int) -> None:
    if chunks <= 0:
        return
    from .document_embedding_target import purge_stale_document_embedding_collections

    purge_stale_document_embedding_collections(db, document_id, targets)


def _training_mode(db: Session, document_id: str) -> str:
    from ..models import UploadedDocument
    from .document_training_progress import MODE_TRAIN, training_mode_for

    try:
        row = (
            db.query(UploadedDocument.chunks, UploadedDocument.status)
            .filter(UploadedDocument.id == uuid.UUID(str(document_id)))
            .first()
        )
    except Exception:
        return MODE_TRAIN
    return training_mode_for(row[0], row[1]) if row else MODE_TRAIN


def _upload_language(db: Session, document_id: str) -> Optional[str]:
    try:
        from ..models import UploadedDocument

        row = (
            db.query(UploadedDocument)
            .filter(UploadedDocument.id == uuid.UUID(str(document_id)))
            .first()
        )
        lang = getattr(row, "language", None) if row else None
        return str(lang).strip().lower()[:16] if lang else None
    except Exception:
        return None


def _parse_kwargs_for_document(
    *,
    db: Session,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "document_id": document_id,
        "user_id": user_id,
        "project_id": str(project_id),
    }
    language = _upload_language(db, document_id)
    if language:
        kwargs["language"] = language
    try:
        from ..models import Project, UploadedDocument
        from .rag.chunk_profiles import profile_for_source
        from .rag.pdf_page_extract import ingest_kwargs_from_document

        kwargs["chunk_profile"] = profile_for_source(filename=save_path)
        project = db.get(Project, project_id)
        if project is not None:
            kwargs["enhance_index"] = getattr(project, "enhance_index", None)
        try:
            doc_uuid = uuid.UUID(str(document_id))
        except (TypeError, ValueError):
            doc_uuid = None
        if doc_uuid is not None:
            uploaded = db.get(UploadedDocument, doc_uuid)
            if uploaded is not None:
                kwargs.update(ingest_kwargs_from_document(uploaded))
                title = (getattr(uploaded, "title", None) or "").strip()
                if title:
                    kwargs["title"] = title
    except Exception:
        pass
    return kwargs


def parse_document_sync(
    db: Session,
    *,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
    progress: Optional["DocumentTrainingProgress"] = None,
    split_config: Any = _SPLIT_UNSET,
) -> Optional[dict[str, Any]]:
    """Extract and chunk once. Does not embed or write vectors."""
    from .rag.parsed_document import save_parsed
    from .rag.singleton import get_pipeline

    kwargs = _parse_kwargs_for_document(
        db=db,
        save_path=save_path,
        document_id=document_id,
        user_id=user_id,
        project_id=project_id,
    )
    if split_config is not _SPLIT_UNSET:
        if split_config:
            kwargs["split_config"] = split_config
        else:
            kwargs.pop("split_config", None)
    if progress is not None:
        progress.begin_phase("parse")
        progress.update("reading", 0, 1)
    pipeline = get_pipeline()
    if pipeline is None:
        return None
    parsed = pipeline.prepare_parse(
        save_path,
        document_id=document_id,
        chunk_profile=kwargs.get("chunk_profile"),
        pdf_page_from=kwargs.get("pdf_page_from"),
        pdf_page_to=kwargs.get("pdf_page_to"),
        pdf_strip_chrome=bool(kwargs.get("pdf_strip_chrome")),
        extract_engine=kwargs.get("extract_engine"),
        pdf_strip_header=kwargs.get("pdf_strip_header"),
        pdf_strip_footer=kwargs.get("pdf_strip_footer"),
        ocr_model=kwargs.get("ocr_model"),
        split_config=kwargs.get("split_config"),
    )
    if progress is not None:
        progress.update("reading", 1, 1)
    if not parsed:
        return None
    display_title = (kwargs.get("title") or "").strip()
    if display_title:
        for meta in parsed.get("chunk_metadata") or []:
            if isinstance(meta, dict):
                meta["title"] = display_title[:500]
    display_language = (kwargs.get("language") or "").strip().lower()[:16]
    if display_language:
        for meta in parsed.get("chunk_metadata") or []:
            if isinstance(meta, dict):
                meta["language"] = display_language
    parsed_key = save_parsed(
        project_id,
        document_id,
        {
            "texts": parsed["texts"],
            "chunk_metadata": parsed.get("chunk_metadata") or [],
            "document_id": parsed["document_id"],
            "chunks": parsed["chunks"],
        },
        staging_fallback=save_path,
    )
    parsed["parsed_key"] = parsed_key
    return parsed


def embed_parsed_to_all_targets_sync(
    db: Session,
    *,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
    parsed: dict[str, Any],
    progress: Optional["DocumentTrainingProgress"] = None,
) -> Tuple[str, int]:
    """Embed a parse payload into every target collection and replace under lock."""
    from .rag.singleton import locked_replace_parsed

    targets = _document_targets(db, project_id, document_id)
    if not targets:
        return "Indexing Failed", 0
    if progress is not None:
        progress.begin_phase("embed")
        progress.set_target_count(len(targets))
    language = _upload_language(db, document_id)
    primary_status, primary_chunks = "Indexing Failed", 0
    for idx, target in enumerate(targets):
        kwargs = _ingest_kwargs_for_target(
            db=db,
            save_path=save_path,
            document_id=document_id,
            user_id=user_id,
            project_id=project_id,
            target=target,
            language=language,
        )
        if progress is not None:
            kwargs["on_progress"] = progress.for_target(idx)
        try:
            result = locked_replace_parsed(save_path, parsed, **{
                k: v for k, v in kwargs.items() if k != "save_path"
            })
            status, chunks = _parse_ingest_result(result)
        except Exception as exc:
            from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

            if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
                raise
            logger.error(
                "Embed failed for document %s target=%s: %s",
                document_id,
                target.source,
                exc,
            )
            status, chunks = "Indexing Failed", 0
        if idx == 0:
            primary_status, primary_chunks = status, chunks
    _purge_stale_targets(db, document_id, targets, primary_chunks)
    return primary_status, primary_chunks


def ingest_document_to_all_targets_sync(
    db: Session,
    *,
    save_path: str,
    document_id: str,
    user_id: int,
    project_id: uuid.UUID,
    run_ingest: Callable[..., Any],
    progress: Optional["DocumentTrainingProgress"] = None,
) -> Tuple[str, int]:
    """
    Embed an upload into its pinned provider collection, or every distinct Search/Chat
    collection when unpinned. Returns status/chunks from the primary ingest (Documents UI).
    """
    from .rag.singleton import locked_ingest

    targets = _document_targets(db, project_id, document_id)
    if not targets:
        return "Indexing Failed", 0

    language = _upload_language(db, document_id)
    if progress is not None:
        progress.set_target_count(len(targets))
    primary_status, primary_chunks = "Indexing Failed", 0
    for idx, target in enumerate(targets):
        kwargs = _ingest_kwargs_for_target(
            db=db,
            save_path=save_path,
            document_id=document_id,
            user_id=user_id,
            project_id=project_id,
            target=target,
            language=language,
        )
        if progress is not None:
            kwargs["on_progress"] = progress.for_target(idx)
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

    _purge_stale_targets(db, document_id, targets, primary_chunks)
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
    from .document_training_progress import DocumentTrainingProgress
    from .ingest_runtime import run_ingest_async

    targets = _document_targets(db, project_id, document_id)
    if not targets:
        return "Indexing Failed", 0

    ingest_timeout = max(60, int(settings.document_ingest_timeout_seconds))
    primary_status, primary_chunks = "Indexing Failed", 0
    language = _upload_language(db, document_id)
    progress = DocumentTrainingProgress(
        document_id, mode=_training_mode(db, document_id), target_count=len(targets)
    )

    async def _run_one(target, target_index: int) -> Tuple[str, int]:
        from .rag.singleton import locked_ingest

        kwargs = _ingest_kwargs_for_target(
            db=db,
            save_path=save_path,
            document_id=document_id,
            user_id=user_id,
            project_id=project_id,
            target=target,
            language=language,
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
                embedding_endpoint=kwargs.get("embedding_endpoint"),
                embedding_api_version=kwargs.get("embedding_api_version"),
                language=kwargs.get("language"),
                chunk_profile=kwargs.get("chunk_profile"),
                enhance_index=kwargs.get("enhance_index"),
                pdf_page_from=kwargs.get("pdf_page_from"),
                pdf_page_to=kwargs.get("pdf_page_to"),
                pdf_strip_chrome=kwargs.get("pdf_strip_chrome"),
                extract_engine=kwargs.get("extract_engine"),
                pdf_strip_header=kwargs.get("pdf_strip_header"),
                pdf_strip_footer=kwargs.get("pdf_strip_footer"),
                ocr_model=kwargs.get("ocr_model"),
                split_config=kwargs.get("split_config"),
                on_progress=progress.for_target(target_index),
            ),
            timeout=ingest_timeout,
        )
        return _parse_ingest_result(result)

    try:
        for idx, target in enumerate(targets):
            status, chunks = await _run_one(target, idx)
            if idx == 0:
                primary_status, primary_chunks = status, chunks
            elif chunks == 0:
                logger.warning(
                    "Secondary ingest produced 0 chunks document=%s target=%s collection=%s",
                    document_id,
                    target.source,
                    target.collection,
                )
        _purge_stale_targets(db, document_id, targets, primary_chunks)
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
    finally:
        progress.finish()


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

    storage_key = None
    try:
        from ..models import UploadedDocument
        row = db.query(UploadedDocument).filter(UploadedDocument.id == document_id).first()
        storage_key = getattr(row, "storage_key", None) if row else None
    except Exception:
        storage_key = None
    enqueued = enqueue_document_ingest(
        str(document_id),
        staging_path,
        user_id=user_id,
        project_id=project_id,
        storage_key=storage_key,
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
            detail="Could not start training for this document. Try again shortly.",
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
