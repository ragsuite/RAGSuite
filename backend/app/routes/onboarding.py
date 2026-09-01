"""
Onboarding API routes - Setup wizard endpoints
"""
import uuid
import logging
import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..db import get_db
from ..auth import get_current_user_required
from ..models import (
    User,
    Project,
    CrawlSource,
    Settings,
    ChatbotSettings,
    Organization,
    OrganizationMember,
    InviteStatus,
)
from ..services.crawler import DEFAULT_CRAWL_SETTINGS, get_crawl_content_length_limit
from ..services.onboarding_gate import post_auth_redirect_path, user_needs_onboarding

logger = logging.getLogger(__name__)
from ..schemas import (
    OnboardingBranding, OnboardingProject, OnboardingDataSource,
    OnboardingTestQuery, OnboardingStatus, SuggestionResponse,
    ProjectOut, CrawlSourceOut, ChatMessageRequest
)

router = APIRouter(prefix="/api/v1/onboarding", tags=["Onboarding"])

# ---------------------------------------------------------------------------
# Onboarding state store — Redis-backed with in-memory fallback.
# TTL: 48 h (auto-cleans abandoned sessions across all workers).
# ---------------------------------------------------------------------------
import json

_ONBOARDING_TTL = 48 * 3600  # 48 hours
_onboarding_fallback: Dict[int, Dict[str, Any]] = {}  # used when Redis unavailable


def _redis_key(user_id: int) -> str:
    return f"onboarding:{user_id}"


def _ob_get(user_id: int) -> Dict[str, Any]:
    from ..services.redis_client import get_redis
    r = get_redis()
    if r:
        try:
            raw = r.get(_redis_key(user_id))
            return json.loads(raw) if raw else {}
        except Exception as exc:
            logger.warning("Redis read failed for onboarding:%s — %s", user_id, exc)
    return _onboarding_fallback.get(user_id, {})


def _ob_set(user_id: int, data: Dict[str, Any]) -> None:
    from ..services.redis_client import get_redis
    r = get_redis()
    if r:
        try:
            r.setex(_redis_key(user_id), _ONBOARDING_TTL, json.dumps(data))
            return
        except Exception as exc:
            logger.warning("Redis write failed for onboarding:%s — %s", user_id, exc)
    _onboarding_fallback[user_id] = data


def _ob_delete(user_id: int) -> None:
    from ..services.redis_client import get_redis
    r = get_redis()
    if r:
        try:
            r.delete(_redis_key(user_id))
        except Exception as exc:
            logger.warning("Redis delete failed for onboarding:%s — %s", user_id, exc)
    _onboarding_fallback.pop(user_id, None)


def _slugify_org_name(org_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (org_name or "").strip().lower()).strip("-")
    return slug[:100] or "default"


def _is_defaultish_org_name(value: Optional[str]) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"", "default organization", "default", "my organization"}


def _ensure_user_org_context(db: Session, user: User) -> Organization:
    """
    Ensure onboarding user has an organization and active membership.
    This keeps legacy accounts (created pre-org) compatible with org-scoped flows.
    """
    org: Optional[Organization] = None
    if user.org_id:
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        org = db.query(Organization).order_by(Organization.id.asc()).first()
    if not org:
        org = Organization(name="Default Organization", slug="default", registration_enabled=False)
        db.add(org)
        db.flush()

    if user.org_id != org.id:
        user.org_id = org.id

    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.org_id == org.id,
            OrganizationMember.user_id == user.id,
        )
        .first()
    )
    if not membership:
        db.add(
            OrganizationMember(
                org_id=org.id,
                user_id=user.id,
                role="org_admin" if user.is_admin else "member",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            )
        )
    elif not membership.is_active:
        membership.is_active = True
        membership.invite_status = InviteStatus.ACCEPTED

    db.flush()
    return org


def _load_persisted_branding(db: Session, user: User) -> Dict[str, Any]:
    """Read branding from Settings / Organization when Redis wizard cache is empty."""
    settings = db.query(Settings).filter(Settings.user_id == user.id).first()
    org_name = ""
    logo_data_url = None
    primary_color = None

    if settings:
        org_name = (settings.org_name or "").strip()
        logo_data_url = settings.logo_data_url
        primary_color = settings.primary_color

    if user.org_id and _is_defaultish_org_name(org_name):
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        if org and org.name and not _is_defaultish_org_name(org.name):
            org_name = org.name.strip()

    return {
        "org_name": org_name,
        "logo_data_url": logo_data_url,
        "primary_color": primary_color,
    }


def _merge_branding_payload(
    redis_branding: Optional[Dict[str, Any]],
    persisted: Dict[str, Any],
) -> Dict[str, Any]:
    """Redis wizard values win when set; otherwise fall back to persisted DB branding."""
    redis_branding = redis_branding or {}
    merged = dict(persisted)
    for key in ("org_name", "logo_data_url", "primary_color"):
        value = redis_branding.get(key)
        if value is not None and (key != "org_name" or str(value).strip()):
            merged[key] = value
    return merged


def _sync_branding_to_org_and_settings(
    db: Session,
    *,
    user: User,
    org: Organization,
    branding_data: Optional[Dict[str, Any]],
) -> None:
    """Persist onboarding branding into org/settings with safe default-name guards."""
    if not branding_data:
        return

    branding_org_name = (branding_data.get("org_name") or "").strip()
    if branding_org_name and user.org_id == org.id:
        if _is_defaultish_org_name(org.name) or (org.slug or "").strip().lower() in {"default", ""}:
            desired_slug = _slugify_org_name(branding_org_name)
            existing_slug = db.query(Organization).filter(
                Organization.slug == desired_slug,
                Organization.id != org.id,
            ).first()
            org.name = branding_org_name
            org.slug = f"{desired_slug}-{org.id}" if existing_slug else desired_slug

    existing_settings = db.query(Settings).filter(Settings.user_id == user.id).first()
    if existing_settings:
        if branding_org_name:
            existing_settings.org_name = branding_org_name
        existing_settings.logo_data_url = branding_data.get("logo_data_url")
        existing_settings.primary_color = branding_data.get("primary_color")
    else:
        db.add(
            Settings(
                user_id=user.id,
                org_name=branding_org_name or org.name or user.username or "My Organization",
                logo_data_url=branding_data.get("logo_data_url"),
                primary_color=branding_data.get("primary_color"),
            )
        )


@router.post("/branding", status_code=status.HTTP_200_OK)
async def save_branding(
    branding_data: OnboardingBranding,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Save branding configuration (Step 1).
    Persists to Postgres immediately and caches in Redis for wizard resume.
    """
    payload = {
        "org_name": branding_data.org_name,
        "logo_data_url": branding_data.logo_data_url,
        "primary_color": branding_data.primary_color,
    }
    data = _ob_get(current_user.id)
    data["branding"] = payload
    _ob_set(current_user.id, data)

    org = _ensure_user_org_context(db, current_user)
    _sync_branding_to_org_and_settings(
        db,
        user=current_user,
        org=org,
        branding_data=payload,
    )
    db.commit()
    logger.info("Stored onboarding branding for user %s (org=%s)", current_user.id, org.id)

    return {
        "message": "Branding saved",
        "org_name": branding_data.org_name,
        "primary_color": branding_data.primary_color,
        "logo_data_url": branding_data.logo_data_url,
        "has_logo": branding_data.logo_data_url is not None,
        "has_color": branding_data.primary_color is not None,
    }


@router.get("/branding", status_code=status.HTTP_200_OK)
async def get_branding(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Return onboarding branding (Redis cache merged with persisted Settings/Organization)."""
    data = _ob_get(current_user.id)
    branding = _merge_branding_payload(
        data.get("branding"),
        _load_persisted_branding(db, current_user),
    )
    return {
        "message": "Branding data retrieved",
        "org_name": branding.get("org_name", ""),
        "primary_color": branding.get("primary_color"),
        "logo_data_url": branding.get("logo_data_url"),
        "has_logo": branding.get("logo_data_url") is not None,
        "has_color": branding.get("primary_color") is not None,
    }


@router.post("/project", status_code=status.HTTP_200_OK)
async def save_onboarding_project(
    project_data: OnboardingProject,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Save project data during onboarding (Step 2) - Creates real project in DB immediately.
    Project is inactive until onboarding completes. This avoids embedding transfer bugs.
    """
    try:
        data = _ob_get(current_user.id)
        org = _ensure_user_org_context(db, current_user)
        _sync_branding_to_org_and_settings(
            db,
            user=current_user,
            org=org,
            branding_data=data.get("branding"),
        )

        # Cleanup any abandoned onboarding project from a previous attempt
        existing_onboarding = data.get("project", {})
        old_project_id = existing_onboarding.get("project_id")
        if old_project_id:
            old_project = db.query(Project).filter(
                Project.id == uuid.UUID(old_project_id),
                Project.owner_id == current_user.id,
                Project.is_active == False,
            ).first()
            if old_project:
                # Only delete if no crawl sources attached (safe to remove)
                source_count = db.query(CrawlSource).filter(
                    CrawlSource.project_id == old_project.id
                ).count()
                if source_count == 0:
                    db.delete(old_project)
                    db.commit()
                    logger.info(f"Deleted abandoned onboarding project {old_project_id} for user {current_user.id}")

        # Check for duplicate name among active projects
        existing = db.query(Project).filter(
            and_(
                Project.owner_id == current_user.id,
                Project.name == project_data.name,
                Project.is_active == True,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Project with name '{project_data.name}' already exists"
            )

        # Create real project immediately — inactive until onboarding completes
        project = Project(
            name=project_data.name,
            description=project_data.description,
            owner_id=current_user.id,
            org_id=current_user.org_id,
            is_active=False,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        data["project"] = {
            "name": project_data.name,
            "description": project_data.description,
            "project_id": str(project.id),
        }
        _ob_set(current_user.id, data)
        logger.info(f"Created onboarding project in DB for user {current_user.id}: {project.id}")

        return {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "owner_id": current_user.id,
            "is_active": False,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": None,
        }
    except HTTPException:
        raise
    except Exception as e:
        error_message = str(e)
        if "string_too_long" in error_message or "max_length" in error_message:
            if "name" in error_message:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Project name is too long. Please use a name with 255 characters or less."
                )
            elif "description" in error_message:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Project description is too long. Please use a description with 1000 characters or less."
                )
        logger.error(f"Error saving project data: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error saving project: {error_message}"
        )


@router.post("/data-source", status_code=status.HTTP_200_OK)
async def save_onboarding_data_source(
    data_source_data: OnboardingDataSource,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    background_tasks: BackgroundTasks = None
):
    """
    Save data source during onboarding (Step 3) - Creates temporary project and crawls website
    Crawls at depth 1 to get initial data, stores temporarily until onboarding completes
    """
    # Manual URL validation to provide friendly error message (QA fix)
    try:
        from pydantic import TypeAdapter, HttpUrl, ValidationError
        # Attempt to validate as HttpUrl
        TypeAdapter(HttpUrl).validate_python(data_source_data.base_url)
    except ValidationError:
        # Check if simply missing protocol
        if not data_source_data.base_url.startswith(('http://', 'https://')):
             try:
                 TypeAdapter(HttpUrl).validate_python(f"https://{data_source_data.base_url}")
                 # If valid with https, auto-correct it
                 data_source_data.base_url = f"https://{data_source_data.base_url}"
             except ValidationError:
                 raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please enter a valid URL (e.g., https://example.com)"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please enter a valid URL (e.g., https://example.com)"
            )

    try:
        # Check if project data exists
        onboarding_data = _ob_get(current_user.id)
        if "project" not in onboarding_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please complete project step first"
            )

        project_info = onboarding_data["project"]
        project_id = project_info.get("project_id")
        if not project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project not found. Please restart onboarding."
            )

        # Load real project created at Step 2
        project = db.query(Project).filter(
            Project.id == uuid.UUID(project_id),
            Project.owner_id == current_user.id,
        ).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Onboarding project not found. Please restart onboarding."
            )

        # Delete previous crawl source if user is re-submitting data source step
        existing_ds = onboarding_data.get("data_source", {})
        old_source_id = existing_ds.get("source_id")
        if old_source_id:
            old_source = db.query(CrawlSource).filter(
                CrawlSource.id == uuid.UUID(old_source_id),
                CrawlSource.project_id == project.id,
            ).first()
            if old_source:
                db.delete(old_source)
                db.commit()
                logger.info(f"Deleted previous onboarding crawl source {old_source_id}")

        # Create crawl source directly under the real project
        source = CrawlSource(
            name=f"Onboarding Source",
            base_url=str(data_source_data.base_url),
            cadence=data_source_data.cadence,
            headless=data_source_data.headless_mode,
            allowlist=[],
            denylist=[],
            description="Initial data source created during onboarding",
            created_by_id=current_user.id,
            project_id=project.id,
            depth=data_source_data.depth if data_source_data.depth is not None else DEFAULT_CRAWL_SETTINGS["depth"],
            max_pages=DEFAULT_CRAWL_SETTINGS["max_pages"],
            max_runtime_minutes=DEFAULT_CRAWL_SETTINGS["max_runtime_minutes"],
            max_links_per_page=DEFAULT_CRAWL_SETTINGS["max_links_per_page"],
            content_length_limit=get_crawl_content_length_limit(),
            delay_seconds=DEFAULT_CRAWL_SETTINGS["delay_seconds"],
        )

        db.add(source)
        db.commit()
        db.refresh(source)

        from ..services.crawl_orchestration import CrawlStartTrigger, start_crawl_for_source

        crawl_result = start_crawl_for_source(
            db,
            source.id,
            user_id=current_user.id,
            trigger=CrawlStartTrigger.ONBOARDING,
        )
        job_id = crawl_result.job_id

        logger.info(f"Started onboarding crawl job {job_id} for source {source.id} under project {project.id}")

        onboarding_data["data_source"] = {
            "base_url": str(data_source_data.base_url),
            "depth": data_source_data.depth if data_source_data.depth is not None else 2,
            "cadence": data_source_data.cadence,
            "headless_mode": data_source_data.headless_mode,
            "source_id": str(source.id),
            "crawl_job_id": str(job_id),
        }
        _ob_set(current_user.id, onboarding_data)
        logger.info(f"Stored data source for user {current_user.id}: {data_source_data.base_url}")

        from datetime import datetime, timezone
        return {
            "success": True,
            "acknowledged": True,
            "crawl_started": True,
            "crawl_status": "RUNNING",
            "message": "Crawl started successfully. Please stay on this page while crawling is in progress.",
            "id": str(source.id),
            "name": f"Onboarding Source - {data_source_data.base_url}",
            "base_url": str(data_source_data.base_url),
            "depth": data_source_data.depth if data_source_data.depth is not None else DEFAULT_CRAWL_SETTINGS["depth"],
            "cadence": data_source_data.cadence,
            "headless_mode": data_source_data.headless_mode,
            "allowlist": [],
            "denylist": [],
            "description": "Initial data source created during onboarding",
            "status": "RUNNING",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.username,
            "last_crawl_at": None,
            "documents_count": 0,
            "max_pages": DEFAULT_CRAWL_SETTINGS["max_pages"],
            "max_runtime_minutes": DEFAULT_CRAWL_SETTINGS["max_runtime_minutes"],
            "max_links_per_page": DEFAULT_CRAWL_SETTINGS["max_links_per_page"],
            "content_length_limit": get_crawl_content_length_limit(),
            "delay_seconds": DEFAULT_CRAWL_SETTINGS["delay_seconds"],
            "crawl_job_id": str(job_id),
            "can_proceed": False,
            "poll_status_endpoint": "/api/v1/onboarding/data-source",
            "crawl_status_endpoint": "/api/v1/onboarding/crawl-status"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error storing data source: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid data source data: {str(e)}"
        )


@router.post("/test-query", status_code=status.HTTP_200_OK)
async def test_onboarding_query(
    test_data: OnboardingTestQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Test RAG system during onboarding (Step 4) - Actually queries embedded data
    Uses temporary project if available, or active project if onboarding completed
    """
    import asyncio
    import functools
    
    # Check if we have temporary project data
    onboarding_data = _ob_get(current_user.id)
    
    # Determine which project_id to use
    project_id = None
    
    if "project" in onboarding_data:
        stored_pid = onboarding_data["project"].get("project_id")
        if stored_pid:
            project_id = stored_pid
            logger.info(f"Using onboarding project_id {project_id} for test query")
    
    # If no temp project, try to get active project
    if not project_id:
        from ..auth import get_active_project
        try:
            active_project = await get_active_project(db=db, current_user=current_user)
            if active_project:
                project_id = str(active_project.id)
                logger.info(f"Using active project_id {project_id} for onboarding test query")
        except Exception as e:
            logger.warning(f"Could not get active project: {e}")
    
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No project found. Please complete project and data source steps first."
        )
    
    # Store test query temporarily
    onboarding_data["test_query"] = test_data.query
    _ob_set(current_user.id, onboarding_data)
    
    # Resolve embedding model first so we check the correct ChromaDB collection
    from ..services.rag.rag import RAGPipeline
    from ..services.rag.embedder_factory import collection_name_for
    rag_pipeline = RAGPipeline()

    try:
        from ..services.rag.embedding_resolver import resolve_ingest_for_project as _resolve_emb_for_project
        _ob_emb_provider, _ob_emb_model, _ob_emb_api_key = _resolve_emb_for_project(
            db, project_id
        )
    except Exception:
        _ob_emb_provider = None
        _ob_emb_model = None
        _ob_emb_api_key = None

    _ob_collection = collection_name_for(project_id, _ob_emb_provider, _ob_emb_model)

    # Check if documents are embedded for this project (in the correct collection)
    doc_count = rag_pipeline.vdb.count(
        user_id=current_user.id,
        project_id=project_id,
        collection_name=_ob_collection,
    )

    if doc_count == 0:
        return {
            "success": False,
            "query": test_data.query,
            "answer": None,
            "message": "No documents embedded yet. Please wait for crawling and embedding to complete.",
            "documents_count": 0,
            "project_id": project_id
        }

    # Actually query the RAG system
    try:
        loop = asyncio.get_event_loop()

        query_fn = functools.partial(
            rag_pipeline.query,
            query=test_data.query,
            top_k=3,
            max_tokens=500,
            generate_topk=False,
            user_id=current_user.id,
            project_id=project_id,
            embedding_provider=_ob_emb_provider,
            embedding_model=_ob_emb_model,
            embedding_api_key=_ob_emb_api_key,
            collection_name=_ob_collection,
        )
        
        resp = await loop.run_in_executor(None, query_fn)
        answer = resp.get("summary", "")
        
        # Refine answer: Remove raw context markers
        if answer:
            # Simple refinement - remove citation markers
            import re
            answer = re.sub(r'\[source:\s*[^\]]+\]', '', answer)
            answer = re.sub(r'\(source:\s*[^\)]+\)', '', answer)
            answer = answer.strip()
        
        return {
            "success": True,
            "query": test_data.query,
            "answer": answer if answer else "I couldn't find a specific answer to your question in the embedded documents.",
            "documents_count": doc_count,
            "project_id": project_id
        }
    except Exception as e:
        logger.error(f"Error querying RAG system during onboarding: {e}", exc_info=True)
        return {
            "success": False,
            "query": test_data.query,
            "answer": None,
            "message": f"Error querying RAG system: {str(e)}",
            "documents_count": doc_count,
            "project_id": project_id
        }


@router.get("/status", response_model=OnboardingStatus)
async def get_onboarding_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get onboarding status for the current user
    Checks both temporary onboarding data and saved database data
    """
    completed_steps = []
    onboarding_data = _ob_get(current_user.id)
    
    # Check temporary onboarding data (steps 1–2; data source and test steps removed)
    if "branding" in onboarding_data:
        completed_steps.append("branding")
    if "project" in onboarding_data:
        completed_steps.append("project")

    # Current step: branding → project → ready to complete (stay on project)
    if "branding" not in onboarding_data:
        current_step = "branding"
    elif "project" not in onboarding_data:
        current_step = "project"
    else:
        current_step = "project"
    
    # Get project_id — real project saved at Step 2
    project_id = None
    stored_project_id = onboarding_data.get("project", {}).get("project_id")
    if stored_project_id:
        project_id = uuid.UUID(stored_project_id)
    else:
        active_project = db.query(Project).filter(
            and_(
                Project.owner_id == current_user.id,
                Project.is_active == True
            )
        ).first()
        if active_project:
            project_id = active_project.id
    
    needs = user_needs_onboarding(db, current_user.id)
    return OnboardingStatus(
        completed_steps=completed_steps,
        current_step=current_step,
        project_id=project_id,
        needs_onboarding=needs,
        redirect_to=post_auth_redirect_path(db, current_user.id),
    )


@router.get("/data-source", status_code=status.HTTP_200_OK)
async def get_onboarding_data_source(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get data source status during onboarding - allows frontend to stay on this step
    Returns data source information and crawl status
    """
    onboarding_data = _ob_get(current_user.id)
    data_source_data = onboarding_data.get("data_source", {})
    
    # If no data source data exists, return not started status
    if not data_source_data:
        return {
            "exists": False,
            "status": "NOT_STARTED",
            "message": "Data source not configured yet",
            "can_proceed": False
        }
    
    # Validate URL if it exists in data source - prevent crawling invalid URLs
    base_url = data_source_data.get("base_url")
    if base_url:
        from ..services.crawler import validate_url_reachable
        is_valid, error_msg = validate_url_reachable(base_url, timeout=10)
        if not is_valid:
            logger.warning(f"Invalid URL detected in GET endpoint: {base_url} - {error_msg}")
            return {
                "exists": True,
                "base_url": base_url,
                "status": "INVALID_URL",
                "pages_fetched": 0,
                "progress_percentage": 0.0,
                "can_proceed": False,
                "stop_polling": True,  # Stop polling when URL is invalid
                "message": f"Invalid or unreachable URL: {error_msg}. Please update the URL and try again.",
                "url_validation_error": error_msg
            }
    
    # Get crawl job ID
    crawl_job_id = data_source_data.get("crawl_job_id")
    source_id = data_source_data.get("source_id")

    # Base response with data source info
    response = {
        "exists": True,
        "base_url": data_source_data.get("base_url"),
        "headless_mode": data_source_data.get("headless_mode"),
        "source_id": str(source_id) if source_id else None,
        "crawl_job_id": str(crawl_job_id) if crawl_job_id else None,
        "status": "NOT_STARTED",
        "pages_fetched": 0,
        "progress_percentage": 0.0,
        "can_proceed": False,
        "stop_polling": False,
        "message": "Crawl not started yet"
    }
    
    # If no crawl job ID, return early
    if not crawl_job_id:
        return response
    
    # Get crawl job status
    try:
        from ..models import CrawlJob, CrawlJobStatus
        
        job = db.query(CrawlJob).filter(CrawlJob.id == uuid.UUID(crawl_job_id)).first()
        
        if not job:
            response.update({
                "status": "NOT_FOUND",
                "message": "Crawl job not found"
            })
            return response
        
        # Calculate progress
        progress_percentage = 0.0
        can_proceed = False
        
        # Determine stop_polling flag
        stop_polling = False
        url_error = None
        
        if job.status == CrawlJobStatus.COMPLETED:
            progress_percentage = 100.0
            can_proceed = True  # User can proceed when crawl is completed
            stop_polling = True  # Stop polling when completed
            response["message"] = "Crawl completed. You can proceed to the next step."
        elif job.status == CrawlJobStatus.RUNNING:
            max_pages = 100  # Onboarding crawl limit
            if max_pages > 0 and job.pages_fetched > 0:
                calculated_progress = (job.pages_fetched / max_pages) * 100.0
                progress_percentage = min(100.0, max(0.0, calculated_progress))
                if progress_percentage > 0 and progress_percentage < 1.0:
                    progress_percentage = 1.0
            can_proceed = False  # Still crawling, don't allow proceeding
            stop_polling = False  # Keep polling while running
            response["message"] = f"Crawling in progress... ({job.pages_fetched} pages fetched)"
        elif job.status == CrawlJobStatus.INDEXING:
            progress_percentage = 95.0
            can_proceed = False
            stop_polling = False
            response["message"] = "Indexing crawled content into search..."
        elif job.status == CrawlJobStatus.FAILED:
            # Check if failure was due to invalid URL
            error_messages = job.errors or []
            for error in error_messages:
                error_text = error.get("error", "") if isinstance(error, dict) else str(error)
                if "Invalid or unreachable URL" in error_text or "Cannot connect to URL" in error_text:
                    url_error = error_text
                    break
            
            if url_error:
                response["message"] = f"Crawl failed: {url_error}. Please update the URL and try again."
                response["url_validation_error"] = url_error
                can_proceed = False  # Don't allow proceeding if URL is invalid
                stop_polling = True  # Stop polling for invalid URLs
            else:
                can_proceed = True  # Allow proceeding if failed for other reasons
                stop_polling = True  # Stop polling when failed
                response["message"] = "Crawl failed. You can proceed or retry later."
        elif job.status == CrawlJobStatus.CANCELLED:
            can_proceed = True  # Allow proceeding if cancelled
            stop_polling = True  # Stop polling when cancelled
            response["message"] = "Crawl cancelled. You can proceed."
        elif job.status == CrawlJobStatus.PENDING:
            can_proceed = False
            stop_polling = False  # Keep polling while pending
            response["message"] = "Crawl job is queued. Waiting to start..."
        
        # Update response with crawl status
        response.update({
            "status": job.status.value if hasattr(job.status, 'value') else str(job.status),
            "pages_fetched": job.pages_fetched,
            "progress_percentage": progress_percentage,
            "errors": job.errors or [],
            "queued_at": job.queued_at.isoformat() if job.queued_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "can_proceed": can_proceed,
            "stop_polling": stop_polling  # Add stop_polling flag to tell frontend to stop polling
        })
        
        # Add URL error if present
        if url_error:
            response["url_validation_error"] = url_error
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting data source status: {e}", exc_info=True)
        response.update({
            "status": "ERROR",
            "message": f"Error checking crawl status: {str(e)}"
        })
        return response


@router.get("/crawl-status", status_code=status.HTTP_200_OK)
async def get_onboarding_crawl_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get crawl status during onboarding - allows user to stay on page while crawling
    (Legacy endpoint - use GET /data-source for comprehensive status)
    Validates URL and stops polling if URL is invalid
    """
    onboarding_data = _ob_get(current_user.id)
    data_source_data = onboarding_data.get("data_source", {})
    
    # Validate URL first - if invalid, return immediately to stop polling
    base_url = data_source_data.get("base_url")
    if base_url:
        from ..services.crawler import validate_url_reachable
        is_valid, error_msg = validate_url_reachable(base_url, timeout=10)
        if not is_valid:
            logger.warning(f"Invalid URL detected in crawl-status endpoint: {base_url} - {error_msg}")
            return {
                "status": "INVALID_URL",
                "pages_fetched": 0,
                "progress_percentage": 0.0,
                "can_proceed": False,
                "stop_polling": True,  # Signal frontend to stop polling
                "message": f"Invalid or unreachable URL: {error_msg}. Please update the URL and try again.",
                "url_validation_error": error_msg
            }
    
    crawl_job_id = data_source_data.get("crawl_job_id")
    
    if not crawl_job_id:
        return {
            "status": "NOT_STARTED",
            "pages_fetched": 0,
            "progress_percentage": 0.0,
            "can_proceed": False,
            "stop_polling": False,
            "message": "No crawl job found"
        }
    
    try:
        from ..models import CrawlJob, CrawlJobStatus
        
        job = db.query(CrawlJob).filter(CrawlJob.id == uuid.UUID(crawl_job_id)).first()
        
        if not job:
            return {
                "status": "NOT_FOUND",
                "pages_fetched": 0,
                "progress_percentage": 0.0,
                "can_proceed": False,
                "stop_polling": True,
                "message": "Crawl job not found"
            }
        
        # Calculate progress
        progress_percentage = 0.0
        can_proceed = False
        stop_polling = False
        status_message = ""
        
        if job.status == CrawlJobStatus.COMPLETED:
            progress_percentage = 100.0
            can_proceed = True
            stop_polling = True  # Stop polling when completed
            status_message = "Crawl completed. You can proceed to the next step."
        elif job.status == CrawlJobStatus.RUNNING:
            max_pages = 100  # Onboarding crawl limit
            if max_pages > 0 and job.pages_fetched > 0:
                calculated_progress = (job.pages_fetched / max_pages) * 100.0
                progress_percentage = min(100.0, max(0.0, calculated_progress))
                if progress_percentage > 0 and progress_percentage < 1.0:
                    progress_percentage = 1.0
            can_proceed = False
            stop_polling = False  # Keep polling while running
            status_message = f"Crawling in progress... ({job.pages_fetched} pages fetched)"
        elif job.status == CrawlJobStatus.INDEXING:
            progress_percentage = 95.0
            can_proceed = False
            stop_polling = False
            status_message = "Indexing crawled content into search..."
        elif job.status == CrawlJobStatus.FAILED:
            # Check if failure was due to invalid URL
            error_messages = job.errors or []
            url_error = None
            for error in error_messages:
                error_text = error.get("error", "") if isinstance(error, dict) else str(error)
                if "Invalid or unreachable URL" in error_text or "Cannot connect to URL" in error_text:
                    url_error = error_text
                    break
            
            if url_error:
                can_proceed = False  # Don't allow proceeding if URL is invalid
                stop_polling = True  # Stop polling for invalid URLs
                status_message = f"Crawl failed: {url_error}. Please update the URL and try again."
            else:
                can_proceed = True  # Allow proceeding if failed for other reasons
                stop_polling = True  # Stop polling when failed
                status_message = "Crawl failed. You can proceed or retry later."
        elif job.status == CrawlJobStatus.CANCELLED:
            can_proceed = True  # Allow proceeding if cancelled
        
        return {
            "status": job.status.value if hasattr(job.status, 'value') else str(job.status),
            "pages_fetched": job.pages_fetched,
            "progress_percentage": progress_percentage,
            "errors": job.errors or [],
            "queued_at": job.queued_at.isoformat() if job.queued_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "can_proceed": can_proceed,  # Frontend can enable "Next" button when True
            "message": "Crawl completed. You can proceed to the next step." if can_proceed else "Crawling in progress. Please wait..."
        }
    except Exception as e:
        logger.error(f"Error getting crawl status: {e}", exc_info=True)
        return {
            "status": "ERROR",
            "pages_fetched": 0,
            "progress_percentage": 0.0,
            "message": str(e)
        }


@router.get("/suggestions", response_model=SuggestionResponse)
async def get_onboarding_suggestions(
    project_id: Optional[uuid.UUID] = Query(None, description="Project ID to generate suggestions for (optional during onboarding)"),
    limit: int = Query(4, ge=1, le=10, description="Number of suggestions to generate"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Generate auto-generated query suggestions during onboarding
    Uses temporary project if available, otherwise uses active project
    This endpoint redirects to the main suggestions endpoint
    """
    # If no project_id provided, try to use temp project or active project
    if not project_id:
        # Check for temp project during onboarding
        onboarding_data = _ob_get(current_user.id)
        stored_pid = onboarding_data.get("project", {}).get("project_id")
        if stored_pid:
            project_id = uuid.UUID(stored_pid)
        else:
            # Use active project
            from ..auth import get_active_project
            try:
                active_project = await get_active_project(db=db, current_user=current_user)
                if active_project:
                    project_id = active_project.id
                else:
                    return SuggestionResponse(suggestions=[])
            except Exception:
                return SuggestionResponse(suggestions=[])
    
    # Verify project exists and belongs to user (or is temp project)
    project = db.query(Project).filter(
        and_(
            Project.id == project_id,
            Project.owner_id == current_user.id
        )
    ).first()
    
    if not project:
        # Return empty if project not found
        return SuggestionResponse(suggestions=[])
    
    try:
        from ..services.rag.rag import RAGPipeline
        from ..services.rag.embedding_resolver import resolve_ingest_for_project as _resolve_emb_for_project
        rag_pipeline = RAGPipeline()

        try:
            _sug_provider, _sug_model, _sug_api_key = _resolve_emb_for_project(
                db, project_id
            )
        except Exception:
            _sug_provider = None
            _sug_model = None
            _sug_api_key = None

        # Generate suggestions using LLM based on embedded documents
        # Pass user_id for proper filtering
        suggestions = rag_pipeline.generate_suggestions(
            project_id=str(project_id),
            user_id=current_user.id,
            limit=limit,
            embedding_provider=_sug_provider,
            embedding_model=_sug_model,
            embedding_api_key=_sug_api_key,
        )
        
        logger.info(f"Generated {len(suggestions)} suggestions for onboarding project {project_id}")
        
        # Return suggestions (empty list if no embeddings exist)
        return SuggestionResponse(suggestions=suggestions)
    except Exception as e:
        logger.error(f"Error generating suggestions for project {project_id}: {e}", exc_info=True)
        # Return empty list if no embeddings exist - no static questions
        return SuggestionResponse(suggestions=[])


@router.post("/complete", status_code=status.HTTP_201_CREATED)
async def complete_onboarding(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    background_tasks: BackgroundTasks = None
):
    """
    Complete onboarding - Saves all temporary data to database.
    Required: project (branding optional). Data source and test steps were removed from the wizard.
    """
    onboarding_data = _ob_get(current_user.id)
    
    if not onboarding_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No onboarding data found. Please complete all steps first."
        )
    
    # Validate required steps (data_source is optional — user may have skipped Step 3)
    required_steps = ["project"]
    missing_steps = [step for step in required_steps if step not in onboarding_data]
    if missing_steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required steps: {', '.join(missing_steps)}"
        )
    
    try:
        org = _ensure_user_org_context(db, current_user)

        # Step 1: Load the real project already created at Step 2
        project_info = onboarding_data["project"]
        project_id_str = project_info.get("project_id")
        if not project_id_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project not found. Please restart onboarding."
            )

        project = db.query(Project).filter(
            Project.id == uuid.UUID(project_id_str),
            Project.owner_id == current_user.id,
        ).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Onboarding project not found. Please restart onboarding."
            )

        if project.org_id != current_user.org_id:
            project.org_id = current_user.org_id

        # Deactivate all other projects, activate this one
        db.query(Project).filter(
            Project.owner_id == current_user.id,
            Project.id != project.id,
        ).update({"is_active": False})
        project.is_active = True
        db.commit()
        db.refresh(project)

        logger.info(f"Activated onboarding project '{project.name}' (ID: {project.id}) for user {current_user.id}")

        # Step 2: Load crawl source if user didn't skip Step 3
        source = None
        data_source_data = onboarding_data.get("data_source", {})
        source_id_str = data_source_data.get("source_id")
        if source_id_str:
            source = db.query(CrawlSource).filter(
                CrawlSource.id == uuid.UUID(source_id_str),
                CrawlSource.project_id == project.id,
            ).first()
            if source:
                logger.info(f"Using onboarding crawl source '{source.name}' (ID: {source.id}) for project {project.id}")
            else:
                logger.warning(f"Crawl source {source_id_str} not found — proceeding without source")

        # Step 3: Save branding/org data from onboarding Step 1
        branding_data = onboarding_data.get("branding")
        _sync_branding_to_org_and_settings(
            db,
            user=current_user,
            org=org,
            branding_data=branding_data,
        )
        if branding_data:
            logger.info(f"Synchronized onboarding branding for user {current_user.id}")
        else:
            logger.info(f"No branding data found for user {current_user.id} - skipping branding sync")

        # Step 3b: Seed default chatbot settings so first visit shows the correct title
        existing_chatbot = db.query(ChatbotSettings).filter(
            and_(
                ChatbotSettings.user_id == current_user.id,
                ChatbotSettings.project_id == project.id,
            )
        ).first()
        if not existing_chatbot:
            db.add(ChatbotSettings(
                user_id=current_user.id,
                project_id=project.id,
                chatbot_title="RAGSuite",
                welcome_message="Hi, how can I help you?",
                chatbot_language="en",
                feedback_enabled=True,
            ))
            db.commit()
            logger.info(f"Created default chatbot settings for user {current_user.id}, project {project.id}")
        
        # Step 4: Mark onboarding complete
        from datetime import datetime, timezone

        current_user.onboarding_completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(project)
        db.refresh(current_user)

        # Clear temporary onboarding data
        _ob_delete(current_user.id)

        # Get settings for response
        user_settings = db.query(Settings).filter(Settings.user_id == current_user.id).first()
        settings_data = None
        if user_settings:
            settings_data = {
                "org_name": user_settings.org_name,
                "logo_data_url": user_settings.logo_data_url,
                "primary_color": user_settings.primary_color
            }

        doc_count = source.documents_count or 0 if source else 0
        return {
            "success": True,
            "message": "Onboarding completed successfully.",
            "project": {
                "id": str(project.id),
                "name": project.name,
                "description": project.description,
                "is_active": project.is_active,
                "created_at": project.created_at.isoformat() if project.created_at else None
            },
            "data_source": {
                "id": str(source.id),
                "name": source.name,
                "base_url": source.base_url,
                "status": source.status.value if hasattr(source.status, 'value') else str(source.status),
                "documents_count": doc_count
            } if source else None,
            "settings": settings_data,
            "next_steps": f"Your project '{project.name}' is ready!" if doc_count > 0 else "Your project is set up. Add a data source from the dashboard to start searching."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        user_id = getattr(current_user, "id", None)
        try:
            db.rollback()
        except Exception:
            pass
        logger.error(f"Error completing onboarding for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete onboarding: {str(e)}"
        )

