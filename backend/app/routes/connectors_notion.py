"""
Notion connector routes.
"""
from __future__ import annotations

import logging
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
    NotionAuthUrlOut,
    NotionCredentialStatusOut,
    NotionCredentialUpsertRequest,
    NotionIntegrationOut,
    NotionSearchItemOut,
    NotionSettingsUpdateRequest,
    NotionSourcesUpdateRequest,
    NotionSyncJobOut,
)
from ..security_utils import encrypt_secret
from ..services.connectors.framework import (
    CONNECTOR_BROWSE_LIMIT,
    CONNECTOR_MANUAL_SYNC_LIMIT,
    CONNECTOR_TYPE_NOTION,
    assert_connector_rate_limit,
    create_sync_job,
    enqueue_connector_sync,
    get_integration,
    get_or_create_settings_row,
    get_or_create_sources_row,
    store_encrypted_tokens,
    validate_notion_settings,
)
from ..services.connectors import notion as notion_service
from ..settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/connectors/notion", tags=["Notion Connector"])

_REDIRECT_SUFFIX = "/connectors/notion/auth/callback"



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
    path = (parsed.path or "").rstrip("/")
    if not path.endswith(_REDIRECT_SUFFIX.rstrip("/")):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Redirect URI path must end with {_REDIRECT_SUFFIX}. "
                f"Example: http://localhost:9090/api/v1/connectors/notion/auth/callback"
            ),
        )


def _integration_out(integration: ConnectorIntegration) -> NotionIntegrationOut:
    sources = integration.sources.sources if integration.sources else {}
    return NotionIntegrationOut(
        id=integration.id,
        account_label=integration.account_label,
        status=integration.status.value,
        is_active=integration.is_active,
        last_sync_at=integration.last_sync_at,
        documents_indexed=integration.documents_indexed,
        settings=validate_notion_settings(
            integration.settings.settings if integration.settings else {}
        ),
        sources={
            "pages": sources.get("pages") or [],
            "databases": sources.get("databases") or [],
        },
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


def _resolve_credentials(db: Session, user_id: int, project_id: uuid.UUID):
    try:
        return notion_service._resolve_notion_credentials(
            db, user_id=user_id, project_id=project_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/auth/start", response_model=NotionAuthUrlOut)
def auth_start(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, project_id)
    client_id, _, redirect_uri = _resolve_credentials(db, current_user.id, project_id)
    _validate_redirect_uri(redirect_uri)
    auth_url = notion_service.get_auth_url(
        project_id=str(project_id),
        user_id=current_user.id,
        client_id=client_id,
        redirect_uri=redirect_uri,
    )
    return NotionAuthUrlOut(auth_url=auth_url)


@router.get("/auth/callback")
def auth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    state_data = notion_service.parse_oauth_state(state)
    project_id = state_data.get("project_id")
    user_id = state_data.get("user_id")
    if not project_id or not user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    try:
        client_id, client_secret, redirect_uri = notion_service._resolve_notion_credentials(
            db,
            user_id=int(user_id),
            project_id=uuid.UUID(project_id),
        )
        tokens = notion_service.exchange_code_for_tokens(
            code, redirect_uri, client_id=client_id, client_secret=client_secret
        )
        label = tokens.get("workspace_name") or "Notion workspace"
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Notion token exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {exc}") from exc

    existing = get_integration(
        db,
        user_id=int(user_id),
        project_id=uuid.UUID(project_id),
        connector_type=CONNECTOR_TYPE_NOTION,
    )
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
            connector_type=CONNECTOR_TYPE_NOTION,
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
        sources_row.sources = {"pages": [], "databases": []}

    db.commit()

    app_origin = (settings.frontend_base_url or "").rstrip("/")
    post_message = ""
    if app_origin:
        post_message = (
            f"window.opener.postMessage("
            f"{{ type: 'connector_connected', connector: 'notion' }}, "
            f"'{app_origin}');"
        )
    return HTMLResponse(
        content=f"""<!DOCTYPE html>
<html><head><title>Notion Connected</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Notion connected! Closing...</p>
<script>
  if (window.opener) {{
    {post_message}
  }}
  window.close();
</script>
</body></html>"""
    )


@router.post("/credentials", response_model=NotionCredentialStatusOut)
def upsert_credentials(
    payload: NotionCredentialUpsertRequest,
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
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_NOTION,
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
                connector_type=CONNECTOR_TYPE_NOTION,
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
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_NOTION,
        )
        .first()
    )
    return NotionCredentialStatusOut(
        configured=True,
        client_id=row.client_id,
        redirect_uri=row.redirect_uri,
        updated_at=row.updated_at,
    )


@router.get("/credentials/status", response_model=NotionCredentialStatusOut)
def credentials_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return NotionCredentialStatusOut(configured=False)
    existing = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == current_user.id,
            ConnectorProjectCredential.project_id == project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_NOTION,
        )
        .first()
    )
    if existing:
        return NotionCredentialStatusOut(
            configured=True,
            client_id=existing.client_id,
            redirect_uri=existing.redirect_uri,
            updated_at=existing.updated_at,
        )
    return NotionCredentialStatusOut(configured=False)


@router.get("/status", response_model=Optional[NotionIntegrationOut])
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
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        return None
    return _integration_out(integration)


@router.get("/search", response_model=List[NotionSearchItemOut])
def search_notion(
    project_id: uuid.UUID = Query(...),
    query: str = Query(""),
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
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Notion is not connected")
    try:
        items = notion_service.search_notion_sources(db, integration, query=query)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [
        NotionSearchItemOut(
            id=i["id"],
            name=i["name"],
            kind=i["kind"],
            parent_kind=i.get("parent_kind"),
            parent_name=i.get("parent_name"),
            last_edited_time=i.get("last_edited_time"),
        )
        for i in items
    ]


@router.post("/sources", response_model=NotionIntegrationOut)
def update_sources(
    payload: NotionSourcesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=payload.project_id,
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Notion is not connected")
    sources_row = get_or_create_sources_row(db, integration.id)
    sources_row.sources = {
        "pages": [p.model_dump() for p in payload.pages],
        "databases": [d.model_dump() for d in payload.databases],
    }
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/settings", response_model=NotionIntegrationOut)
def update_settings(
    payload: NotionSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, payload.project_id)
    integration = get_integration(
        db,
        user_id=current_user.id,
        project_id=payload.project_id,
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Notion is not connected")
    settings_row = get_or_create_settings_row(db, integration.id)
    settings_row.settings = validate_notion_settings(payload.settings)
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/sync", response_model=NotionSyncJobOut)
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
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Notion is not connected")

    assert_connector_rate_limit(
        f"connector_sync:{integration.id}",
        limit=CONNECTOR_MANUAL_SYNC_LIMIT,
    )

    sync_job = create_sync_job(db, integration.id)
    if not enqueue_connector_sync(db, integration=integration, sync_job_id=sync_job.id):
        notion_service.run_notion_sync(db, str(integration.id), str(sync_job.id))
    db.refresh(sync_job)
    return NotionSyncJobOut(
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


@router.get("/jobs", response_model=List[NotionSyncJobOut])
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
        connector_type=CONNECTOR_TYPE_NOTION,
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
        NotionSyncJobOut(
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


@router.post("/pause", response_model=NotionIntegrationOut)
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
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Notion is not connected")
    integration.is_active = False
    integration.status = ConnectorIntegrationStatus.PAUSED
    db.commit()
    db.refresh(integration)
    return _integration_out(integration)


@router.post("/resume", response_model=NotionIntegrationOut)
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
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Notion is not connected")
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
        connector_type=CONNECTOR_TYPE_NOTION,
    )
    if not integration:
        return {"message": "Not connected"}

    db.delete(integration)
    db.commit()
    return {"message": "Notion disconnected"}
