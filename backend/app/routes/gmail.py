"""
Gmail integration routes
"""
import ipaddress
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from ..auth import (
    ensure_connector_project_access,
    get_current_user_required,
    try_connector_project_access,
)
from ..db import get_db
from ..models import (
    GmailIntegration,
    GmailIntegrationStatus,
    GmailProjectCredential,
    GmailSyncJob,
    GmailSyncJobStatus,
    Project,
    User,
)
from ..schemas import (
    GmailAuthUrlOut,
    GmailCredentialStatusOut,
    GmailCredentialUpsertRequest,
    GmailInboxDismissRequest,
    GmailInboxIndexRequest,
    GmailInboxIndexResultOut,
    GmailInboxPageOut,
    GmailIntegrationOut,
    GmailStagedMessageOut,
    GmailSyncJobOut,
)
from ..security_utils import decrypt_secret, encrypt_secret, safe_decrypt_secret
from ..services.audit_service import emit_audit
from ..settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gmail", tags=["Gmail"])

_GMAIL_OAUTH_REDIRECT_SUFFIXES = (
    "/gmail/auth/callback",
    "/connectors/gmail/auth/callback",
)
_REDIRECT_REJECT_DETAIL = (
    "Redirect URI cannot use a private LAN IP (e.g. 192.168.x.x): Google blocks that OAuth flow. "
    "Open the app at http://localhost:9091 and save "
    "http://localhost:9090/api/v1/gmail/auth/callback, "
    "or use a public https URL (e.g. ngrok). Add the same URI in Google Cloud Console."
)


def _validate_gmail_oauth_redirect_uri(redirect_uri: str) -> None:
    """Raise if redirect_uri will be rejected by Google or cannot reach our callback."""
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
        if ip.is_loopback:
            pass
        elif ip.is_private or ip.is_link_local or ip.is_reserved:
            raise HTTPException(status_code=400, detail=_REDIRECT_REJECT_DETAIL)
    except ValueError:
        pass

    path = (parsed.path or "").rstrip("/")
    if not any(path.endswith(suffix.rstrip("/")) for suffix in _GMAIL_OAUTH_REDIRECT_SUFFIXES):
        raise HTTPException(
            status_code=400,
            detail=(
                "Redirect URI path must end with /gmail/auth/callback "
                "or /connectors/gmail/auth/callback."
            ),
        )



def _resolve_oauth_credentials(db: Session, user_id: int, project_id: uuid.UUID) -> tuple[str, str, str]:
    cred = (
        db.query(GmailProjectCredential)
        .filter(
            GmailProjectCredential.user_id == user_id,
            GmailProjectCredential.project_id == project_id,
        )
        .first()
    )
    if cred:
        return cred.client_id, decrypt_secret(cred.client_secret_encrypted), cred.redirect_uri

    if settings.google_client_id and settings.google_client_secret:
        return settings.google_client_id, settings.google_client_secret, settings.google_redirect_uri

    raise HTTPException(status_code=400, detail="Gmail OAuth credentials are not configured for this project")


def _run_sync_job(integration_id: str, sync_job_id: str):
    """Run email sync in background thread."""
    from ..db import SessionLocal
    from ..services import gmail_service

    db: Session = SessionLocal()
    try:
        integration = db.query(GmailIntegration).filter(GmailIntegration.id == uuid.UUID(integration_id)).first()
        sync_job = db.query(GmailSyncJob).filter(GmailSyncJob.id == uuid.UUID(sync_job_id)).first()

        if not integration or not sync_job:
            return

        sync_job.status = GmailSyncJobStatus.RUNNING
        sync_job.started_at = datetime.now(timezone.utc)
        db.commit()

        errors = []
        emails_fetched = 0
        emails_indexed = 0
        catastrophic = False

        try:
            client_id, client_secret, _ = _resolve_oauth_credentials(
                db=db,
                user_id=integration.user_id,
                project_id=integration.project_id,
            )
            parsed_emails, new_history_id = gmail_service.fetch_emails(
                access_token=safe_decrypt_secret(integration.access_token),
                refresh_token=safe_decrypt_secret(integration.refresh_token),
                client_id=client_id,
                client_secret=client_secret,
                max_results=integration.max_emails_per_sync,
                last_history_id=integration.last_history_id,
            )
            emails_fetched = len(parsed_emails)

            _, staging_errors = gmail_service.upsert_staged_from_parsed_list(
                db,
                integration.id,
                integration.project_id,
                parsed_emails,
            )
            errors.extend(staging_errors)

            # Update integration state (indexing happens only when user confirms from inbox)
            integration.last_sync_at = datetime.now(timezone.utc)
            if new_history_id:
                integration.last_history_id = new_history_id
            if integration.status == GmailIntegrationStatus.ERROR:
                integration.status = GmailIntegrationStatus.ACTIVE

        except Exception as exc:
            catastrophic = True
            errors.append({"error": str(exc)})
            integration.status = GmailIntegrationStatus.ERROR
            logger.error(f"Gmail sync failed for integration {integration_id}: {exc}")

        sync_job.status = GmailSyncJobStatus.FAILED if catastrophic else GmailSyncJobStatus.COMPLETED
        sync_job.emails_fetched = emails_fetched
        sync_job.emails_indexed = emails_indexed
        sync_job.errors = errors
        sync_job.finished_at = datetime.now(timezone.utc)
        db.commit()

        if sync_job.status == GmailSyncJobStatus.FAILED:
            emit_audit(
                event_type="integration.gmail.sync.failed",
                user_id=integration.user_id,
                project_id=integration.project_id,
                resource_type="gmail_sync_job",
                resource_id=str(sync_job.id),
                status="failure",
                summary=f"Gmail sync failed for {integration.email_address}",
                details={"errors": errors[:5] if errors else None},
            )

        logger.info(
            f"Gmail sync {sync_job_id}: fetched={emails_fetched} indexed={emails_indexed} errors={len(errors)}"
        )

    except Exception as exc:
        logger.error(f"Unhandled error in gmail sync thread: {exc}")
        try:
            sync_job = db.query(GmailSyncJob).filter(GmailSyncJob.id == uuid.UUID(sync_job_id)).first()
            if sync_job:
                sync_job.status = GmailSyncJobStatus.FAILED
                sync_job.errors = [{"error": str(exc)}]
                sync_job.finished_at = datetime.now(timezone.utc)
                db.commit()
                integration = db.query(GmailIntegration).filter(
                    GmailIntegration.id == uuid.UUID(integration_id)
                ).first()
                if integration:
                    emit_audit(
                        event_type="integration.gmail.sync.failed",
                        user_id=integration.user_id,
                        project_id=integration.project_id,
                        resource_type="gmail_sync_job",
                        resource_id=str(sync_job.id),
                        status="failure",
                        summary=f"Gmail sync failed for {integration.email_address}",
                        details={"error": str(exc)},
                    )
        except Exception:
            pass
    finally:
        db.close()


@router.get("/auth/url", response_model=GmailAuthUrlOut)
def get_auth_url(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Return Google OAuth2 URL for Gmail authorization."""
    ensure_connector_project_access(db, current_user, project_id)
    client_id, client_secret, redirect_uri = _resolve_oauth_credentials(db, current_user.id, project_id)
    _validate_gmail_oauth_redirect_uri(redirect_uri)

    try:
        from ..services import gmail_service
        auth_url = gmail_service.get_auth_url(
            project_id=str(project_id),
            user_id=current_user.id,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )
        return GmailAuthUrlOut(auth_url=auth_url)
    except ImportError:
        raise HTTPException(status_code=503, detail="Gmail dependencies not installed. Run: pip install google-api-python-client google-auth-oauthlib")


@router.get("/auth/callback")
def auth_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Handle Google OAuth2 callback, save tokens, redirect to frontend."""
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    from ..services import gmail_service

    state_data = gmail_service.parse_oauth_state(state, expected_provider="gmail")
    project_id = state_data.get("project_id")
    user_id = state_data.get("user_id")

    if not project_id or not user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    try:
        client_id, client_secret, redirect_uri = _resolve_oauth_credentials(
            db=db,
            user_id=int(user_id),
            project_id=uuid.UUID(project_id),
        )
        tokens = gmail_service.exchange_code_for_tokens(
            code,
            redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
            state=state,
        )
        email_address = gmail_service.get_gmail_user_email(tokens["access_token"])
    except Exception as exc:
        logger.error(f"Token exchange failed: {exc}")
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {exc}")

    # Upsert integration
    existing = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == user_id,
            GmailIntegration.project_id == uuid.UUID(project_id),
        )
        .first()
    )

    if existing:
        existing.access_token = encrypt_secret(tokens["access_token"])
        existing.refresh_token = encrypt_secret(tokens["refresh_token"]) if tokens["refresh_token"] else existing.refresh_token
        existing.token_expiry = tokens["token_expiry"]
        existing.email_address = email_address
        existing.status = GmailIntegrationStatus.ACTIVE
        existing.is_active = True
        db.commit()
    else:
        integration = GmailIntegration(
            user_id=user_id,
            project_id=uuid.UUID(project_id),
            email_address=email_address,
            access_token=encrypt_secret(tokens["access_token"]),
            refresh_token=encrypt_secret(tokens["refresh_token"]) if tokens["refresh_token"] else "",
            token_expiry=tokens["token_expiry"],
        )
        db.add(integration)
        db.commit()

    emit_audit(
        event_type="integration.gmail.connected",
        request=request,
        user_id=int(user_id),
        project_id=uuid.UUID(project_id),
        resource_type="gmail_integration",
        summary=f"Gmail connected: {email_address}",
        details={"email_address": email_address},
    )

    return HTMLResponse(content="""<!DOCTYPE html>
<html>
<head><title>Gmail Connected</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <p>Gmail connected! Closing...</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'gmail_connected' }, '*');
    }
    window.close();
  </script>
</body>
</html>""")


@router.post("/credentials", response_model=GmailCredentialStatusOut)
def upsert_credentials(
    payload: GmailCredentialUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Create or update per-project Google OAuth credentials for Gmail integration."""
    ensure_connector_project_access(db, current_user, payload.project_id)
    _validate_gmail_oauth_redirect_uri(payload.redirect_uri)

    existing = (
        db.query(GmailProjectCredential)
        .filter(
            GmailProjectCredential.user_id == current_user.id,
            GmailProjectCredential.project_id == payload.project_id,
        )
        .first()
    )

    encrypted_secret = encrypt_secret(payload.client_secret)
    if existing:
        existing.client_id = payload.client_id
        existing.client_secret_encrypted = encrypted_secret
        existing.redirect_uri = payload.redirect_uri
        db.commit()
        db.refresh(existing)
        return GmailCredentialStatusOut(
            configured=True,
            client_id=existing.client_id,
            redirect_uri=existing.redirect_uri,
            updated_at=existing.updated_at,
        )

    created = GmailProjectCredential(
        user_id=current_user.id,
        project_id=payload.project_id,
        client_id=payload.client_id,
        client_secret_encrypted=encrypted_secret,
        redirect_uri=payload.redirect_uri,
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return GmailCredentialStatusOut(
        configured=True,
        client_id=created.client_id,
        redirect_uri=created.redirect_uri,
        updated_at=created.updated_at,
    )


@router.get("/credentials/status", response_model=GmailCredentialStatusOut)
def credentials_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if not try_connector_project_access(db, current_user, project_id):
        return GmailCredentialStatusOut(configured=False)
    existing = (
        db.query(GmailProjectCredential)
        .filter(
            GmailProjectCredential.user_id == current_user.id,
            GmailProjectCredential.project_id == project_id,
        )
        .first()
    )
    if not existing:
        return GmailCredentialStatusOut(configured=False)
    return GmailCredentialStatusOut(
        configured=True,
        client_id=existing.client_id,
        redirect_uri=existing.redirect_uri,
        updated_at=existing.updated_at,
    )


@router.get("/status", response_model=Optional[GmailIntegrationOut])
def get_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Get Gmail integration status for a project."""
    if not try_connector_project_access(db, current_user, project_id):
        return None
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == project_id,
        )
        .first()
    )
    return integration


@router.post("/sync", response_model=GmailSyncJobOut)
def trigger_sync(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Manually trigger a Gmail sync."""
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == project_id,
            GmailIntegration.is_active == True,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found or inactive")

    sync_job = GmailSyncJob(integration_id=integration.id)
    db.add(sync_job)
    db.commit()
    db.refresh(sync_job)

    t = threading.Thread(
        target=_run_sync_job,
        args=(str(integration.id), str(sync_job.id)),
        daemon=True,
    )
    t.start()

    return sync_job


@router.post("/pause", response_model=GmailIntegrationOut)
def pause_integration(
    request: Request,
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Pause auto-sync for Gmail integration."""
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found")

    integration.status = GmailIntegrationStatus.PAUSED
    integration.is_active = False
    db.commit()
    db.refresh(integration)

    emit_audit(
        event_type="integration.gmail.paused",
        request=request,
        user_id=current_user.id,
        project_id=integration.project_id,
        resource_type="gmail_integration",
        resource_id=str(integration.id),
        summary=f"Gmail sync paused: {integration.email_address}",
    )

    return integration


@router.post("/resume", response_model=GmailIntegrationOut)
def resume_integration(
    request: Request,
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Resume auto-sync for Gmail integration."""
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found")

    integration.status = GmailIntegrationStatus.ACTIVE
    integration.is_active = True
    db.commit()
    db.refresh(integration)

    emit_audit(
        event_type="integration.gmail.resumed",
        request=request,
        user_id=current_user.id,
        project_id=integration.project_id,
        resource_type="gmail_integration",
        resource_id=str(integration.id),
        summary=f"Gmail sync resumed: {integration.email_address}",
    )

    return integration


@router.delete("/disconnect")
def disconnect(
    request: Request,
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Revoke tokens, delete integration and all indexed emails."""
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found")

    integration_id = integration.id
    integration_email = integration.email_address
    integration_project_id = integration.project_id

    from ..services import gmail_service

    gmail_service.revoke_token(safe_decrypt_secret(integration.access_token))

    deleted_docs = gmail_service.delete_integration_documents(
        integration_id=str(integration.id),
        project_id=str(project_id),
        db=db,
    )

    cred = (
        db.query(GmailProjectCredential)
        .filter(
            GmailProjectCredential.user_id == current_user.id,
            GmailProjectCredential.project_id == project_id,
        )
        .first()
    )
    if cred:
        db.delete(cred)

    db.delete(integration)
    db.commit()

    emit_audit(
        event_type="integration.gmail.disconnected",
        request=request,
        user_id=current_user.id,
        project_id=integration_project_id,
        resource_type="gmail_integration",
        resource_id=str(integration_id),
        summary=f"Gmail disconnected: {integration_email}",
    )

    return {"message": f"Gmail disconnected. {deleted_docs} emails removed."}


@router.get("/jobs", response_model=List[GmailSyncJobOut])
def list_jobs(
    project_id: uuid.UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """List Gmail sync job history."""
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        return []

    jobs = (
        db.query(GmailSyncJob)
        .filter(GmailSyncJob.integration_id == integration.id)
        .order_by(GmailSyncJob.queued_at.desc())
        .limit(limit)
        .all()
    )
    return jobs


@router.get("/inbox", response_model=GmailInboxPageOut)
def list_gmail_inbox(
    project_id: uuid.UUID = Query(...),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """List Gmail messages staged for review before indexing."""
    ensure_connector_project_access(db, current_user, project_id)
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found")

    from ..services import gmail_service

    total = gmail_service.count_staged_messages(db, integration.id)
    rows = gmail_service.list_staged_messages(db, integration.id, limit=limit, offset=offset)
    items: List[GmailStagedMessageOut] = []
    for r in rows:
        body = r.body_text or ""
        preview = body[:280] + ("..." if len(body) > 280 else "")
        items.append(
            GmailStagedMessageOut(
                id=r.id,
                gmail_message_id=r.gmail_message_id,
                thread_id=r.thread_id,
                subject=r.subject,
                sender=r.sender,
                date_raw=r.date_raw,
                preview=preview,
                staged_at=r.staged_at,
            )
        )
    return GmailInboxPageOut(total=total, items=items)


@router.post("/inbox/index", response_model=GmailInboxIndexResultOut)
def index_gmail_inbox_selection(
    payload: GmailInboxIndexRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Embed selected staged emails into the project knowledge base."""
    ensure_connector_project_access(db, current_user, payload.project_id)
    if not payload.staged_ids and not payload.all_inbox:
        raise HTTPException(status_code=400, detail="No staged messages selected")

    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == payload.project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found")

    from ..services import gmail_service

    staged_ids = (
        gmail_service.list_all_staged_message_ids(db, integration.id)
        if payload.all_inbox
        else payload.staged_ids
    )

    indexed, errors = gmail_service.index_staged_messages(
        db,
        integration.id,
        current_user.id,
        integration.project_id,
        staged_ids,
    )
    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == payload.project_id,
        )
        .first()
    )
    if integration:
        integration.emails_indexed += indexed
        db.commit()

    return GmailInboxIndexResultOut(indexed=indexed, errors=errors)


@router.post("/inbox/dismiss", response_model=dict)
def dismiss_gmail_inbox_selection(
    payload: GmailInboxDismissRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Remove staged messages without indexing."""
    ensure_connector_project_access(db, current_user, payload.project_id)
    if not payload.staged_ids and not payload.all_inbox:
        raise HTTPException(status_code=400, detail="No staged messages selected")

    integration = (
        db.query(GmailIntegration)
        .filter(
            GmailIntegration.user_id == current_user.id,
            GmailIntegration.project_id == payload.project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found")

    from ..services import gmail_service

    staged_ids = (
        gmail_service.list_all_staged_message_ids(db, integration.id)
        if payload.all_inbox
        else payload.staged_ids
    )
    removed = gmail_service.dismiss_staged_messages(db, integration.id, staged_ids)
    return {"removed": removed}


# Compatibility aliases for clients that use Drive-style OAuth paths (/connectors/gmail/*).
# Gmail integration logic remains at /api/v1/gmail/* (legacy).
compat_router = APIRouter(prefix="/api/v1/connectors/gmail", tags=["Gmail Connector Compatibility"])


@compat_router.get("/auth/callback")
def auth_callback_compat(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return auth_callback(request, code, state, error, db)


@compat_router.get("/auth/start", response_model=GmailAuthUrlOut)
def auth_start_compat(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    return get_auth_url(project_id, db, current_user)
