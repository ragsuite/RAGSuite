"""
Google Drive connector: OAuth, folder listing, sync, and per-file staging.
"""
from __future__ import annotations

import hashlib
import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

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
    decrypt_secret,
    pop_oauth_code_verifier,
    safe_decrypt_secret,
    store_oauth_code_verifier,
    verify_oauth_state,
)
from ...settings import settings
from ..document_ingest_orchestration import staging_path_for_document
from .framework import (
    CONNECTOR_TYPE_GOOGLE_DRIVE,
    SOURCE_GOOGLE_DRIVE,
    count_indexed_connector_documents,
    enqueue_connector_document_ingest,
    ingest_pool_is_busy,
    mark_sync_job_finished,
    resolve_oauth_credentials,
    validate_connector_settings,
)

logger = logging.getLogger(__name__)

os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

FOLDER_MIME = "application/vnd.google-apps.folder"
_DRIVE_PARENT_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
SKIP_MIMES = {
    "application/vnd.google-apps.form",
    "application/vnd.google-apps.drawing",
    "application/vnd.google-apps.shortcut",
    "application/vnd.google-apps.map",
}
EXPORT_MIMES = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}
DOWNLOAD_MIMES = {
    "application/pdf",
    "application/json",
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/x-python",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
}


def _get_flow(redirect_uri: str, client_id: str, client_secret: str):
    from google_auth_oauthlib.flow import Flow

    return Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=DRIVE_SCOPES,
        redirect_uri=redirect_uri,
    )


def get_auth_url(
    project_id: str,
    user_id: int,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> str:
    flow = _get_flow(redirect_uri, client_id, client_secret)
    state = create_oauth_state(
        provider="google_drive", user_id=user_id, project_id=str(project_id)
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        # "select_account" forces Google's account chooser so a user who
        # disconnected can pick a different account; "consent" re-issues a
        # refresh token. Without select_account, a single browser session is
        # silently re-authorized to the previously connected account.
        prompt="select_account consent",
        state=state,
    )
    verifier = getattr(flow, "code_verifier", None)
    if verifier:
        store_oauth_code_verifier(state, verifier)
    return auth_url


def parse_oauth_state(state: str) -> Dict[str, Any]:
    return verify_oauth_state(state, expected_provider="google_drive")


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
    state: Optional[str] = None,
) -> Dict[str, Any]:
    flow = _get_flow(redirect_uri, client_id, client_secret)
    verifier = pop_oauth_code_verifier(state) if state else None
    flow.fetch_token(code=code, code_verifier=verifier)
    creds = flow.credentials
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_expiry": creds.expiry,
    }


def get_google_account_email(access_token: str) -> str:
    import requests

    resp = requests.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("email", "")


def revoke_token(access_token: str) -> None:
    import requests

    try:
        requests.post(
            "https://oauth2.googleapis.com/revoke",
            params={"token": access_token},
            timeout=10,
        )
    except Exception as exc:
        logger.warning("Drive token revocation failed: %s", exc)


def _build_drive_service(
    access_token: str,
    refresh_token: str,
    client_id: str,
    client_secret: str,
):
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=DRIVE_SCOPES,
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _validate_parent_id(parent_id: str) -> str:
    raw = (parent_id or "root").strip()
    if raw == "root":
        return raw
    if not _DRIVE_PARENT_ID_RE.match(raw):
        raise ValueError("Invalid Drive folder id")
    return raw


def list_children(
    db: Session,
    integration: ConnectorIntegration,
    *,
    parent_id: str = "root",
) -> List[Dict[str, str]]:
    """List folders and files directly under parent_id (includes root loose files)."""
    parent_id = _validate_parent_id(parent_id)
    client_id, client_secret, _ = resolve_oauth_credentials(
        db,
        user_id=integration.user_id,
        project_id=integration.project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    service = _build_drive_service(
        safe_decrypt_secret(integration.access_token),
        safe_decrypt_secret(integration.refresh_token),
        client_id,
        client_secret,
    )
    items: List[Dict[str, str]] = []
    for item in _list_files_in_folder(service, parent_id):
        file_id = item.get("id")
        name = item.get("name") or file_id or ""
        if not file_id:
            continue
        mime = item.get("mimeType", "")
        if mime == FOLDER_MIME:
            items.append({"id": file_id, "name": name, "kind": "folder", "mime_type": mime})
        else:
            items.append({"id": file_id, "name": name, "kind": "file", "mime_type": mime})
    items.sort(key=lambda x: (0 if x["kind"] == "folder" else 1, x["name"].lower()))
    return items


def list_folders(
    db: Session,
    integration: ConnectorIntegration,
    *,
    parent_id: str = "root",
) -> List[Dict[str, str]]:
    client_id, client_secret, _ = resolve_oauth_credentials(
        db,
        user_id=integration.user_id,
        project_id=integration.project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    service = _build_drive_service(
        safe_decrypt_secret(integration.access_token),
        safe_decrypt_secret(integration.refresh_token),
        client_id,
        client_secret,
    )
    q = (
        f"'{parent_id}' in parents and mimeType='{FOLDER_MIME}' and trashed=false"
    )
    results = (
        service.files()
        .list(
            q=q,
            fields="files(id,name)",
            pageSize=100,
            orderBy="name",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    return [{"id": f["id"], "name": f.get("name", "")} for f in results.get("files", [])]


def _should_skip_mime(mime: str, cfg: Dict[str, Any]) -> bool:
    if not mime:
        return True
    if mime in SKIP_MIMES:
        return True
    if cfg.get("exclude_images") and mime.startswith("image/"):
        return True
    if cfg.get("exclude_videos") and mime.startswith("video/"):
        return True
    if mime == FOLDER_MIME:
        return True
    if mime in EXPORT_MIMES or mime in DOWNLOAD_MIMES:
        return False
    if mime.startswith("application/vnd.google-apps."):
        return True
    return False


def _content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# uploaded_documents.type is varchar(50); long MIME types (e.g. the 71-char DOCX
# type) must be shortened to a "<main>/<EXT>" form to avoid insert failures.
_MAX_DOC_TYPE_LEN = 50


def _normalize_doc_type(mime: str, ext: str) -> str:
    mime = mime or "application/octet-stream"
    if len(mime) <= _MAX_DOC_TYPE_LEN:
        return mime
    if "/" in mime:
        main_type = mime.split("/", 1)[0]
        extension = (ext or "").lstrip(".").upper() or "FILE"
        shortened = f"{main_type}/{extension}"
        if len(shortened) <= _MAX_DOC_TYPE_LEN:
            return shortened
    return mime[:_MAX_DOC_TYPE_LEN]


def _find_prior_uploaded_drive_file(
    db: Session,
    project_id: uuid.UUID,
    drive_file_id: str,
) -> Optional[UploadedDocument]:
    """Find an indexed upload from a previous Drive connection (same project)."""
    for doc in (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == project_id,
            UploadedDocument.source == SOURCE_GOOGLE_DRIVE,
        )
        .all()
    ):
        meta = doc.meta_data or {}
        if str(meta.get("drive_file_id") or "") == drive_file_id:
            return doc
    return None


def _download_file_content(
    service,
    file_meta: Dict[str, Any],
    max_size_bytes: int,
) -> Tuple[Optional[bytes], str]:
    mime = file_meta.get("mimeType", "")
    size = int(file_meta.get("size") or 0)
    if size and size > max_size_bytes:
        raise ValueError(f"File exceeds max size ({size} > {max_size_bytes})")

    if mime in EXPORT_MIMES:
        export_mime = EXPORT_MIMES[mime]
        request = service.files().export_media(fileId=file_meta["id"], mimeType=export_mime)
        ext = ".txt" if export_mime.startswith("text/") else ".csv"
    elif mime in DOWNLOAD_MIMES or not mime.startswith("application/vnd.google-apps."):
        request = service.files().get_media(fileId=file_meta["id"])
        ext = ".bin"
        if mime == "application/pdf":
            ext = ".pdf"
        elif mime == "application/json":
            ext = ".json"
        elif mime == "text/x-python":
            ext = ".py"
        elif mime.endswith("wordprocessingml.document"):
            ext = ".docx"
        elif mime.endswith("presentationml.presentation"):
            ext = ".pptx"
        elif mime == "application/vnd.ms-powerpoint":
            ext = ".ppt"
        elif mime == "application/msword":
            ext = ".doc"
        elif mime == "text/plain":
            ext = ".txt"
        elif mime == "text/csv":
            ext = ".csv"
        elif mime == "text/markdown":
            ext = ".md"
        else:
            # Prefer filename extension over opaque .bin for Office/binary downloads.
            name = (file_meta.get("name") or "").strip()
            name_ext = os.path.splitext(name)[1].lower()
            if name_ext in {
                ".pdf",
                ".docx",
                ".doc",
                ".pptx",
                ".ppt",
                ".txt",
                ".md",
                ".csv",
                ".html",
                ".htm",
                ".json",
            }:
                ext = name_ext
    else:
        raise ValueError(f"Unsupported mime type: {mime}")

    buffer = io.BytesIO()
    from googleapiclient.http import MediaIoBaseDownload

    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
        if buffer.tell() > max_size_bytes:
            raise ValueError("File exceeds max size during download")
    return buffer.getvalue(), ext


def _list_files_in_folder(service, folder_id: str) -> List[Dict[str, Any]]:
    files: List[Dict[str, Any]] = []
    page_token = None
    while True:
        resp = (
            service.files()
            .list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields="nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,trashed)",
                pageSize=100,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageToken=page_token,
            )
            .execute()
        )
        files.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def _collect_files_recursive(
    service,
    folder_ids: List[str],
    *,
    max_files: int,
) -> List[Dict[str, Any]]:
    collected: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    queue: List[str] = list(folder_ids)

    while queue and len(collected) < max_files:
        folder_id = queue.pop(0)
        for item in _list_files_in_folder(service, folder_id):
            file_id = item.get("id")
            if not file_id or file_id in seen:
                continue
            seen.add(file_id)
            if item.get("mimeType") == FOLDER_MIME:
                queue.append(file_id)
                continue
            collected.append(item)
            if len(collected) >= max_files:
                break
    return collected


def _fetch_file_metas_by_ids(
    service,
    file_ids: List[str],
) -> List[Dict[str, Any]]:
    metas: List[Dict[str, Any]] = []
    for file_id in file_ids:
        if not file_id:
            continue
        try:
            meta = (
                service.files()
                .get(
                    fileId=file_id,
                    fields="id,name,mimeType,size,modifiedTime,webViewLink,trashed",
                    supportsAllDrives=True,
                )
                .execute()
            )
            if meta.get("trashed"):
                continue
            if meta.get("mimeType") == FOLDER_MIME:
                continue
            metas.append(meta)
        except Exception as exc:
            logger.warning("Drive file metadata fetch failed for %s: %s", file_id, exc)
    return metas


def _collect_files_for_sync(
    service,
    folder_ids: List[str],
    file_ids: List[str],
    *,
    max_files: int,
) -> List[Dict[str, Any]]:
    """Collect file metas from selected folders (recursive) plus explicit file ids."""
    collected: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    for file_meta in _collect_files_recursive(service, folder_ids, max_files=max_files):
        file_id = file_meta.get("id")
        if file_id and file_id not in seen:
            seen.add(file_id)
            collected.append(file_meta)
        if len(collected) >= max_files:
            return collected

    remaining = max(0, max_files - len(collected))
    if remaining and file_ids:
        extra_ids = [fid for fid in file_ids if fid and fid not in seen][:remaining]
        for file_meta in _fetch_file_metas_by_ids(service, extra_ids):
            file_id = file_meta.get("id")
            if file_id and file_id not in seen:
                seen.add(file_id)
                collected.append(file_meta)
            if len(collected) >= max_files:
                break
    return collected


def _parse_drive_modified(modified: Optional[str]) -> Optional[datetime]:
    if not modified:
        return None
    try:
        return datetime.fromisoformat(modified.replace("Z", "+00:00"))
    except ValueError:
        return None


def run_google_drive_sync(db: Session, integration_id: str, sync_job_id: str) -> None:
    """CONNECTOR_SYNC handler: list/download/export only; enqueue DOCUMENT_INGEST per file."""
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

    if integration.connector_type != CONNECTOR_TYPE_GOOGLE_DRIVE:
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
            mark_sync_job_finished(
                db,
                sync_job,
                status=ConnectorSyncJobStatus.COMPLETED,
                files_skipped=0,
            )
            return

        settings_row = integration.settings
        cfg = validate_connector_settings(settings_row.settings if settings_row else {})
        sources_row = integration.sources
        folder_ids = []
        file_ids = []
        if sources_row and isinstance(sources_row.sources, dict):
            folders = sources_row.sources.get("folders") or []
            files = sources_row.sources.get("files") or []
            folder_ids = [f.get("id") for f in folders if f.get("id")]
            file_ids = [f.get("id") for f in files if f.get("id")]

        if not folder_ids and not file_ids:
            integration.last_sync_at = datetime.now(timezone.utc)
            db.commit()
            mark_sync_job_finished(
                db,
                sync_job,
                status=ConnectorSyncJobStatus.COMPLETED,
                errors=[{"error": "No folders or files selected"}],
            )
            return

        client_id, client_secret, _ = resolve_oauth_credentials(
            db,
            user_id=integration.user_id,
            project_id=integration.project_id,
            connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
        )
        service = _build_drive_service(
            safe_decrypt_secret(integration.access_token),
            safe_decrypt_secret(integration.refresh_token),
            client_id,
            client_secret,
        )

        max_files = int(cfg["max_files"])
        max_size_bytes = int(cfg["max_size_mb"]) * 1024 * 1024
        file_metas = _collect_files_for_sync(
            service, folder_ids, file_ids, max_files=max_files
        )

        for file_meta in file_metas:
            if not integration.is_active:
                break
            if ingest_pool_is_busy(db):
                errors.append({"error": "Ingest pool busy; remaining files deferred to next sync"})
                break

            file_id = file_meta.get("id", "")
            mime = file_meta.get("mimeType", "")
            title = file_meta.get("name") or file_id

            if _should_skip_mime(mime, cfg):
                files_skipped += 1
                continue

            try:
                content, ext = _download_file_content(service, file_meta, max_size_bytes)
            except Exception as exc:
                errors.append({"file_id": file_id, "error": str(exc)})
                continue

            if not content:
                files_skipped += 1
                continue

            files_fetched += 1
            content_hash = _content_hash(content)
            existing = (
                db.query(ConnectorDocument)
                .filter(
                    ConnectorDocument.integration_id == integration.id,
                    ConnectorDocument.drive_file_id == file_id,
                )
                .first()
            )
            if not existing:
                prior_uploaded = _find_prior_uploaded_drive_file(
                    db, integration.project_id, file_id
                )
                if (
                    prior_uploaded
                    and prior_uploaded.status == "Indexed"
                    and (prior_uploaded.checksum or "") == content_hash
                ):
                    db.add(
                        ConnectorDocument(
                            integration_id=integration.id,
                            project_id=integration.project_id,
                            drive_file_id=file_id,
                            document_id=prior_uploaded.id,
                            content_hash=content_hash,
                            drive_modified_at=_parse_drive_modified(
                                file_meta.get("modifiedTime")
                            ),
                            trashed=False,
                        )
                    )
                    meta = dict(prior_uploaded.meta_data or {})
                    meta["integration_id"] = str(integration.id)
                    meta["drive_file_id"] = file_id
                    prior_uploaded.meta_data = meta
                    db.commit()
                    files_skipped += 1
                    continue
            # Skip only when the file is unchanged AND its UploadedDocument still
            # exists and is healthy. Failed / empty-chunk docs must be re-queued —
            # otherwise a wipe-then-fail reindex left them Failed forever while
            # Drive sync kept skipping on matching content_hash.
            if existing and existing.content_hash == content_hash and not existing.trashed:
                uploaded_row = None
                if existing.document_id is not None:
                    uploaded_row = (
                        db.query(UploadedDocument)
                        .filter(UploadedDocument.id == existing.document_id)
                        .first()
                    )
                if uploaded_row is not None:
                    status = uploaded_row.status or ""
                    failed_status = status in {
                        "Indexing Failed",
                        "No Text Extracted",
                        "Indexing Timed Out",
                        "Error",
                    }
                    # Indexed-with-0-chunks means coverage/UI desync after a wipe —
                    # re-queue. Do not touch Queued/Extracting/Indexing (in flight).
                    indexed_empty = status == "Indexed" and int(uploaded_row.chunks or 0) <= 0
                    if failed_status or indexed_empty:
                        staging_path = staging_path_for_document(
                            str(uploaded_row.id), f"{title}{ext}"
                        )
                        os.makedirs(os.path.dirname(staging_path), exist_ok=True)
                        with open(staging_path, "wb") as fh:
                            fh.write(content)
                        uploaded_row.text_content = content
                        uploaded_row.status = "Queued"
                        uploaded_row.chunks = 0
                        uploaded_row.type = _normalize_doc_type(mime, ext)
                        existing.staging_path = staging_path
                        db.commit()
                        if enqueue_connector_document_ingest(
                            db,
                            document_id=str(uploaded_row.id),
                            staging_path=staging_path,
                            user_id=integration.user_id,
                            project_id=integration.project_id,
                        ):
                            files_indexed += 1
                            logger.info(
                                "Drive file %s re-queued ingest for Failed/empty doc %s",
                                file_id,
                                uploaded_row.id,
                            )
                        else:
                            errors.append(
                                {
                                    "file_id": file_id,
                                    "error": "Failed to enqueue heal ingest",
                                }
                            )
                        continue
                    files_skipped += 1
                    continue
                logger.info(
                    "Drive file %s tracked but UploadedDocument %s missing — re-ingesting",
                    file_id,
                    existing.document_id,
                )

            old_document_id = existing.document_id if existing else None

            doc_uuid = uuid.uuid4()
            staging_path = staging_path_for_document(str(doc_uuid), f"{title}{ext}")
            os.makedirs(os.path.dirname(staging_path), exist_ok=True)
            with open(staging_path, "wb") as fh:
                fh.write(content)

            uploaded = UploadedDocument(
                id=doc_uuid,
                user_id=integration.user_id,
                project_id=integration.project_id,
                title=title[:1024],
                description=None,
                text_content=content,
                type=_normalize_doc_type(mime, ext),
                source=SOURCE_GOOGLE_DRIVE,
                language=None,
                status="Queued",
                chunks=0,
                checksum=content_hash,
                size_kb=max(1, len(content) // 1024),
                url=file_meta.get("webViewLink"),
                meta_data={
                    "integration_id": str(integration.id),
                    "drive_file_id": file_id,
                    "connector_type": CONNECTOR_TYPE_GOOGLE_DRIVE,
                },
            )
            db.add(uploaded)

            if old_document_id and old_document_id != doc_uuid:
                from ..rag.singleton import locked_delete_document_embeddings

                try:
                    locked_delete_document_embeddings(str(old_document_id))
                except Exception as exc:
                    logger.warning(
                        "Failed to delete old embeddings for Drive doc %s: %s",
                        old_document_id,
                        exc,
                    )
                old_uploaded = (
                    db.query(UploadedDocument)
                    .filter(UploadedDocument.id == old_document_id)
                    .first()
                )
                if old_uploaded:
                    db.delete(old_uploaded)

            if existing:
                existing.document_id = doc_uuid
                existing.content_hash = content_hash
                existing.staging_path = staging_path
                existing.drive_modified_at = _parse_drive_modified(file_meta.get("modifiedTime"))
                existing.trashed = False
            else:
                db.add(
                    ConnectorDocument(
                        integration_id=integration.id,
                        project_id=integration.project_id,
                        drive_file_id=file_id,
                        document_id=doc_uuid,
                        content_hash=content_hash,
                        staging_path=staging_path,
                        drive_modified_at=_parse_drive_modified(file_meta.get("modifiedTime")),
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
                files_indexed += 1
            else:
                errors.append({"file_id": file_id, "error": "Failed to enqueue document ingest"})

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
        logger.exception("Google Drive sync failed for %s: %s", integration_id, exc)
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
