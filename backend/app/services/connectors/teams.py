"""
Microsoft Teams connector: Entra OAuth, team/channel browse, message sync.
"""
from __future__ import annotations

import hashlib
import os
import re
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
    CONNECTOR_TYPE_TEAMS,
    SOURCE_TEAMS,
    count_indexed_connector_documents,
    enqueue_connector_document_ingest,
    ingest_pool_is_busy,
    mark_sync_job_finished,
    validate_teams_settings,
)

MS_GRAPH_API = "https://graph.microsoft.com/v1.0"
MS_AUTH_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize"
MS_TOKEN_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
MS_SCOPES = [
    "offline_access",
    "User.Read",
    "Team.ReadBasic.All",
    "Channel.ReadBasic.All",
    "ChannelMessage.Read.All",
]

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _strip_html(value: str) -> str:
    text = _HTML_TAG_RE.sub(" ", value or "")
    return re.sub(r"\s+", " ", text).strip()


def _message_text(message: Dict[str, Any]) -> str:
    body = message.get("body") or {}
    content = body.get("content") or ""
    content_type = (body.get("contentType") or "").lower()
    if content_type == "html":
        return _strip_html(content)
    return (content or "").strip()


def get_auth_url(
    project_id: str,
    user_id: int,
    client_id: str,
    redirect_uri: str,
    tenant_id: str,
) -> str:
    state = create_oauth_state(
        provider=CONNECTOR_TYPE_TEAMS, user_id=user_id, project_id=str(project_id)
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
    return verify_oauth_state(state, expected_provider=CONNECTOR_TYPE_TEAMS)


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


def graph_error_detail(exc: Exception) -> str:
    """Extract a user-facing message from a Microsoft Graph HTTP error."""
    resp = getattr(exc, "response", None)
    if resp is not None:
        try:
            payload = resp.json()
            err = payload.get("error") if isinstance(payload, dict) else None
            if isinstance(err, dict):
                message = (err.get("message") or "").strip()
                if message:
                    return message
        except Exception:
            pass
        text = (getattr(resp, "text", None) or "").strip()
        if text:
            return text[:500]
    return str(exc)[:500]


def _graph_get_paginated(
    access_token: str,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    max_pages: int = 20,
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    next_url: Optional[str] = f"{MS_GRAPH_API}{path}"
    page = 0
    query = params
    while next_url and page < max_pages:
        if next_url.startswith("http"):
            resp = requests.get(
                next_url,
                headers=_graph_headers(access_token),
                params=query if page == 0 else None,
                timeout=60,
            )
        else:
            resp = requests.get(
                f"{MS_GRAPH_API}{next_url}",
                headers=_graph_headers(access_token),
                params=query if page == 0 else None,
                timeout=60,
            )
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("value") or [])
        next_url = data.get("@odata.nextLink")
        query = None
        page += 1
    return items


def list_teams(access_token: str) -> List[Dict[str, str]]:
    rows = _graph_get_paginated(access_token, "/me/joinedTeams")
    items = [
        {
            "id": row.get("id", ""),
            "name": row.get("displayName") or row.get("id", ""),
        }
        for row in rows
        if row.get("id")
    ]
    items.sort(key=lambda x: x["name"].lower())
    return items


def list_channels(access_token: str, team_id: str) -> List[Dict[str, str]]:
    rows = _graph_get_paginated(access_token, f"/teams/{team_id}/channels")
    items = [
        {
            "id": row.get("id", ""),
            "name": row.get("displayName") or row.get("id", ""),
            "team_id": team_id,
        }
        for row in rows
        if row.get("id")
    ]
    items.sort(key=lambda x: x["name"].lower())
    return items


def _parse_graph_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _find_prior_uploaded(db: Session, project_id: uuid.UUID, external_id: str) -> Optional[UploadedDocument]:
    for doc in (
        db.query(UploadedDocument)
        .filter(UploadedDocument.project_id == project_id, UploadedDocument.source == SOURCE_TEAMS)
        .all()
    ):
        meta = doc.meta_data or {}
        if str(meta.get("teams_message_id") or "") == external_id:
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
            meta["teams_message_id"] = external_id
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
        source=SOURCE_TEAMS,
        language=None,
        status="Queued",
        chunks=0,
        checksum=content_hash,
        size_kb=max(1, len(body) // 1024),
        url=url,
        meta_data={
            "integration_id": str(integration.id),
            "teams_message_id": external_id,
            "connector_type": CONNECTOR_TYPE_TEAMS,
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
    errors.append({"message_id": external_id, "error": "Failed to enqueue document ingest"})
    return 1, 0, 0


def run_teams_sync(db: Session, integration_id: str, sync_job_id: str) -> None:
    integration = db.query(ConnectorIntegration).filter(ConnectorIntegration.id == uuid.UUID(integration_id)).first()
    sync_job = db.query(ConnectorSyncJob).filter(ConnectorSyncJob.id == uuid.UUID(sync_job_id)).first()
    if not integration or not sync_job:
        return
    if integration.connector_type != CONNECTOR_TYPE_TEAMS:
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
        cfg = validate_teams_settings(settings_row.settings if settings_row else {})
        max_messages = int(cfg["max_messages"])
        include_threads = bool(cfg["include_threads"])

        sources = (integration.sources.sources if integration.sources else {}) or {}
        channels = [
            c
            for c in (sources.get("channels") or [])
            if c.get("id") and c.get("team_id")
        ]
        if not channels:
            integration.last_sync_at = datetime.now(timezone.utc)
            db.commit()
            mark_sync_job_finished(
                db,
                sync_job,
                status=ConnectorSyncJobStatus.COMPLETED,
                errors=[{"error": "No channels selected"}],
            )
            return

        token = safe_decrypt_secret(integration.access_token)
        oldest = datetime.now(timezone.utc) - timedelta(days=7)
        processed = 0

        for channel in channels:
            if processed >= max_messages:
                break
            team_id = channel["team_id"]
            channel_id = channel["id"]
            channel_name = channel.get("name") or channel_id
            next_url: Optional[str] = (
                f"{MS_GRAPH_API}/teams/{team_id}/channels/{channel_id}/messages?$top=50"
            )
            while next_url and processed < max_messages:
                if ingest_pool_is_busy(db):
                    errors.append({"error": "Ingest pool busy; remaining messages deferred to next sync"})
                    break
                resp = requests.get(next_url, headers=_graph_headers(token), timeout=60)
                resp.raise_for_status()
                data = resp.json()
                page_had_in_window = False
                for message in data.get("value") or []:
                    if processed >= max_messages:
                        break
                    message_id = message.get("id")
                    if not message_id:
                        files_skipped += 1
                        continue
                    created_at = _parse_graph_datetime(message.get("createdDateTime"))
                    if created_at and created_at < oldest:
                        continue
                    page_had_in_window = True
                    if message.get("messageType") and message.get("messageType") != "message":
                        files_skipped += 1
                        continue
                    text = _message_text(message)
                    if include_threads:
                        try:
                            replies = _graph_get_paginated(
                                token,
                                f"/teams/{team_id}/channels/{channel_id}/messages/{message_id}/replies",
                                max_pages=5,
                            )
                            reply_lines = [_message_text(r) for r in replies]
                            reply_lines = [line for line in reply_lines if line]
                            if reply_lines:
                                text += "\n\nThread:\n" + "\n".join(f"- {line}" for line in reply_lines)
                        except Exception as exc:
                            errors.append(
                                {
                                    "message_id": f"{team_id}:{channel_id}:{message_id}",
                                    "error": str(exc),
                                }
                            )
                    if not text.strip():
                        files_skipped += 1
                        continue
                    processed += 1
                    files_fetched += 1
                    created_label = created_at.isoformat() if created_at else "unknown-time"
                    rendered = f"[#{channel_name}] {created_label}\n\n{text}"
                    body = rendered.encode("utf-8")
                    content_hash = _content_hash(body)
                    _, i_delta, s_delta = _upsert_document(
                        db,
                        integration,
                        external_id=f"{team_id}:{channel_id}:{message_id}",
                        title=f"Teams {channel_name} {message_id}",
                        body=body,
                        url=message.get("webUrl"),
                        content_hash=content_hash,
                        errors=errors,
                    )
                    files_indexed += i_delta
                    files_skipped += s_delta
                next_url = data.get("@odata.nextLink")
                # Graph returns newest-first; stop paging once we are past the window.
                if next_url and not page_had_in_window and data.get("value"):
                    oldest_on_page = None
                    for message in data.get("value") or []:
                        dt = _parse_graph_datetime(message.get("createdDateTime"))
                        if dt and (oldest_on_page is None or dt < oldest_on_page):
                            oldest_on_page = dt
                    if oldest_on_page and oldest_on_page < oldest:
                        next_url = None

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
