"""
Slack connector: OAuth, channel listing, message sync.
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
    CONNECTOR_TYPE_SLACK,
    SOURCE_SLACK,
    count_indexed_connector_documents,
    enqueue_connector_document_ingest,
    ingest_pool_is_busy,
    mark_sync_job_finished,
    validate_slack_settings,
)

SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize"
SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access"
SLACK_API_BASE = "https://slack.com/api"
SLACK_SCOPES = [
    "channels:history",
    "channels:read",
    "groups:history",
    "groups:read",
    "files:read",
]


def _content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_auth_url(project_id: str, user_id: int, client_id: str, redirect_uri: str) -> str:
    state = create_oauth_state(
        provider=CONNECTOR_TYPE_SLACK, user_id=user_id, project_id=str(project_id)
    )
    params = urlencode(
        {
            "client_id": client_id,
            "scope": ",".join(SLACK_SCOPES),
            "redirect_uri": redirect_uri,
            "state": state,
            "user_scope": "",
        }
    )
    return f"{SLACK_AUTH_URL}?{params}"


def parse_oauth_state(state: str) -> Dict[str, Any]:
    return verify_oauth_state(state, expected_provider=CONNECTOR_TYPE_SLACK)


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> Dict[str, Any]:
    resp = requests.post(
        SLACK_TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise ValueError(data.get("error") or "Slack OAuth failed")
    authed_user = data.get("authed_user") or {}
    team = data.get("team") or {}
    return {
        "access_token": data.get("access_token"),
        "refresh_token": "",
        "token_expiry": None,
        "team_id": team.get("id"),
        "team_name": team.get("name") or "Slack workspace",
        "authed_user_id": authed_user.get("id"),
    }


def _slack_get(token: str, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    resp = requests.get(
        f"{SLACK_API_BASE}/{method}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise ValueError(data.get("error") or f"Slack API call failed: {method}")
    return data


def list_channels(access_token: str) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []
    cursor: Optional[str] = None
    while True:
        params = {
            "exclude_archived": "true",
            "types": "public_channel,private_channel",
            "limit": 200,
        }
        if cursor:
            params["cursor"] = cursor
        data = _slack_get(access_token, "conversations.list", params=params)
        for ch in data.get("channels") or []:
            cid = ch.get("id")
            if cid:
                items.append({"id": cid, "name": ch.get("name") or cid})
        cursor = (data.get("response_metadata") or {}).get("next_cursor") or ""
        if not cursor:
            break
    items.sort(key=lambda x: x["name"].lower())
    return items


def _find_prior_uploaded(db: Session, project_id: uuid.UUID, external_id: str) -> Optional[UploadedDocument]:
    for doc in (
        db.query(UploadedDocument)
        .filter(UploadedDocument.project_id == project_id, UploadedDocument.source == SOURCE_SLACK)
        .all()
    ):
        meta = doc.meta_data or {}
        if str(meta.get("slack_message_id") or "") == external_id:
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
            meta["slack_message_id"] = external_id
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
        source=SOURCE_SLACK,
        language=None,
        status="Queued",
        chunks=0,
        checksum=content_hash,
        size_kb=max(1, len(body) // 1024),
        url=url,
        meta_data={
            "integration_id": str(integration.id),
            "slack_message_id": external_id,
            "connector_type": CONNECTOR_TYPE_SLACK,
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


def run_slack_sync(db: Session, integration_id: str, sync_job_id: str) -> None:
    integration = db.query(ConnectorIntegration).filter(ConnectorIntegration.id == uuid.UUID(integration_id)).first()
    sync_job = db.query(ConnectorSyncJob).filter(ConnectorSyncJob.id == uuid.UUID(sync_job_id)).first()
    if not integration or not sync_job:
        return
    if integration.connector_type != CONNECTOR_TYPE_SLACK:
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
        cfg = validate_slack_settings(settings_row.settings if settings_row else {})
        max_messages = int(cfg["max_messages"])
        include_threads = bool(cfg["include_threads"])

        sources = (integration.sources.sources if integration.sources else {}) or {}
        channels = [c for c in (sources.get("channels") or []) if c.get("id")]
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
        oldest = str((datetime.now(timezone.utc) - timedelta(days=7)).timestamp())
        processed = 0

        for channel in channels:
            if processed >= max_messages:
                break
            cursor: Optional[str] = None
            while processed < max_messages:
                if ingest_pool_is_busy(db):
                    errors.append({"error": "Ingest pool busy; remaining messages deferred to next sync"})
                    cursor = None
                    break
                params = {
                    "channel": channel["id"],
                    "limit": min(200, max_messages - processed),
                    "oldest": oldest,
                }
                if cursor:
                    params["cursor"] = cursor
                data = _slack_get(token, "conversations.history", params=params)
                for message in data.get("messages") or []:
                    if processed >= max_messages:
                        break
                    ts = message.get("ts")
                    if not ts or message.get("subtype"):
                        files_skipped += 1
                        continue
                    text = message.get("text") or ""
                    if include_threads and message.get("thread_ts") == ts and int(message.get("reply_count") or 0) > 0:
                        try:
                            thread = _slack_get(
                                token,
                                "conversations.replies",
                                params={"channel": channel["id"], "ts": ts, "limit": 50},
                            )
                            replies = [m.get("text") or "" for m in (thread.get("messages") or [])[1:]]
                            if replies:
                                text += "\n\nThread:\n" + "\n".join(f"- {line}" for line in replies if line)
                        except Exception as exc:
                            errors.append({"message_id": f"{channel['id']}:{ts}", "error": str(exc)})
                    if not text.strip():
                        files_skipped += 1
                        continue
                    processed += 1
                    files_fetched += 1
                    rendered = f"[#{channel.get('name') or channel['id']}] {datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()}\n\n{text}"
                    body = rendered.encode("utf-8")
                    content_hash = _content_hash(body)
                    _, i_delta, s_delta = _upsert_document(
                        db,
                        integration,
                        external_id=f"{channel['id']}:{ts}",
                        title=f"Slack {channel.get('name') or channel['id']} {ts}",
                        body=body,
                        url=None,
                        content_hash=content_hash,
                        errors=errors,
                    )
                    files_indexed += i_delta
                    files_skipped += s_delta
                cursor = (data.get("response_metadata") or {}).get("next_cursor") or ""
                if not cursor:
                    break

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
