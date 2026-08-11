"""
SharePoint connector routes.
"""
from __future__ import annotations

import uuid
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
    SharePointAuthUrlOut,
    SharePointCredentialStatusOut,
    SharePointCredentialUpsertRequest,
    SharePointDriveOut,
    SharePointIntegrationOut,
    SharePointSettingsUpdateRequest,
    SharePointSiteOut,
    SharePointSourcesUpdateRequest,
    SharePointSyncJobOut,
)
from ..security_utils import decrypt_secret, encrypt_secret
from ..services.connectors import sharepoint as sharepoint_service
from ..services.connectors.framework import (
    CONNECTOR_BROWSE_LIMIT,
    CONNECTOR_MANUAL_SYNC_LIMIT,
    CONNECTOR_TYPE_SHAREPOINT,
    assert_connector_rate_limit,
    create_sync_job,
    enqueue_connector_sync,
    get_integration,
    get_or_create_settings_row,
    get_or_create_sources_row,
    store_encrypted_tokens,
    validate_sharepoint_settings,
)
from ..settings import settings

router = APIRouter(prefix="/api/v1/connectors/sharepoint", tags=["SharePoint Connector"])
_REDIRECT_SUFFIX = "/connectors/sharepoint/auth/callback"
_DEFAULT_TENANT = "common"



def _validate_redirect_uri(redirect_uri: str) -> None:
    raw = (redirect_uri or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="redirect_uri is required.")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="redirect_uri must use http or https.")
    if not (parsed.path or "").rstrip("/").endswith(_REDIRECT_SUFFIX.rstrip("/")):
        raise HTTPException(status_code=400, detail=f"Redirect URI path must end with {_REDIRECT_SUFFIX}.")


def _resolve_credentials(db: Session, user_id: int, project_id: uuid.UUID) -> tuple[str, str, str]:
    row = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == user_id,
            ConnectorProjectCredential.project_id == project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_SHAREPOINT,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=400, detail="SharePoint OAuth credentials are not configured for this project")
    return row.client_id, decrypt_secret(row.client_secret_encrypted), row.redirect_uri


def _integration_out(integration: ConnectorIntegration) -> SharePointIntegrationOut:
    sources = integration.sources.sources if integration.sources else {}
    return SharePointIntegrationOut(
        id=integration.id,
        account_label=integration.account_label,
        status=integration.status.value,
        is_active=integration.is_active,
        last_sync_at=integration.last_sync_at,
        documents_indexed=integration.documents_indexed,
        settings=validate_sharepoint_settings(integration.settings.settings if integration.settings else {}),
        sources={"sites": sources.get("sites") or [], "drives": sources.get("drives") or []},
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


@router.get("/auth/start", response_model=SharePointAuthUrlOut)
def auth_start(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    client_id, _secret, redirect_uri = _resolve_credentials(db, current_user.id, project_id)
    _validate_redirect_uri(redirect_uri)
    return SharePointAuthUrlOut(
        auth_url=sharepoint_service.get_auth_url(
            str(project_id),
            current_user.id,
            client_id,
            redirect_uri,
            tenant_id=_DEFAULT_TENANT,
        )
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
    state_data = sharepoint_service.parse_oauth_state(state)
    project_id = state_data.get("project_id")
    user_id = state_data.get("user_id")
    if not project_id or not user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    client_id, client_secret, redirect_uri = _resolve_credentials(db, int(user_id), uuid.UUID(project_id))
    tokens = sharepoint_service.exchange_code_for_tokens(
        code, redirect_uri, client_id, client_secret, tenant_id=_DEFAULT_TENANT
    )

    existing = get_integration(
        db,
        user_id=int(user_id),
        project_id=uuid.UUID(project_id),
        connector_type=CONNECTOR_TYPE_SHAREPOINT,
    )
    label = "SharePoint"
    if existing:
        store_encrypted_tokens(existing, tokens)
        existing.account_label = label
        existing.status = ConnectorIntegrationStatus.ACTIVE
        existing.is_active = True
        integration = existing
    else:
        integration = ConnectorIntegration(
            user_id=int(user_id),
            project_id=uuid.UUID(project_id),
            connector_type=CONNECTOR_TYPE_SHAREPOINT,
            account_label=label,
            access_token="",
            refresh_token="",
            status=ConnectorIntegrationStatus.ACTIVE,
            is_active=True,
        )
        store_encrypted_tokens(integration, tokens)
        db.add(integration)
        db.flush()
        get_or_create_settings_row(db, integration.id)
        sources_row = get_or_create_sources_row(db, integration.id)
        sources_row.sources = {"sites": [], "drives": []}
    db.commit()
    app_origin = (settings.frontend_base_url or "").rstrip("/")
    post_message = ""
    if app_origin:
        post_message = f"window.opener.postMessage({{ type: 'connector_connected', connector: 'sharepoint' }}, '{app_origin}');"
    return HTMLResponse(content=f"<html><body><p>SharePoint connected! Closing...</p><script>if (window.opener) {{{post_message}}} window.close();</script></body></html>")


@router.post("/credentials", response_model=SharePointCredentialStatusOut)
def upsert_credentials(
    payload: SharePointCredentialUpsertRequest,
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
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_SHAREPOINT,
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
                connector_type=CONNECTOR_TYPE_SHAREPOINT,
                client_id=payload.client_id,
                client_secret_encrypted=encrypted_secret,
                redirect_uri=payload.redirect_uri,
            )
        )
    db.commit()
    return SharePointCredentialStatusOut(configured=True, client_id=payload.client_id, redirect_uri=payload.redirect_uri)


@router.get("/credentials/status", response_model=SharePointCredentialStatusOut)
def credentials_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return SharePointCredentialStatusOut(configured=False)
    row = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == current_user.id,
            ConnectorProjectCredential.project_id == project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_SHAREPOINT,
        )
        .first()
    )
    if not row:
        return SharePointCredentialStatusOut(configured=False)
    return SharePointCredentialStatusOut(
        configured=True,
        client_id=row.client_id,
        redirect_uri=row.redirect_uri,
        updated_at=row.updated_at,
    )


@router.get("/status", response_model=Optional[SharePointIntegrationOut])
def integration_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return None
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    return _integration_out(integration) if integration else None


@router.get("/sites", response_model=List[SharePointSiteOut])
def list_sites(
    project_id: uuid.UUID = Query(...),
    query: str = Query("*"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    assert_connector_rate_limit(f"connector_browse:{current_user.id}", limit=CONNECTOR_BROWSE_LIMIT)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        raise HTTPException(status_code=404, detail="SharePoint is not connected")
    token = decrypt_secret(integration.access_token)
    return [SharePointSiteOut(**x) for x in sharepoint_service.list_sites(token, query=query)]


@router.get("/drives", response_model=List[SharePointDriveOut])
def list_drives(
    project_id: uuid.UUID = Query(...),
    site_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    assert_connector_rate_limit(f"connector_browse:{current_user.id}", limit=CONNECTOR_BROWSE_LIMIT)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        raise HTTPException(status_code=404, detail="SharePoint is not connected")
    token = decrypt_secret(integration.access_token)
    return [SharePointDriveOut(**x) for x in sharepoint_service.list_drives(token, site_id=site_id)]


@router.post("/sources", response_model=SharePointIntegrationOut)
def update_sources(
    payload: SharePointSourcesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=payload.project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        raise HTTPException(status_code=404, detail="SharePoint is not connected")
    sources_row = get_or_create_sources_row(db, integration.id)
    sources_row.sources = {"sites": [x.model_dump() for x in payload.sites], "drives": [x.model_dump() for x in payload.drives]}
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/settings", response_model=SharePointIntegrationOut)
def update_settings(
    payload: SharePointSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=payload.project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        raise HTTPException(status_code=404, detail="SharePoint is not connected")
    row = get_or_create_settings_row(db, integration.id)
    row.settings = validate_sharepoint_settings(payload.settings)
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/sync", response_model=SharePointSyncJobOut)
def trigger_sync(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        raise HTTPException(status_code=404, detail="SharePoint is not connected")
    assert_connector_rate_limit(f"connector_sync:{integration.id}", limit=CONNECTOR_MANUAL_SYNC_LIMIT)
    sync_job = create_sync_job(db, integration.id)
    if not enqueue_connector_sync(db, integration=integration, sync_job_id=sync_job.id):
        sharepoint_service.run_sharepoint_sync(db, str(integration.id), str(sync_job.id))
    db.refresh(sync_job)
    return SharePointSyncJobOut(
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


@router.get("/jobs", response_model=List[SharePointSyncJobOut])
def list_jobs(
    project_id: uuid.UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
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
        SharePointSyncJobOut(
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


@router.post("/pause", response_model=SharePointIntegrationOut)
def pause_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        raise HTTPException(status_code=404, detail="SharePoint is not connected")
    integration.is_active = False
    integration.status = ConnectorIntegrationStatus.PAUSED
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/resume", response_model=SharePointIntegrationOut)
def resume_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        raise HTTPException(status_code=404, detail="SharePoint is not connected")
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
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_SHAREPOINT
    )
    if not integration:
        return {"message": "Not connected"}
    db.delete(integration)
    db.commit()
    return {"message": "SharePoint disconnected"}
