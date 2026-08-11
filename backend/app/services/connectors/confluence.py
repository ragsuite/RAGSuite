"""
Confluence connector: OAuth, space/page browse, sync and staging for ingest.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
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
from ...security_utils import (
    create_oauth_state,
    safe_decrypt_secret,
    verify_oauth_state,
)
from ..document_ingest_orchestration import staging_path_for_document
from .framework import (
    CONNECTOR_TYPE_CONFLUENCE,
    SOURCE_CONFLUENCE,
    count_indexed_connector_documents,
    enqueue_connector_document_ingest,
    ingest_pool_is_busy,
    mark_sync_job_finished,
    resolve_oauth_credentials,
    validate_confluence_settings,
)

logger = logging.getLogger(__name__)

ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize"
ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token"
ATLASSIAN_ACCESSIBLE_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"
CONFLUENCE_SCOPES = [
    "offline_access",
    "read:confluence-content.all",
    "read:confluence-space.summary",
]


def _content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _api_headers(access_token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }


def get_auth_url(
    project_id: str,
    user_id: int,
    client_id: str,
    redirect_uri: str,
) -> str:
    state = create_oauth_state(
        provider=CONNECTOR_TYPE_CONFLUENCE, user_id=user_id, project_id=str(project_id)
    )
    params = urlencode(
        {
            "audience": "api.atlassian.com",
            "client_id": client_id,
            "scope": " ".join(CONFLUENCE_SCOPES),
            "redirect_uri": redirect_uri,
            "state": state,
            "response_type": "code",
            "prompt": "consent",
        }
    )
    return f"{ATLASSIAN_AUTH_URL}?{params}"


def parse_oauth_state(state: str) -> Dict[str, Any]:
    return verify_oauth_state(state, expected_provider=CONNECTOR_TYPE_CONFLUENCE)


def _get_accessible_resource(access_token: str) -> Dict[str, Any]:
    resp = requests.get(
        ATLASSIAN_ACCESSIBLE_RESOURCES_URL,
        headers=_api_headers(access_token),
        timeout=30,
    )
    resp.raise_for_status()
    resources = resp.json() or []
    if not resources:
        raise ValueError("No accessible Confluence cloud resources found")
    # Prefer first Confluence-capable cloud site.
    for item in resources:
        scopes = item.get("scopes") or []
        if any("confluence" in scope for scope in scopes):
            return item
    return resources[0]


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> Dict[str, Any]:
    resp = requests.post(
        ATLASSIAN_TOKEN_URL,
        headers={"Content-Type": "application/json"},
        json={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    access_token = data["access_token"]
    resource = _get_accessible_resource(access_token)
    return {
        "access_token": access_token,
        "refresh_token": data.get("refresh_token", ""),
        "token_expiry": None,
        "cloud_id": resource.get("id"),
        "site_name": resource.get("name") or "Confluence",
        "site_url": resource.get("url"),
    }


def _confluence_get(
    access_token: str,
    cloud_id: str,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    url = f"https://api.atlassian.com/ex/confluence/{cloud_id}{path}"
    resp = requests.get(url, headers=_api_headers(access_token), params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def list_spaces(db: Session, integration: ConnectorIntegration) -> List[Dict[str, str]]:
    token = safe_decrypt_secret(integration.access_token)
    cloud_id = (integration.drive_page_token or "").strip()
    if not cloud_id:
        raise ValueError("Confluence cloud id missing; reconnect integration")

    items: List[Dict[str, str]] = []
    cursor: Optional[str] = None
    while True:
        params: Dict[str, Any] = {"limit": 100}
        if cursor:
            params["cursor"] = cursor
        data = _confluence_get(token, cloud_id, "/wiki/api/v2/spaces", params=params)
        for row in data.get("results") or []:
            sid = row.get("id")
            if sid:
                items.append(
                    {
                        "id": sid,
                        "key": row.get("key") or "",
                        "name": row.get("name") or sid,
                    }
                )
        next_link = (data.get("_links") or {}).get("next")
        if not next_link:
            break
        cursor = next_link.split("cursor=")[-1] if "cursor=" in next_link else None
        if not cursor:
            break
    items.sort(key=lambda x: x["name"].lower())
    return items


def _html_to_text(html: str) -> str:
    # Keep dependency footprint small: robust enough for storage-view payloads.
    import re

    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|li|h1|h2|h3|h4|h5|h6)>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _find_prior_uploaded(
    db: Session,
    project_id: uuid.UUID,
    external_id: str,
) -> Optional[UploadedDocument]:
    for doc in (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == project_id,
            UploadedDocument.source == SOURCE_CONFLUENCE,
        )
        .all()
    ):
        meta = doc.meta_data or {}
        if str(meta.get("confluence_page_id") or "") == external_id:
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
            meta["confluence_page_id"] = external_id
            prior.meta_data = meta
            db.commit()
            return 0, 0, 1

    if existing and existing.content_hash == content_hash and not existing.trashed:
        doc_present = (
            existing.document_id is not None
            and db.query(UploadedDocument.id)
            .filter(UploadedDocument.id == existing.document_id)
            .first()
            is not None
        )
        if doc_present:
            return 0, 0, 1

    old_document_id = existing.document_id if existing else None
    doc_uuid = uuid.uuid4()
    staging_path = staging_path_for_document(str(doc_uuid), f"{title}.txt")
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
        type="text/plain",
        source=SOURCE_CONFLUENCE,
        language=None,
        status="Queued",
        chunks=0,
        checksum=content_hash,
        size_kb=max(1, len(body) // 1024),
        url=url,
        meta_data={
            "integration_id": str(integration.id),
            "confluence_page_id": external_id,
            "connector_type": CONNECTOR_TYPE_CONFLUENCE,
        },
    )
    db.add(uploaded)

    if old_document_id and old_document_id != doc_uuid:
        from ..rag.singleton import locked_delete_document_embeddings

        try:
            locked_delete_document_embeddings(str(old_document_id))
        except Exception as exc:
            logger.warning("Failed to delete old embeddings for Confluence doc %s: %s", old_document_id, exc)
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
    errors.append({"page_id": external_id, "error": "Failed to enqueue document ingest"})
    return 1, 0, 0


def run_confluence_sync(db: Session, integration_id: str, sync_job_id: str) -> None:
    integration = (
        db.query(ConnectorIntegration)
        .filter(ConnectorIntegration.id == uuid.UUID(integration_id))
        .first()
    )
    sync_job = (
        db.query(ConnectorSyncJob)
        .filter(ConnectorSyncJob.id == uuid.UUID(sync_job_id))
        .first()
    )
    if not integration or not sync_job:
        return
    if integration.connector_type != CONNECTOR_TYPE_CONFLUENCE:
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
        cfg = validate_confluence_settings(settings_row.settings if settings_row else {})
        sources_row = integration.sources
        selected_spaces = []
        selected_pages = []
        if sources_row and isinstance(sources_row.sources, dict):
            selected_spaces = [s.get("id") for s in (sources_row.sources.get("spaces") or []) if s.get("id")]
            selected_pages = [p.get("id") for p in (sources_row.sources.get("pages") or []) if p.get("id")]
        if not selected_spaces and not selected_pages:
            integration.last_sync_at = datetime.now(timezone.utc)
            db.commit()
            mark_sync_job_finished(
                db,
                sync_job,
                status=ConnectorSyncJobStatus.COMPLETED,
                errors=[{"error": "No spaces or pages selected"}],
            )
            return

        cloud_id = (integration.drive_page_token or "").strip()
        if not cloud_id:
            raise ValueError("Confluence cloud id missing; reconnect integration")
        token = safe_decrypt_secret(integration.access_token)
        max_pages = int(cfg["max_pages"])
        max_size_bytes = int(cfg["max_size_mb"]) * 1024 * 1024

        page_ids: List[str] = []
        for page_id in selected_pages:
            if page_id not in page_ids:
                page_ids.append(page_id)
                if len(page_ids) >= max_pages:
                    break

        for space_id in selected_spaces:
            if len(page_ids) >= max_pages:
                break
            cursor: Optional[str] = None
            while len(page_ids) < max_pages:
                params: Dict[str, Any] = {
                    "space-id": space_id,
                    "limit": min(100, max_pages - len(page_ids)),
                    "body-format": "storage",
                }
                if cursor:
                    params["cursor"] = cursor
                data = _confluence_get(token, cloud_id, "/wiki/api/v2/pages", params=params)
                for row in data.get("results") or []:
                    pid = row.get("id")
                    if pid and pid not in page_ids:
                        page_ids.append(pid)
                        if len(page_ids) >= max_pages:
                            break
                next_link = (data.get("_links") or {}).get("next")
                if not next_link:
                    break
                cursor = next_link.split("cursor=")[-1] if "cursor=" in next_link else None
                if not cursor:
                    break

        for page_id in page_ids[:max_pages]:
            if ingest_pool_is_busy(db):
                errors.append({"error": "Ingest pool busy; remaining pages deferred to next sync"})
                break
            try:
                page = _confluence_get(
                    token,
                    cloud_id,
                    f"/wiki/api/v2/pages/{page_id}",
                    params={"body-format": "storage"},
                )
                title = page.get("title") or f"Confluence page {page_id}"
                storage = ((page.get("body") or {}).get("storage") or {}).get("value") or ""
                text = _html_to_text(storage)
                body = text.encode("utf-8")
                if not body:
                    files_skipped += 1
                    continue
                if len(body) > max_size_bytes:
                    files_skipped += 1
                    errors.append({"page_id": page_id, "error": "Page exceeds max_size_mb"})
                    continue
                files_fetched += 1
                content_hash = _content_hash(body)
                f_delta, i_delta, s_delta = _upsert_document(
                    db,
                    integration,
                    external_id=page_id,
                    title=title,
                    body=body,
                    url=page.get("_links", {}).get("webui"),
                    content_hash=content_hash,
                    errors=errors,
                )
                files_fetched += max(0, f_delta - 1)
                files_indexed += i_delta
                files_skipped += s_delta
            except Exception as exc:
                errors.append({"page_id": page_id, "error": str(exc)})

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
        logger.exception("Confluence sync failed for %s: %s", integration_id, exc)
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
