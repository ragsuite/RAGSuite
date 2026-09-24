"""Shared delete flows used by REST routes and MCP tools."""
from __future__ import annotations

import glob
import logging
import os
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
    CrawlJob,
    CrawlSource,
    Document,
    Project,
    UploadedDocument,
)
from app.services.audit_service import emit_audit
from app.services.db_vector_consistency import (
    purge_crawl_source_after_db_delete,
    purge_project_after_db_delete,
    purge_uploaded_document_after_db_delete,
)
from app.services.job_queue import INGEST_TRANSITIONAL_STATUSES
from app.services.notification_service import create_notification
from app.services.project_deletion_service import delete_project_related_rows
from app.settings import settings

logger = logging.getLogger(__name__)


def apply_document_metadata(doc: UploadedDocument, fields: dict) -> list[str]:
    """Set metadata columns that exist on the document. Returns the fields that were written."""
    written = []
    for field, value in fields.items():
        if hasattr(doc, field):
            setattr(doc, field, value)
            written.append(field)
    return written


def delete_uploaded_document(
    db: Session,
    doc: UploadedDocument,
    *,
    user_id: int,
    background_tasks=None,
    request=None,
) -> uuid.UUID:
    """Remove an uploaded document the same way the documents REST route does."""
    doc_id = doc.id
    doc_project_id = doc.project_id
    doc_title = doc.title
    staging_dir = settings.document_staging_dir
    for path in glob.glob(os.path.join(staging_dir, f"{doc_id}_*")):
        try:
            os.remove(path)
            logger.info("Deleted staging file %s for document %s", path, doc_id)
        except OSError as exc:
            logger.warning("Could not delete staging file %s: %s", path, exc)

    if doc.status in INGEST_TRANSITIONAL_STATUSES:
        active_bg = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
                BackgroundJob.status.in_([BackgroundJobStatus.PENDING.value, BackgroundJobStatus.RUNNING.value]),
                BackgroundJob.payload["document_id"].as_string() == str(doc_id),
            )
            .first()
        )
        if active_bg:
            active_bg.status = BackgroundJobStatus.FAILED.value
            active_bg.error = "Cancelled: document deleted by user"
            db.commit()
            logger.info("Cancelled active ingest job for document %s before deletion", doc_id)

    db.delete(doc)
    db.commit()
    logger.info("Deleted document %s from PostgreSQL", doc_id)
    _drop_project_caches(doc_project_id, doc_id, "document")
    _purge(
        background_tasks,
        lambda: purge_uploaded_document_after_db_delete(str(doc_id)),
        "document",
        str(doc_id),
    )
    if request is not None:
        emit_audit(
            event_type="document.deleted",
            request=request,
            user_id=user_id,
            project_id=doc_project_id,
            resource_type="document",
            resource_id=str(doc_id),
            summary=f"Document deleted: {doc_title}",
            background_tasks=background_tasks,
            db=db,
        )
    return doc_id


def delete_crawl_source_record(
    db: Session,
    source: CrawlSource,
    *,
    user_id: int,
    background_tasks=None,
    request=None,
) -> uuid.UUID:
    """Delete a crawl source, its pages, and its jobs."""
    from app.routes.crawl import _cancel_active_crawl_work_for_source

    source_id = source.id
    project_id = source.project_id
    name = source.name
    _cancel_active_crawl_work_for_source(db, source_id, reason="Cancelled: crawl source deleted by user")
    db.query(Document).filter(Document.source_id == source_id).delete(synchronize_session=False)
    db.query(CrawlJob).filter(CrawlJob.source_id == source_id).delete(synchronize_session=False)
    db.delete(source)
    db.commit()
    _drop_project_caches(project_id, source_id, "crawl source")
    _purge(
        background_tasks,
        lambda: purge_crawl_source_after_db_delete(str(source_id), user_id=user_id),
        "crawl source",
        str(source_id),
    )
    if request is not None:
        emit_audit(
            event_type="crawl.source.deleted",
            request=request,
            user_id=user_id,
            project_id=project_id,
            resource_type="crawl_source",
            resource_id=str(source_id),
            summary=f"Crawl source deleted: {name}",
            background_tasks=background_tasks,
            db=db,
        )
    return source_id


def delete_project_record(
    db: Session,
    project: Project,
    *,
    user_id: int,
    request=None,
) -> None:
    """Delete a project that is not the active one, then purge its vectors."""
    project_id = project.id
    project_name = project.name
    if request is not None:
        try:
            emit_audit(
                event_type="project.deleted",
                request=request,
                user_id=user_id,
                project_id=None,
                resource_type="project",
                resource_id=str(project_id),
                summary=f"Project deleted: {project_name}",
                details={"project_id": str(project_id), "project_name": project_name},
                db=db,
            )
        except Exception as audit_error:
            logger.warning("Failed to record project deletion audit event: %s", audit_error)
    delete_project_related_rows(db, project_id)
    db.commit()
    try:
        purge_project_after_db_delete(str(project_id))
    except Exception:
        logger.exception("Error deleting embeddings for project %s", project_id)
    try:
        create_notification(
            db=db,
            user_id=user_id,
            title="Project Deleted",
            message=f"Project '{project_name}' has been deleted successfully.",
            type="info",
            action_url="/projects",
        )
    except Exception as notif_error:
        logger.warning("Failed to create project deletion notification: %s", notif_error)


def mark_notification_read(db: Session, user_id: int, notification_id: uuid.UUID):
    from app.models import Notification

    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if notification is None:
        return None
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


def mark_all_notifications_read(db: Session, user_id: int) -> int:
    from app.models import Notification

    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .update({"is_read": True})
    )
    db.commit()
    return int(updated or 0)


def _drop_project_caches(project_id, resource_id, label: str) -> None:
    if project_id is not None:
        try:
            from app.services.reindex_service import invalidate_item_embedding_coverage_cache

            invalidate_item_embedding_coverage_cache(str(project_id))
        except Exception as exc:
            logger.warning("Coverage cache invalidate after %s delete failed for %s: %s", label, resource_id, exc)
    try:
        from app.services.rag.singleton import get_pipeline

        pipeline = get_pipeline()
        if pipeline is not None:
            pipeline.clear_query_cache()
    except Exception as exc:
        logger.warning("Query cache clear after %s delete failed for %s: %s", label, resource_id, exc)


def _purge(background_tasks, fn, label: str, resource_id: str) -> None:
    def _run() -> None:
        try:
            fn()
        except Exception:
            logger.exception("Vector purge after %s delete failed for %s", label, resource_id)

    if background_tasks is not None:
        background_tasks.add_task(_run)
        return
    _run()
