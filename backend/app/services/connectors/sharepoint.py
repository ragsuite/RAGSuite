"""
SharePoint connector: OAuth, site/drive browse, file sync.
"""
from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import requests
from sqlalchemy.orm import Session

from ...models import (
    ConnectorDocument,
    ConnectorIntegration,
    ConnectorIntegrationStatus,
    ConnectorSyncJob,
    ConnectorSyncJobStatus,
    UploadedDocument,
)
from ...security_utils import create_oauth_state, safe_decrypt_secret, verify_oauth_state
from ..document_ingest_orchestration import staging_path_for_document
from .framework import (
    CONNECTOR_TYPE_SHAREPOINT,
    SOURCE_SHAREPOINT,
    count_indexed_connector_documents,
    enqueue_connector_document_ingest,
    ingest_pool_is_busy,
    mark_sync_job_finished,
    validate_sharepoint_settings,
)

MS_GRAPH_API = "https://graph.microsoft.com/v1.0"
MS_AUTH_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize"
MS_TOKEN_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
MS_SCOPES = ["offline_access", "Files.Read.All", "Sites.Read.All"]


def _content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_auth_url(
    project_id: str,
    user_id: int,
    client_id: str,
    redirect_uri: str,
    tenant_id: str,
) -> str:
    state = create_oauth_state(
        provider=CONNECTOR_TYPE_SHAREPOINT, user_id=user_id, project_id=str(project_id)
    )
    params = urlencode(
        {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "response_mode": "query",
            "scope": " ".join(MS_SCOPES),
            "state": state,
            "prompt": "select_account",
        }
    )
    return f"{MS_AUTH_URL.format(tenant_id=tenant_id)}?{params}"


def parse_oauth_state(state: str) -> Dict[str, Any]:
    return verify_oauth_state(state, expected_provider=CONNECTOR_TYPE_SHAREPOINT)


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
    tenant_id: str,
) -> Dict[str, Any]:
    resp = requests.post(
        MS_TOKEN_URL.format(tenant_id=tenant_id),
        data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "scope": " ".join(MS_SCOPES),
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    expires_in = int(data.get("expires_in", 0) or 0)
    expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else None
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "token_expiry": expiry,
    }


def _graph_headers(access_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}


def _graph_get(access_token: str, path: str, *, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = f"{MS_GRAPH_API}{path}"
    resp = requests.get(url, headers=_graph_headers(access_token), params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def list_sites(access_token: str, *, query: str = "*") -> List[Dict[str, str]]:
    data = _graph_get(access_token, "/sites", params={"search": query})
    items = [
        {"id": row.get("id", ""), "name": row.get("displayName") or row.get("name") or row.get("id", "")}
        for row in (data.get("value") or [])
        if row.get("id")
    ]
    items.sort(key=lambda x: x["name"].lower())
    return items


def list_drives(access_token: str, site_id: str) -> List[Dict[str, str]]:
    data = _graph_get(access_token, f"/sites/{site_id}/drives")
    drives = [
        {"id": row.get("id", ""), "name": row.get("name") or row.get("id", "")}
        for row in (data.get("value") or [])
        if row.get("id")
    ]
    drives.sort(key=lambda x: x["name"].lower())
    return drives


def _find_prior_uploaded(db: Session, project_id: uuid.UUID, external_id: str) -> Optional[UploadedDocument]:
    for doc in (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == project_id,
            UploadedDocument.source == SOURCE_SHAREPOINT,
        )
        .all()
    ):
        meta = doc.meta_data or {}
        if str(meta.get("sharepoint_item_id") or "") == external_id:
            return doc
    return None


def _upsert_document(
    db: Session,
    integration: ConnectorIntegration,
    *,
    external_id: str,
    title: str,
    body: bytes,
    url: Optional[str],
    content_hash: str,
    errors: List[Dict[str, str]],
) -> Tuple[int, int, int]:
    existing = (
        db.query(ConnectorDocument)
        .filter(
            ConnectorDocument.integration_id == integration.id,
            ConnectorDocument.drive_file_id == external_id,
        )
        .first()
    )
    if not existing:
        prior = _find_prior_uploaded(db, integration.project_id, external_id)
        if prior and prior.status == "Indexed" and (prior.checksum or "") == content_hash:
            db.add(
                ConnectorDocument(
                    integration_id=integration.id,
                    project_id=integration.project_id,
                    drive_file_id=external_id,
                    document_id=prior.id,
                    content_hash=content_hash,
                    trashed=False,
                )
            )
            meta = dict(prior.meta_data or {})
            meta["integration_id"] = str(integration.id)
            meta["sharepoint_item_id"] = external_id
            prior.meta_data = meta
            db.commit()
            return 0, 0, 1

    if existing and existing.content_hash == content_hash and not existing.trashed:
        doc_present = (
            existing.document_id is not None
            and db.query(UploadedDocument.id).filter(UploadedDocument.id == existing.document_id).first() is not None
        )
        if doc_present:
            return 0, 0, 1

    old_document_id = existing.document_id if existing else None
    doc_uuid = uuid.uuid4()
    staging_path = staging_path_for_document(str(doc_uuid), title)
    os.makedirs(os.path.dirname(staging_path), exist_ok=True)
    with open(staging_path, "wb") as fh:
        fh.write(body)

    uploaded = UploadedDocument(
        id=doc_uuid,
        user_id=integration.user_id,
        project_id=integration.project_id,
        title=title[:1024],
        description=None,
        text_content=body,
        type="application/octet-stream",
        source=SOURCE_SHAREPOINT,
        language=None,
        status="Queued",
        chunks=0,
        checksum=content_hash,
        size_kb=max(1, len(body) // 1024),
        url=url,
        meta_data={
            "integration_id": str(integration.id),
            "sharepoint_item_id": external_id,
            "connector_type": CONNECTOR_TYPE_SHAREPOINT,
        },
    )
    db.add(uploaded)

    if old_document_id and old_document_id != doc_uuid:
        from ..rag.singleton import locked_delete_document_embeddings

        try:
            locked_delete_document_embeddings(str(old_document_id))
        except Exception:
            pass
        old_uploaded = db.query(UploadedDocument).filter(UploadedDocument.id == old_document_id).first()
        if old_uploaded:
            db.delete(old_uploaded)

    if existing:
        existing.document_id = doc_uuid
        existing.content_hash = content_hash
        existing.staging_path = staging_path
        existing.trashed = False
    else:
        db.add(
            ConnectorDocument(
                integration_id=integration.id,
                project_id=integration.project_id,
                drive_file_id=external_id,
                document_id=doc_uuid,
                content_hash=content_hash,
                staging_path=staging_path,
                trashed=False,
            )
        )
    db.commit()

    if enqueue_connector_document_ingest(
        db,
        document_id=str(doc_uuid),
        staging_path=staging_path,
        user_id=integration.user_id,
        project_id=integration.project_id,
    ):
        return 1, 1, 0
    errors.append({"item_id": external_id, "error": "Failed to enqueue document ingest"})
    return 1, 0, 0


def run_sharepoint_sync(db: Session, integration_id: str, sync_job_id: str) -> None:
    integration = db.query(ConnectorIntegration).filter(ConnectorIntegration.id == uuid.UUID(integration_id)).first()
    sync_job = db.query(ConnectorSyncJob).filter(ConnectorSyncJob.id == uuid.UUID(sync_job_id)).first()
    if not integration or not sync_job:
        return
    if integration.connector_type != CONNECTOR_TYPE_SHAREPOINT:
        raise ValueError(f"Unsupported connector type: {integration.connector_type}")

    sync_job.status = ConnectorSyncJobStatus.RUNNING
    sync_job.started_at = datetime.now(timezone.utc)
    db.commit()

    errors: List[Dict[str, str]] = []
    files_fetched = 0
    files_indexed = 0
    files_skipped = 0

    try:
        if not integration.is_active or integration.status != ConnectorIntegrationStatus.ACTIVE:
            mark_sync_job_finished(db, sync_job, status=ConnectorSyncJobStatus.COMPLETED)
            return

        settings_row = integration.settings
        cfg = validate_sharepoint_settings(settings_row.settings if settings_row else {})
        max_files = int(cfg["max_files"])
        max_size_bytes = int(cfg["max_size_mb"]) * 1024 * 1024

        sources = (integration.sources.sources if integration.sources else {}) or {}
        drives = [d for d in (sources.get("drives") or []) if d.get("id")]
        if not drives:
            integration.last_sync_at = datetime.now(timezone.utc)
            db.commit()
            mark_sync_job_finished(
                db,
                sync_job,
                status=ConnectorSyncJobStatus.COMPLETED,
                errors=[{"error": "No drives selected"}],
            )
            return

        token = safe_decrypt_secret(integration.access_token)
        processed = 0
        for drive in drives:
            if processed >= max_files:
                break
            drive_id = drive["id"]
            next_url = f"{MS_GRAPH_API}/drives/{drive_id}/root/children?$top=200"
            while next_url and processed < max_files:
                resp = requests.get(next_url, headers=_graph_headers(token), timeout=60)
                resp.raise_for_status()
                data = resp.json()
                for item in data.get("value") or []:
                    if processed >= max_files:
                        break
                    if item.get("folder"):
                        continue
                    if ingest_pool_is_busy(db):
                        errors.append({"error": "Ingest pool busy; remaining files deferred to next sync"})
                        next_url = None
                        break
                    download_url = item.get("@microsoft.graph.downloadUrl")
                    if not download_url:
                        files_skipped += 1
                        continue
                    name = item.get("name") or item.get("id") or "sharepoint-file"
                    item_id = item.get("id") or ""
                    ext = f".{name.rsplit('.', 1)[-1]}" if "." in name else ".bin"
                    try:
                        raw = requests.get(download_url, timeout=60).content
                    except Exception as exc:
                        errors.append({"item_id": item_id, "error": str(exc)})
                        continue
                    if len(raw) > max_size_bytes:
                        files_skipped += 1
                        continue
                    processed += 1
                    files_fetched += 1
                    content_hash = _content_hash(raw)
                    _, i_delta, s_delta = _upsert_document(
                        db,
                        integration,
                        external_id=item_id,
                        title=f"{name}",
                        body=raw,
                        url=item.get("webUrl"),
                        content_hash=content_hash,
                        errors=errors,
                    )
                    files_indexed += i_delta
                    files_skipped += s_delta
                next_url = data.get("@odata.nextLink")

        integration.last_sync_at = datetime.now(timezone.utc)
        integration.documents_indexed = count_indexed_connector_documents(db, integration)
        if integration.status == ConnectorIntegrationStatus.ERROR:
            integration.status = ConnectorIntegrationStatus.ACTIVE
        db.commit()
        mark_sync_job_finished(
            db,
            sync_job,
            status=ConnectorSyncJobStatus.COMPLETED,
            files_fetched=files_fetched,
            files_indexed=files_indexed,
            files_skipped=files_skipped,
            errors=errors,
        )
    except Exception as exc:
        integration.status = ConnectorIntegrationStatus.ERROR
        db.commit()
        mark_sync_job_finished(
            db,
            sync_job,
            status=ConnectorSyncJobStatus.FAILED,
            files_fetched=files_fetched,
            files_indexed=files_indexed,
            files_skipped=files_skipped,
            errors=errors + [{"error": str(exc)}],
        )
