"""
Google Drive connector routes.
"""
from __future__ import annotations

import ipaddress
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from ..auth import (
    ensure_connector_project_access,
    get_current_user_required,
    try_connector_project_access,
)
from ..db import get_db
from ..models import (
    ConnectorIntegration,
    ConnectorIntegrationStatus,
    ConnectorProjectCredential,
    ConnectorSyncJob,
    Project,
    User,
)
from ..schemas import (
    GoogleDriveAuthUrlOut,
    GoogleDriveBrowseItemOut,
    GoogleDriveCredentialStatusOut,
    GoogleDriveCredentialUpsertRequest,
    GoogleDriveFolderOut,
    GoogleDriveIntegrationOut,
    GoogleDriveSettingsUpdateRequest,
    GoogleDriveSourcesUpdateRequest,
    GoogleDriveSyncJobOut,
)
from ..security_utils import encrypt_secret, safe_decrypt_secret
from ..services.connectors.framework import (
    CONNECTOR_TYPE_GOOGLE_DRIVE,
    CONNECTOR_BROWSE_LIMIT,
    CONNECTOR_MANUAL_SYNC_LIMIT,
    assert_connector_rate_limit,
    create_sync_job,
    enqueue_connector_sync,
    get_integration,
    get_or_create_settings_row,
    get_or_create_sources_row,
    resolve_oauth_credentials,
    store_encrypted_tokens,
    validate_connector_settings,
)
from ..services.connectors import google_drive as drive_service
from ..settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/connectors/google_drive", tags=["Google Drive Connector"])

_REDIRECT_SUFFIX = "/connectors/google_drive/auth/callback"
_REDIRECT_REJECT_DETAIL = (
    "Redirect URI cannot use a private LAN IP. Use localhost or a public https URL "
    "and add the same URI in Google Cloud Console."
)


def _validate_redirect_uri(redirect_uri: str) -> None:
    raw = (redirect_uri or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="redirect_uri is required.")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="redirect_uri must use http or https.")
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=400, detail="redirect_uri must include a host.")
    try:
        ip = ipaddress.ip_address(host)
        if not ip.is_loopback and (ip.is_private or ip.is_link_local or ip.is_reserved):
            raise HTTPException(status_code=400, detail=_REDIRECT_REJECT_DETAIL)
    except ValueError:
        pass
    path = (parsed.path or "").rstrip("/")
    if not path.endswith(_REDIRECT_SUFFIX.rstrip("/")):
        raise HTTPException(
            status_code=400,
            detail=f"Redirect URI path must end with {_REDIRECT_SUFFIX}.",
        )


def _integration_out(integration: ConnectorIntegration) -> GoogleDriveIntegrationOut:
    return GoogleDriveIntegrationOut(
        id=integration.id,
        account_label=integration.account_label,
        status=integration.status.value,
        is_active=integration.is_active,
        last_sync_at=integration.last_sync_at,
        documents_indexed=integration.documents_indexed,
        settings=validate_connector_settings(
            integration.settings.settings if integration.settings else {}
        ),
        sources=(integration.sources.sources if integration.sources else {"folders": [], "files": []}),
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


@router.get("/auth/start", response_model=GoogleDriveAuthUrlOut)
def auth_start(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    client_id, client_secret, redirect_uri = resolve_oauth_credentials(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    _validate_redirect_uri(redirect_uri)
    try:
        auth_url = drive_service.get_auth_url(
            project_id=str(project_id),
            user_id=current_user.id,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )
        return GoogleDriveAuthUrlOut(auth_url=auth_url)
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Google Drive dependencies not installed.",
        )


@router.get("/auth/callback")
def auth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    state_data = drive_service.parse_oauth_state(state)
    project_id = state_data.get("project_id")
    user_id = state_data.get("user_id")
    if not project_id or not user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    try:
        client_id, client_secret, redirect_uri = resolve_oauth_credentials(
            db=db,
            user_id=int(user_id),
            project_id=uuid.UUID(project_id),
            connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
        )
        tokens = drive_service.exchange_code_for_tokens(
            code,
            redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
            state=state,
        )
        email = drive_service.get_google_account_email(tokens["access_token"])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Google Drive token exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {exc}")

    existing = get_integration(
        db,
        user_id=int(user_id),
        project_id=uuid.UUID(project_id),
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if existing:
        store_encrypted_tokens(existing, tokens)
        existing.account_label = email
        existing.status = ConnectorIntegrationStatus.ACTIVE
        existing.is_active = True
        integration = existing
    else:
        integration = ConnectorIntegration(
            user_id=int(user_id),
            project_id=uuid.UUID(project_id),
            connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
            account_label=email,
            access_token="",
            refresh_token="",
            status=ConnectorIntegrationStatus.ACTIVE,
            is_active=True,
        )
        store_encrypted_tokens(integration, tokens)
        db.add(integration)
        db.flush()
        get_or_create_settings_row(db, integration.id)
        get_or_create_sources_row(db, integration.id)

    db.commit()

    app_origin = (settings.frontend_base_url or "").rstrip("/")
    post_message = ""
    if app_origin:
        post_message = (
            f"window.opener.postMessage("
            f"{{ type: 'connector_connected', connector: 'google_drive' }}, "
            f"'{app_origin}');"
        )
    return HTMLResponse(
        content=f"""<!DOCTYPE html>
<html><head><title>Google Drive Connected</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Google Drive connected! Closing...</p>
<script>
  if (window.opener) {{
    {post_message}
  }}
  window.close();
</script>
</body></html>"""
    )


@router.post("/credentials", response_model=GoogleDriveCredentialStatusOut)
def upsert_credentials(
    payload: GoogleDriveCredentialUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    _validate_redirect_uri(payload.redirect_uri)

    existing = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == current_user.id,
            ConnectorProjectCredential.project_id == payload.project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_GOOGLE_DRIVE,
        )
        .first()
    )
    encrypted_secret = encrypt_secret(payload.client_secret)
    if existing:
        existing.client_id = payload.client_id
        existing.client_secret_encrypted = encrypted_secret
        existing.redirect_uri = payload.redirect_uri
    else:
        db.add(
            ConnectorProjectCredential(
                user_id=current_user.id,
                project_id=payload.project_id,
                connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
                client_id=payload.client_id,
                client_secret_encrypted=encrypted_secret,
                redirect_uri=payload.redirect_uri,
            )
        )
    db.commit()
    row = existing or (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == current_user.id,
            ConnectorProjectCredential.project_id == payload.project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_GOOGLE_DRIVE,
        )
        .first()
    )
    return GoogleDriveCredentialStatusOut(
        configured=True,
        client_id=row.client_id,
        redirect_uri=row.redirect_uri,
        updated_at=row.updated_at,
    )


@router.get("/credentials/status", response_model=GoogleDriveCredentialStatusOut)
def credentials_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return GoogleDriveCredentialStatusOut(configured=False)
    existing = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == current_user.id,
            ConnectorProjectCredential.project_id == project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_GOOGLE_DRIVE,
        )
        .first()
    )
    if existing:
        return GoogleDriveCredentialStatusOut(
            configured=True,
            client_id=existing.client_id,
            redirect_uri=existing.redirect_uri,
            updated_at=existing.updated_at,
        )
    if settings.google_client_id and settings.google_client_secret:
        redirect = (settings.google_redirect_uri or "").replace(
            "/gmail/auth/callback", _REDIRECT_SUFFIX
        )
        return GoogleDriveCredentialStatusOut(
            configured=True,
            client_id=settings.google_client_id,
            redirect_uri=redirect,
        )
    return GoogleDriveCredentialStatusOut(configured=False)


@router.get("/status", response_model=Optional[GoogleDriveIntegrationOut])
def integration_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return None
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        return None
    return _integration_out(integration)


@router.post("/sources", response_model=GoogleDriveIntegrationOut)
def update_sources(
    payload: GoogleDriveSourcesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=payload.project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Google Drive is not connected")
    sources_row = get_or_create_sources_row(db, integration.id)
    sources_row.sources = {
        "folders": [f.model_dump() for f in payload.folders],
        "files": [f.model_dump() for f in payload.files],
    }
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/settings", response_model=GoogleDriveIntegrationOut)
def update_settings(
    payload: GoogleDriveSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=payload.project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Google Drive is not connected")
    settings_row = get_or_create_settings_row(db, integration.id)
    settings_row.settings = validate_connector_settings(payload.settings)
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.get("/browse", response_model=List[GoogleDriveBrowseItemOut])
def browse_drive(
    project_id: uuid.UUID = Query(...),
    parent_id: str = Query("root"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    assert_connector_rate_limit(
        f"connector_browse:{current_user.id}",
        limit=CONNECTOR_BROWSE_LIMIT,
    )
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Google Drive is not connected")
    try:
        items = drive_service.list_children(db, integration, parent_id=parent_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [
        GoogleDriveBrowseItemOut(
            id=i["id"],
            name=i["name"],
            kind=i["kind"],
            mime_type=i.get("mime_type"),
        )
        for i in items
    ]


@router.get("/folders", response_model=List[GoogleDriveFolderOut])
def list_folders(
    project_id: uuid.UUID = Query(...),
    parent_id: str = Query("root"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Google Drive is not connected")
    folders = drive_service.list_folders(db, integration, parent_id=parent_id)
    return [GoogleDriveFolderOut(id=f["id"], name=f["name"]) for f in folders]


@router.post("/sync", response_model=GoogleDriveSyncJobOut)
def trigger_sync(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Google Drive is not connected")

    assert_connector_rate_limit(
        f"connector_sync:{integration.id}",
        limit=CONNECTOR_MANUAL_SYNC_LIMIT,
    )

    sync_job = create_sync_job(db, integration.id)
    if not enqueue_connector_sync(db, integration=integration, sync_job_id=sync_job.id):
        drive_service.run_google_drive_sync(db, str(integration.id), str(sync_job.id))
    db.refresh(sync_job)
    return GoogleDriveSyncJobOut(
        id=sync_job.id,
        integration_id=sync_job.integration_id,
        status=sync_job.status.value,
        files_fetched=sync_job.files_fetched,
        files_indexed=sync_job.files_indexed,
        files_skipped=sync_job.files_skipped,
        errors=sync_job.errors or [],
        queued_at=sync_job.queued_at,
        started_at=sync_job.started_at,
        finished_at=sync_job.finished_at,
    )


@router.get("/jobs", response_model=List[GoogleDriveSyncJobOut])
def list_jobs(
    project_id: uuid.UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        return []
    jobs = (
        db.query(ConnectorSyncJob)
        .filter(ConnectorSyncJob.integration_id == integration.id)
        .order_by(ConnectorSyncJob.queued_at.desc())
        .limit(limit)
        .all()
    )
    return [
        GoogleDriveSyncJobOut(
            id=job.id,
            integration_id=job.integration_id,
            status=job.status.value,
            files_fetched=job.files_fetched,
            files_indexed=job.files_indexed,
            files_skipped=job.files_skipped,
            errors=job.errors or [],
            queued_at=job.queued_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )
        for job in jobs
    ]


@router.post("/pause", response_model=GoogleDriveIntegrationOut)
def pause_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Google Drive is not connected")
    integration.is_active = False
    integration.status = ConnectorIntegrationStatus.PAUSED
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/resume", response_model=GoogleDriveIntegrationOut)
def resume_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Google Drive is not connected")
    integration.is_active = True
    integration.status = ConnectorIntegrationStatus.ACTIVE
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/disconnect")
def disconnect(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=project_id,
        connector_type=CONNECTOR_TYPE_GOOGLE_DRIVE,
    )
    if not integration:
        return {"message": "Not connected"}

    try:
        drive_service.revoke_token(safe_decrypt_secret(integration.access_token))
    except Exception:
        pass

    # Keep indexed UploadedDocuments in the project; disconnect only removes the
    # Drive connection. Users can reconnect later without losing indexed content.
    db.delete(integration)
    db.commit()
    return {"message": "Google Drive disconnected"}
