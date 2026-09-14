"""
Microsoft Teams connector routes.
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
    User,
)
from ..schemas import (
    TeamsAuthUrlOut,
    TeamsChannelOut,
    TeamsCredentialStatusOut,
    TeamsCredentialUpsertRequest,
    TeamsIntegrationOut,
    TeamsSettingsUpdateRequest,
    TeamsSourcesUpdateRequest,
    TeamsSyncJobOut,
    TeamsTeamOut,
)
from ..security_utils import decrypt_secret, encrypt_secret
from ..services.connectors import teams as teams_service
from ..services.connectors.framework import (
    CONNECTOR_BROWSE_LIMIT,
    CONNECTOR_MANUAL_SYNC_LIMIT,
    CONNECTOR_TYPE_TEAMS,
    assert_connector_rate_limit,
    create_sync_job,
    enqueue_connector_sync,
    get_integration,
    get_or_create_settings_row,
    get_or_create_sources_row,
    store_encrypted_tokens,
    validate_teams_settings,
)
from ..settings import settings

router = APIRouter(prefix="/api/v1/connectors/teams", tags=["Teams Connector"])
_REDIRECT_SUFFIX = "/connectors/teams/auth/callback"
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
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_TEAMS,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=400, detail="Teams OAuth credentials are not configured for this project")
    return row.client_id, decrypt_secret(row.client_secret_encrypted), row.redirect_uri


def _integration_out(integration: ConnectorIntegration) -> TeamsIntegrationOut:
    sources = integration.sources.sources if integration.sources else {}
    return TeamsIntegrationOut(
        id=integration.id,
        account_label=integration.account_label,
        status=integration.status.value,
        is_active=integration.is_active,
        last_sync_at=integration.last_sync_at,
        documents_indexed=integration.documents_indexed,
        settings=validate_teams_settings(integration.settings.settings if integration.settings else {}),
        sources={
            "teams": sources.get("teams") or [],
            "channels": sources.get("channels") or [],
        },
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


@router.get("/auth/start", response_model=TeamsAuthUrlOut)
def auth_start(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    client_id, _secret, redirect_uri = _resolve_credentials(db, current_user.id, project_id)
    _validate_redirect_uri(redirect_uri)
    return TeamsAuthUrlOut(
        auth_url=teams_service.get_auth_url(
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
    state_data = teams_service.parse_oauth_state(state)
    project_id = state_data.get("project_id")
    user_id = state_data.get("user_id")
    if not project_id or not user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    client_id, client_secret, redirect_uri = _resolve_credentials(db, int(user_id), uuid.UUID(project_id))
    tokens = teams_service.exchange_code_for_tokens(
        code, redirect_uri, client_id, client_secret, tenant_id=_DEFAULT_TENANT
    )

    existing = get_integration(
        db,
        user_id=int(user_id),
        project_id=uuid.UUID(project_id),
        connector_type=CONNECTOR_TYPE_TEAMS,
    )
    label = "Microsoft Teams"
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
            connector_type=CONNECTOR_TYPE_TEAMS,
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
        sources_row.sources = {"teams": [], "channels": []}
    db.commit()
    app_origin = (settings.frontend_base_url or "").rstrip("/")
    post_message = ""
    if app_origin:
        post_message = (
            f"window.opener.postMessage({{ type: 'connector_connected', connector: 'teams' }}, '{app_origin}');"
        )
    return HTMLResponse(
        content=(
            "<html><body><p>Microsoft Teams connected! Closing...</p>"
            f"<script>if (window.opener) {{{post_message}}} window.close();</script>"
            "</body></html>"
        )
    )


@router.post("/credentials", response_model=TeamsCredentialStatusOut)
def upsert_credentials(
    payload: TeamsCredentialUpsertRequest,
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
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_TEAMS,
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
                connector_type=CONNECTOR_TYPE_TEAMS,
                client_id=payload.client_id,
                client_secret_encrypted=encrypted_secret,
                redirect_uri=payload.redirect_uri,
            )
        )
    db.commit()
    return TeamsCredentialStatusOut(
        configured=True, client_id=payload.client_id, redirect_uri=payload.redirect_uri
    )


@router.get("/credentials/status", response_model=TeamsCredentialStatusOut)
def credentials_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return TeamsCredentialStatusOut(configured=False)
    row = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == current_user.id,
            ConnectorProjectCredential.project_id == project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_TEAMS,
        )
        .first()
    )
    if not row:
        return TeamsCredentialStatusOut(configured=False)
    return TeamsCredentialStatusOut(
        configured=True,
        client_id=row.client_id,
        redirect_uri=row.redirect_uri,
        updated_at=row.updated_at,
    )


@router.get("/status", response_model=Optional[TeamsIntegrationOut])
def integration_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return None
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    return _integration_out(integration) if integration else None


@router.get("/teams", response_model=List[TeamsTeamOut])
def list_teams(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    assert_connector_rate_limit(f"connector_browse:{current_user.id}", limit=CONNECTOR_BROWSE_LIMIT)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Microsoft Teams is not connected")
    token = decrypt_secret(integration.access_token)
    try:
        return [TeamsTeamOut(**x) for x in teams_service.list_teams(token)]
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None) or 502
        detail = teams_service.graph_error_detail(exc)
        if status == 403 and "hasn't been provisioned" in detail.lower():
            detail = "Teams needs a Microsoft 365 work or school account."
        elif status == 403:
            detail = "Microsoft denied Teams access for this account."
        else:
            detail = (detail or "Could not load Teams.")[:120]
        raise HTTPException(status_code=int(status) if int(status) < 600 else 502, detail=detail) from exc


@router.get("/channels", response_model=List[TeamsChannelOut])
def list_channels(
    project_id: uuid.UUID = Query(...),
    team_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    assert_connector_rate_limit(f"connector_browse:{current_user.id}", limit=CONNECTOR_BROWSE_LIMIT)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Microsoft Teams is not connected")
    token = decrypt_secret(integration.access_token)
    try:
        return [TeamsChannelOut(**x) for x in teams_service.list_channels(token, team_id=team_id)]
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None) or 502
        detail = teams_service.graph_error_detail(exc)
        if status == 403:
            detail = "Microsoft denied access to this channel list."
        else:
            detail = (detail or "Could not load channels.")[:120]
        raise HTTPException(status_code=int(status) if int(status) < 600 else 502, detail=detail) from exc


@router.post("/sources", response_model=TeamsIntegrationOut)
def update_sources(
    payload: TeamsSourcesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=payload.project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Microsoft Teams is not connected")
    row = get_or_create_sources_row(db, integration.id)
    row.sources = {
        "teams": [x.model_dump() for x in payload.teams],
        "channels": [x.model_dump() for x in payload.channels],
    }
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/settings", response_model=TeamsIntegrationOut)
def update_settings(
    payload: TeamsSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=payload.project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Microsoft Teams is not connected")
    row = get_or_create_settings_row(db, integration.id)
    row.settings = validate_teams_settings(payload.settings)
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/sync", response_model=TeamsSyncJobOut)
def trigger_sync(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Microsoft Teams is not connected")
    assert_connector_rate_limit(f"connector_sync:{integration.id}", limit=CONNECTOR_MANUAL_SYNC_LIMIT)
    sync_job = create_sync_job(db, integration.id)
    if not enqueue_connector_sync(db, integration=integration, sync_job_id=sync_job.id):
        teams_service.run_teams_sync(db, str(integration.id), str(sync_job.id))
    db.refresh(sync_job)
    return TeamsSyncJobOut(
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


@router.get("/jobs", response_model=List[TeamsSyncJobOut])
def list_jobs(
    project_id: uuid.UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
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
        TeamsSyncJobOut(
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


@router.post("/pause", response_model=TeamsIntegrationOut)
def pause_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Microsoft Teams is not connected")
    integration.is_active = False
    integration.status = ConnectorIntegrationStatus.PAUSED
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/resume", response_model=TeamsIntegrationOut)
def resume_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    integration = get_integration(
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Microsoft Teams is not connected")
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
        db, user_id=current_user.id, project_id=project_id, connector_type=CONNECTOR_TYPE_TEAMS
    )
    if not integration:
        return {"message": "Not connected"}
    db.delete(integration)
    db.commit()
    return {"message": "Microsoft Teams disconnected"}
