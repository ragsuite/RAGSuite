"""
Shared connector framework: credentials, settings validation, sync enqueue, purge.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ...models import (
    BackgroundJobType,
    ConnectorIntegration,
    ConnectorIntegrationStatus,
    ConnectorProjectCredential,
    ConnectorSettings,
    ConnectorSource,
    ConnectorSyncJob,
    ConnectorSyncJobStatus,
    UploadedDocument,
)
from ...security_utils import decrypt_secret, encrypt_secret
from ...settings import settings
from ..job_queue import enqueue_job

logger = logging.getLogger(__name__)

CONNECTOR_TYPE_GOOGLE_DRIVE = "google_drive"
SOURCE_GOOGLE_DRIVE = "google_drive"
CONNECTOR_TYPE_NOTION = "notion"
SOURCE_NOTION = "notion"
CONNECTOR_TYPE_CONFLUENCE = "confluence"
SOURCE_CONFLUENCE = "confluence"
CONNECTOR_TYPE_SHAREPOINT = "sharepoint"
SOURCE_SHAREPOINT = "sharepoint"
CONNECTOR_TYPE_SLACK = "slack"
SOURCE_SLACK = "slack"

DEFAULT_CONNECTOR_SETTINGS: Dict[str, Any] = {
    "cadence_minutes": 30,
    "max_files": 100,
    "max_size_mb": 50,
    "exclude_images": True,
    "exclude_videos": True,
}

CONNECTOR_SYNC_IDEMPOTENCY_PREFIX = "connector_sync:"
CONNECTOR_JOB_CLASS = "connector"
CONNECTOR_INGEST_PRIORITY = -1
CONNECTOR_MANUAL_SYNC_LIMIT = 6  # per minute per integration
CONNECTOR_BROWSE_LIMIT = 60  # per minute per user


def assert_connector_rate_limit(key: str, *, limit: int, window_seconds: int = 60) -> None:
    """Raise HTTP 429 when rate limit exceeded (Redis when available, else in-memory)."""
    try:
        from ..redis_client import get_redis

        redis = get_redis()
        if redis:
            count = int(redis.incr(key))
            if count == 1:
                redis.expire(key, window_seconds)
            if count > limit:
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please wait and try again.",
                )
            return
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug("Connector rate limit redis fallback: %s", exc)

    import time

    now = time.time()
    bucket = getattr(assert_connector_rate_limit, "_memory", None)
    if bucket is None:
        bucket = {}
        assert_connector_rate_limit._memory = bucket  # type: ignore[attr-defined]
    hits = [t for t in bucket.get(key, []) if now - t < window_seconds]
    if len(hits) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait and try again.",
        )
    hits.append(now)
    bucket[key] = hits


def resolve_oauth_credentials(
    db: Session,
    *,
    user_id: int,
    project_id: uuid.UUID,
    connector_type: str,
) -> Tuple[str, str, str]:
    cred = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == user_id,
            ConnectorProjectCredential.project_id == project_id,
            ConnectorProjectCredential.connector_type == connector_type,
        )
        .first()
    )
    if cred:
        return cred.client_id, decrypt_secret(cred.client_secret_encrypted), cred.redirect_uri

    if settings.google_client_id and settings.google_client_secret:
        redirect = settings.google_redirect_uri or ""
        if connector_type == CONNECTOR_TYPE_GOOGLE_DRIVE:
            redirect = redirect.replace("/gmail/auth/callback", "/connectors/google_drive/auth/callback")
        return settings.google_client_id, settings.google_client_secret, redirect

    raise HTTPException(
        status_code=400,
        detail=f"{connector_type} OAuth credentials are not configured for this project",
    )


DEFAULT_NOTION_SETTINGS: Dict[str, Any] = {
    "cadence_minutes": 30,
    "max_pages": 100,
    "max_blocks_per_page": 500,
    "max_db_rows": 100,
    "max_size_mb": 50,
    "max_attachments_per_page": 20,
    "max_comments_per_page": 100,
    "include_attachments": True,
    "include_comments": True,
}


DEFAULT_CONFLUENCE_SETTINGS: Dict[str, Any] = {
    "cadence_minutes": 30,
    "max_pages": 100,
    "max_size_mb": 50,
}


DEFAULT_SHAREPOINT_SETTINGS: Dict[str, Any] = {
    "cadence_minutes": 30,
    "max_files": 100,
    "max_size_mb": 50,
    "exclude_images": True,
    "exclude_videos": True,
}


DEFAULT_SLACK_SETTINGS: Dict[str, Any] = {
    "cadence_minutes": 30,
    "max_messages": 200,
    "max_size_mb": 10,
    "include_threads": True,
    "include_files": True,
}


def validate_notion_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = dict(DEFAULT_NOTION_SETTINGS)
    if raw:
        merged.update({k: v for k, v in raw.items() if v is not None})

    merged["cadence_minutes"] = max(5, min(int(merged.get("cadence_minutes", 30)), 1440))
    merged["max_pages"] = max(1, min(int(merged.get("max_pages", 100)), 500))
    merged["max_blocks_per_page"] = max(1, min(int(merged.get("max_blocks_per_page", 500)), 2000))
    merged["max_db_rows"] = max(1, min(int(merged.get("max_db_rows", 100)), 500))
    merged["max_size_mb"] = max(1, min(int(merged.get("max_size_mb", 50)), 200))
    merged["max_attachments_per_page"] = max(1, min(int(merged.get("max_attachments_per_page", 20)), 50))
    merged["max_comments_per_page"] = max(1, min(int(merged.get("max_comments_per_page", 100)), 500))
    merged["include_attachments"] = bool(merged.get("include_attachments", True))
    merged["include_comments"] = bool(merged.get("include_comments", True))
    return merged


def validate_confluence_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = dict(DEFAULT_CONFLUENCE_SETTINGS)
    if raw:
        merged.update({k: v for k, v in raw.items() if v is not None})
    merged["cadence_minutes"] = max(5, min(int(merged.get("cadence_minutes", 30)), 1440))
    merged["max_pages"] = max(1, min(int(merged.get("max_pages", 100)), 500))
    merged["max_size_mb"] = max(1, min(int(merged.get("max_size_mb", 50)), 200))
    return merged


def validate_sharepoint_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = dict(DEFAULT_SHAREPOINT_SETTINGS)
    if raw:
        merged.update({k: v for k, v in raw.items() if v is not None})
    merged["cadence_minutes"] = max(5, min(int(merged.get("cadence_minutes", 30)), 1440))
    merged["max_files"] = max(1, min(int(merged.get("max_files", 100)), 500))
    merged["max_size_mb"] = max(1, min(int(merged.get("max_size_mb", 50)), 200))
    merged["exclude_images"] = bool(merged.get("exclude_images", True))
    merged["exclude_videos"] = bool(merged.get("exclude_videos", True))
    return merged


def validate_slack_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = dict(DEFAULT_SLACK_SETTINGS)
    if raw:
        merged.update({k: v for k, v in raw.items() if v is not None})
    merged["cadence_minutes"] = max(5, min(int(merged.get("cadence_minutes", 30)), 1440))
    merged["max_messages"] = max(1, min(int(merged.get("max_messages", 200)), 1000))
    merged["max_size_mb"] = max(1, min(int(merged.get("max_size_mb", 10)), 200))
    merged["include_threads"] = bool(merged.get("include_threads", True))
    merged["include_files"] = bool(merged.get("include_files", True))
    return merged


def validate_connector_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = dict(DEFAULT_CONNECTOR_SETTINGS)
    if raw:
        merged.update({k: v for k, v in raw.items() if v is not None})

    cadence = int(merged.get("cadence_minutes", 30))
    max_files = int(merged.get("max_files", 100))
    max_size_mb = int(merged.get("max_size_mb", 50))

    merged["cadence_minutes"] = max(5, min(cadence, 1440))
    merged["max_files"] = max(1, min(max_files, 500))
    merged["max_size_mb"] = max(1, min(max_size_mb, 200))
    merged["exclude_images"] = bool(merged.get("exclude_images", True))
    merged["exclude_videos"] = bool(merged.get("exclude_videos", True))
    return merged


def get_integration(
    db: Session,
    *,
    user_id: int,
    project_id: uuid.UUID,
    connector_type: str,
) -> Optional[ConnectorIntegration]:
    return (
        db.query(ConnectorIntegration)
        .filter(
            ConnectorIntegration.user_id == user_id,
            ConnectorIntegration.project_id == project_id,
            ConnectorIntegration.connector_type == connector_type,
        )
        .first()
    )


def get_or_create_settings_row(db: Session, integration_id: uuid.UUID) -> ConnectorSettings:
    row = (
        db.query(ConnectorSettings)
        .filter(ConnectorSettings.integration_id == integration_id)
        .first()
    )
    if row:
        return row
    integration = (
        db.query(ConnectorIntegration)
        .filter(ConnectorIntegration.id == integration_id)
        .first()
    )
    if integration and integration.connector_type == CONNECTOR_TYPE_NOTION:
        defaults = validate_notion_settings({})
    elif integration and integration.connector_type == CONNECTOR_TYPE_CONFLUENCE:
        defaults = validate_confluence_settings({})
    elif integration and integration.connector_type == CONNECTOR_TYPE_SHAREPOINT:
        defaults = validate_sharepoint_settings({})
    elif integration and integration.connector_type == CONNECTOR_TYPE_SLACK:
        defaults = validate_slack_settings({})
    else:
        defaults = validate_connector_settings({})
    row = ConnectorSettings(integration_id=integration_id, settings=defaults)
    db.add(row)
    db.flush()
    return row


def get_or_create_sources_row(db: Session, integration_id: uuid.UUID) -> ConnectorSource:
    row = (
        db.query(ConnectorSource)
        .filter(ConnectorSource.integration_id == integration_id)
        .first()
    )
    if row:
        return row
    row = ConnectorSource(integration_id=integration_id, sources={"folders": [], "files": []})
    db.add(row)
    db.flush()
    return row


def fail_orphaned_connector_sync_jobs(db: Session, integration_id: uuid.UUID) -> int:
    """Mark never-started PENDING connector sync rows as failed before a new sync."""
    now = datetime.now(timezone.utc)
    pending = (
        db.query(ConnectorSyncJob)
        .filter(
            ConnectorSyncJob.integration_id == integration_id,
            ConnectorSyncJob.status == ConnectorSyncJobStatus.PENDING,
        )
        .all()
    )
    if not pending:
        return 0
    for job in pending:
        job.status = ConnectorSyncJobStatus.FAILED
        job.finished_at = now
        job.errors = (job.errors or []) + [{"error": "Superseded by new sync request"}]
    db.commit()
    return len(pending)


def create_sync_job(db: Session, integration_id: uuid.UUID) -> ConnectorSyncJob:
    fail_orphaned_connector_sync_jobs(db, integration_id)
    job = ConnectorSyncJob(integration_id=integration_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def enqueue_connector_sync(
    db: Session,
    *,
    integration: ConnectorIntegration,
    sync_job_id: uuid.UUID,
) -> bool:
    if not settings.enable_durable_jobs:
        return False

    try:
        job = enqueue_job(
            db,
            job_type=BackgroundJobType.CONNECTOR_SYNC.value,
            payload={
                "integration_id": str(integration.id),
                "sync_job_id": str(sync_job_id),
                "connector_type": integration.connector_type,
            },
            user_id=integration.user_id,
            project_id=integration.project_id,
            idempotency_key=f"{CONNECTOR_SYNC_IDEMPOTENCY_PREFIX}{integration.id}",
            priority=CONNECTOR_INGEST_PRIORITY,
            job_class=CONNECTOR_JOB_CLASS,
        )
    except Exception as exc:
        logger.warning("Connector sync enqueue failed for %s: %s", integration.id, exc)
        db.rollback()
        return False

    payload = dict(job.payload or {})
    new_sync_id = str(sync_job_id)
    if payload.get("sync_job_id") != new_sync_id:
        job.payload = {
            **payload,
            "integration_id": str(integration.id),
            "sync_job_id": new_sync_id,
            "connector_type": integration.connector_type,
        }
        db.commit()
    return True


def ingest_pool_is_busy(db: Session) -> bool:
    """Defer connector fan-out when ingest workers are saturated."""
    try:
        from ..models import BackgroundJob, BackgroundJobStatus
        from ..settings import settings as app_settings

        running = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
                BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
            )
            .count()
        )
        cap = max(1, int(app_settings.ingest_pool_workers))
        return running >= cap
    except Exception as exc:
        logger.debug("ingest_pool_is_busy check failed: %s", exc)
        return False


def enqueue_connector_document_ingest(
    db: Session,
    *,
    document_id: str,
    staging_path: str,
    user_id: int,
    project_id: uuid.UUID,
) -> bool:
    if settings.enable_durable_jobs:
        try:
            enqueue_job(
                db,
                job_type=BackgroundJobType.DOCUMENT_INGEST.value,
                payload={"document_id": document_id, "staging_path": staging_path},
                user_id=user_id,
                project_id=project_id,
                idempotency_key=f"document_ingest:{document_id}",
                priority=CONNECTOR_INGEST_PRIORITY,
                job_class=CONNECTOR_JOB_CLASS,
            )
            from ..admission import ingest_queued_incr

            ingest_queued_incr(project_id)
            return True
        except Exception as exc:
            logger.warning(
                "Connector document ingest enqueue failed for %s: %s — trying inline",
                document_id,
                exc,
            )
            db.rollback()

    return _ingest_connector_document_inline(
        db,
        document_id=document_id,
        staging_path=staging_path,
        user_id=user_id,
        project_id=project_id,
    )


def _ingest_connector_document_inline(
    db: Session,
    *,
    document_id: str,
    staging_path: str,
    user_id: int,
    project_id: uuid.UUID,
) -> bool:
    from ..document_ingest_orchestration import ingest_document_to_all_targets_sync
    from ..ingest_runtime import run_ingest_sync

    doc = (
        db.query(UploadedDocument)
        .filter(UploadedDocument.id == uuid.UUID(str(document_id)))
        .first()
    )
    if not doc:
        return False
    try:
        status, _chunks = ingest_document_to_all_targets_sync(
            db,
            save_path=staging_path,
            document_id=document_id,
            user_id=user_id,
            project_id=project_id,
            run_ingest=run_ingest_sync,
        )
        doc.status = status
        db.commit()
        return status == "Indexed"
    except Exception as exc:
        logger.error("Inline connector ingest failed for %s: %s", document_id, exc)
        doc.status = "Indexing Failed"
        db.commit()
        return False


def purge_integration_documents_by_id(
    db: Session,
    integration_id: uuid.UUID,
    project_id: uuid.UUID,
) -> int:
    """Remove connector documents for one integration from DB + Chroma."""
    from ..rag.singleton import locked_delete_document_embeddings

    integration = (
        db.query(ConnectorIntegration)
        .filter(ConnectorIntegration.id == integration_id)
        .first()
    )
    source_value = source_for_connector_type(
        integration.connector_type if integration else None
    )

    docs = (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == project_id,
            UploadedDocument.source == source_value,
        )
        .all()
    )
    integration_id_s = str(integration_id)
    deleted = 0
    for doc in docs:
        meta = doc.meta_data or {}
        if str(meta.get("integration_id")) != integration_id_s:
            continue
        try:
            locked_delete_document_embeddings(str(doc.id))
        except Exception as exc:
            logger.warning("Chroma delete failed for connector doc %s: %s", doc.id, exc)
        db.delete(doc)
        deleted += 1
    db.commit()
    return deleted


def purge_integration_documents(db: Session, integration: ConnectorIntegration) -> int:
    return purge_integration_documents_by_id(db, integration.id, integration.project_id)


def count_indexed_connector_documents(
    db: Session,
    integration: ConnectorIntegration,
    *,
    source: Optional[str] = None,
) -> int:
    """Count successfully indexed connector documents for this integration."""
    integration_id_s = str(integration.id)
    doc_source = source or source_for_connector_type(integration.connector_type)
    docs = (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == integration.project_id,
            UploadedDocument.source == doc_source,
            UploadedDocument.status == "Indexed",
        )
        .all()
    )
    return sum(
        1
        for doc in docs
        if str((doc.meta_data or {}).get("integration_id")) == integration_id_s
    )


def source_for_connector_type(connector_type: Optional[str]) -> str:
    mapping = {
        CONNECTOR_TYPE_GOOGLE_DRIVE: SOURCE_GOOGLE_DRIVE,
        CONNECTOR_TYPE_NOTION: SOURCE_NOTION,
        CONNECTOR_TYPE_CONFLUENCE: SOURCE_CONFLUENCE,
        CONNECTOR_TYPE_SHAREPOINT: SOURCE_SHAREPOINT,
        CONNECTOR_TYPE_SLACK: SOURCE_SLACK,
    }
    return mapping.get(connector_type or "", SOURCE_GOOGLE_DRIVE)


def enqueue_connector_purge(db: Session, integration: ConnectorIntegration) -> bool:
    if not settings.enable_durable_jobs:
        purge_integration_documents(db, integration)
        return False
    enqueue_job(
        db,
        job_type=BackgroundJobType.PURGE_CONNECTOR_INTEGRATION.value,
        payload={
            "integration_id": str(integration.id),
            "project_id": str(integration.project_id),
            "connector_type": integration.connector_type,
        },
        user_id=integration.user_id,
        project_id=integration.project_id,
        idempotency_key=f"purge_connector:{integration.id}",
    )
    return True


def mark_sync_job_finished(
    db: Session,
    sync_job: ConnectorSyncJob,
    *,
    status: ConnectorSyncJobStatus,
    files_fetched: int = 0,
    files_indexed: int = 0,
    files_skipped: int = 0,
    errors: Optional[list] = None,
) -> None:
    sync_job.status = status
    sync_job.files_fetched = files_fetched
    sync_job.files_indexed = files_indexed
    sync_job.files_skipped = files_skipped
    sync_job.errors = errors or []
    sync_job.finished_at = datetime.now(timezone.utc)
    db.commit()


def store_encrypted_tokens(integration: ConnectorIntegration, tokens: Dict[str, Any]) -> None:
    integration.access_token = encrypt_secret(tokens["access_token"])
    if tokens.get("refresh_token"):
        integration.refresh_token = encrypt_secret(tokens["refresh_token"])
    expiry = tokens.get("token_expiry")
    if expiry and getattr(expiry, "tzinfo", None) is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    integration.token_expiry = expiry
