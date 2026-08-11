"""
ClickUp integration routes
"""
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..auth import get_current_user_required
from ..db import get_db
from ..models import (
    ClickUpIntegration,
    ClickUpIntegrationStatus,
    ClickUpSyncJob,
    ClickUpSyncJobStatus,
    User,
)
from ..schemas import (
    ClickUpAuthUrlOut,
    ClickUpIntegrationOut,
    ClickUpSyncJobOut,
)
from ..settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/clickup", tags=["ClickUp"])


def _run_sync_job(integration_id: str, sync_job_id: str) -> None:
    """Run full ClickUp sync in a background thread."""
    from ..db import SessionLocal
    from ..services import clickup_service

    db: Session = SessionLocal()
    try:
        integration = db.query(ClickUpIntegration).filter(
            ClickUpIntegration.id == uuid.UUID(integration_id)
        ).first()
        sync_job = db.query(ClickUpSyncJob).filter(
            ClickUpSyncJob.id == uuid.UUID(sync_job_id)
        ).first()

        if not integration or not sync_job:
            return

        sync_job.status = ClickUpSyncJobStatus.RUNNING
        sync_job.started_at = datetime.now(timezone.utc)
        db.commit()

        errors = []
        tasks_fetched = tasks_indexed = 0
        docs_fetched = docs_indexed = 0
        chats_fetched = chats_indexed = 0
        token = integration.access_token
        workspace_id = integration.workspace_id
        workspace_name = integration.workspace_name

        # --- Tasks ---
        if integration.sync_tasks:
            try:
                tasks = clickup_service.fetch_tasks(
                    token, workspace_id, last_updated_at=integration.last_task_updated_at
                )
                tasks_fetched = len(tasks)
                for task in tasks:
                    try:
                        doc_id = clickup_service.ingest_task(
                            task=task,
                            workspace_name=workspace_name,
                            token=token,
                            user_id=integration.user_id,
                            project_id=str(integration.project_id),
                            db=db,
                        )
                        if doc_id:
                            tasks_indexed += 1
                    except Exception as exc:
                        errors.append({"type": "task", "id": task.get("id"), "error": str(exc)})
            except Exception as exc:
                errors.append({"type": "tasks_fetch", "error": str(exc)})
                logger.error(f"ClickUp task fetch failed: {exc}")

        # --- Docs ---
        if integration.sync_docs:
            try:
                docs = clickup_service.fetch_docs(token, workspace_id)
                docs_fetched = len(docs)
                for doc in docs:
                    try:
                        doc_id = clickup_service.ingest_doc(
                            doc=doc,
                            workspace_name=workspace_name,
                            user_id=integration.user_id,
                            project_id=str(integration.project_id),
                            db=db,
                        )
                        if doc_id:
                            docs_indexed += 1
                    except Exception as exc:
                        errors.append({"type": "doc", "id": doc.get("id"), "error": str(exc)})
            except Exception as exc:
                errors.append({"type": "docs_fetch", "error": str(exc)})
                logger.error(f"ClickUp docs fetch failed: {exc}")

        # --- Chats ---
        if integration.sync_chats:
            try:
                spaces = clickup_service.fetch_spaces(token, workspace_id)
                for space in spaces:
                    try:
                        views = clickup_service.fetch_chat_views(token, space["id"])
                        for view in views:
                            try:
                                messages = clickup_service.fetch_chat_messages(token, view["id"])
                                chats_fetched += len(messages)
                                doc_id = clickup_service.ingest_chat_channel(
                                    view=view,
                                    messages=messages,
                                    workspace_name=workspace_name,
                                    user_id=integration.user_id,
                                    project_id=str(integration.project_id),
                                    db=db,
                                )
                                if doc_id:
                                    chats_indexed += 1
                            except Exception as exc:
                                errors.append({"type": "chat_view", "id": view.get("id"), "error": str(exc)})
                    except Exception as exc:
                        errors.append({"type": "space_views", "id": space.get("id"), "error": str(exc)})
            except Exception as exc:
                errors.append({"type": "chats_fetch", "error": str(exc)})
                logger.error(f"ClickUp chat fetch failed: {exc}")

        # Update integration state
        now = datetime.now(timezone.utc)
        integration.last_sync_at = now
        integration.last_task_updated_at = now
        total_indexed = tasks_indexed + docs_indexed + chats_indexed
        integration.items_indexed += total_indexed
        if integration.status == ClickUpIntegrationStatus.ERROR:
            integration.status = ClickUpIntegrationStatus.ACTIVE

        sync_job.tasks_fetched = tasks_fetched
        sync_job.tasks_indexed = tasks_indexed
        sync_job.docs_fetched = docs_fetched
        sync_job.docs_indexed = docs_indexed
        sync_job.chats_fetched = chats_fetched
        sync_job.chats_indexed = chats_indexed
        sync_job.errors = errors
        sync_job.finished_at = now
        sync_job.status = (
            ClickUpSyncJobStatus.FAILED
            if errors and total_indexed == 0
            else ClickUpSyncJobStatus.COMPLETED
        )
        db.commit()

    except Exception as exc:
        logger.error(f"ClickUp sync job {sync_job_id} crashed: {exc}")
        try:
            sync_job = db.query(ClickUpSyncJob).filter(
                ClickUpSyncJob.id == uuid.UUID(sync_job_id)
            ).first()
            if sync_job:
                sync_job.status = ClickUpSyncJobStatus.FAILED
                sync_job.errors = [{"error": str(exc)}]
                sync_job.finished_at = datetime.now(timezone.utc)
            integration = db.query(ClickUpIntegration).filter(
                ClickUpIntegration.id == uuid.UUID(integration_id)
            ).first()
            if integration:
                integration.status = ClickUpIntegrationStatus.ERROR
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/auth/url", response_model=ClickUpAuthUrlOut)
def get_auth_url(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user_required),
):
    """Return ClickUp OAuth URL."""
    if not settings.clickup_client_id or not settings.clickup_client_secret:
        raise HTTPException(
            status_code=503,
            detail="ClickUp OAuth not configured. Set CLICKUP_CLIENT_ID and CLICKUP_CLIENT_SECRET.",
        )
    from ..services import clickup_service
    auth_url = clickup_service.get_auth_url(project_id=str(project_id), user_id=current_user.id)
    return ClickUpAuthUrlOut(auth_url=auth_url)


@router.get("/auth/callback")
def auth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Handle ClickUp OAuth callback, save token, redirect to frontend."""
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    from ..services import clickup_service

    try:
        state_data = clickup_service.parse_oauth_state(state, expected_provider="clickup")
        project_id = state_data.get("project_id")
        user_id = state_data.get("user_id")
    except HTTPException:
        raise

    if not project_id or not user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    try:
        token = clickup_service.exchange_code_for_token(code)
        workspace = clickup_service.get_workspace(token)
    except Exception as exc:
        logger.error(f"ClickUp token exchange failed: {exc}")
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {exc}")

    existing = (
        db.query(ClickUpIntegration)
        .filter(
            ClickUpIntegration.user_id == user_id,
            ClickUpIntegration.project_id == uuid.UUID(project_id),
        )
        .first()
    )

    if existing:
        existing.access_token = token
        existing.workspace_id = workspace["id"]
        existing.workspace_name = workspace["name"]
        existing.status = ClickUpIntegrationStatus.ACTIVE
        existing.is_active = True
        db.commit()
    else:
        integration = ClickUpIntegration(
            user_id=user_id,
            project_id=uuid.UUID(project_id),
            workspace_id=workspace["id"],
            workspace_name=workspace["name"],
            access_token=token,
        )
        db.add(integration)
        db.commit()

    frontend_url = settings.frontend_base_url.rstrip("/")
    return RedirectResponse(url=f"{frontend_url}/settings?clickup=connected")


@router.get("/status", response_model=Optional[ClickUpIntegrationOut])
def get_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Get ClickUp integration status for a project."""
    return (
        db.query(ClickUpIntegration)
        .filter(
            ClickUpIntegration.user_id == current_user.id,
            ClickUpIntegration.project_id == project_id,
        )
        .first()
    )


@router.post("/sync", response_model=ClickUpSyncJobOut)
def trigger_sync(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Manually trigger a ClickUp sync."""
    integration = (
        db.query(ClickUpIntegration)
        .filter(
            ClickUpIntegration.user_id == current_user.id,
            ClickUpIntegration.project_id == project_id,
            ClickUpIntegration.is_active == True,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="ClickUp integration not found or inactive")

    sync_job = ClickUpSyncJob(integration_id=integration.id)
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


@router.post("/pause", response_model=ClickUpIntegrationOut)
def pause_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Pause auto-sync for ClickUp integration."""
    integration = (
        db.query(ClickUpIntegration)
        .filter(
            ClickUpIntegration.user_id == current_user.id,
            ClickUpIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="ClickUp integration not found")

    integration.status = ClickUpIntegrationStatus.PAUSED
    integration.is_active = False
    db.commit()
    db.refresh(integration)
    return integration


@router.post("/resume", response_model=ClickUpIntegrationOut)
def resume_integration(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Resume auto-sync for ClickUp integration."""
    integration = (
        db.query(ClickUpIntegration)
        .filter(
            ClickUpIntegration.user_id == current_user.id,
            ClickUpIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="ClickUp integration not found")

    integration.status = ClickUpIntegrationStatus.ACTIVE
    integration.is_active = True
    db.commit()
    db.refresh(integration)
    return integration


@router.delete("/disconnect")
def disconnect(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Delete integration and all indexed ClickUp documents."""
    integration = (
        db.query(ClickUpIntegration)
        .filter(
            ClickUpIntegration.user_id == current_user.id,
            ClickUpIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="ClickUp integration not found")

    from ..services import clickup_service
    deleted_count = clickup_service.delete_integration_documents(
        project_id=str(project_id),
        db=db,
    )

    db.delete(integration)
    db.commit()

    return {"message": f"ClickUp disconnected. {deleted_count} documents removed."}


@router.get("/jobs", response_model=List[ClickUpSyncJobOut])
def list_jobs(
    project_id: uuid.UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """List ClickUp sync job history."""
    integration = (
        db.query(ClickUpIntegration)
        .filter(
            ClickUpIntegration.user_id == current_user.id,
            ClickUpIntegration.project_id == project_id,
        )
        .first()
    )
    if not integration:
        return []

    return (
        db.query(ClickUpSyncJob)
        .filter(ClickUpSyncJob.integration_id == integration.id)
        .order_by(ClickUpSyncJob.queued_at.desc())
        .limit(limit)
        .all()
    )
