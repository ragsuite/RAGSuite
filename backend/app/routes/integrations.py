"""
Integration routes for per-user embed/publicId configuration.
Provides simple GET/POST endpoints scoped to the current authenticated user.
"""

import logging
import secrets
import uuid
from datetime import datetime
from typing import Any, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..auth import get_current_user_required, get_active_project
from ..models import IntegrationEmbed, User, Project
from ..services.notification_service import create_notification
from ..services.audit_service import emit_audit
from ..schemas import (
    IntegrationEmbedConfigIn,
    IntegrationEmbedConfigOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations", tags=["Integrations"])


def _generate_default_public_id() -> str:
    """Generate a simple default publicId similar to docs-widget-xxxxxx."""
    suffix = uuid.uuid4().hex[:6]
    return f"docs-widget-{suffix}"


def _normalize_domain_value(domain: Any) -> Optional[str]:
    """
    Normalize domain input from either a raw string or frontend domain object.
    """
    if isinstance(domain, str):
        value = domain.strip()
        return value or None

    if isinstance(domain, dict):
        # Prefer normalizedUrl if available, then hostname fallback.
        normalized_url = domain.get("normalizedUrl")
        if isinstance(normalized_url, str) and normalized_url.strip():
            return normalized_url.strip()
        hostname = domain.get("hostname")
        if isinstance(hostname, str) and hostname.strip():
            return hostname.strip()

    return None


def _normalize_domain_list(domains: list[Any]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for entry in domains or []:
        value = _normalize_domain_value(entry)
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _normalize_domain_for_compare(domain: str) -> str:
    """Normalize incoming URL/domain for strict hostname comparison."""
    if not domain:
        return ""
    value = str(domain).strip().lower()
    # Accept full URL or raw host.
    parsed = urlparse(value if "://" in value else f"http://{value}")
    host = (parsed.hostname or value).strip().lower()
    if host.startswith("www."):
        host = host[4:]
    return host


class IntegrationMatchRequest(BaseModel):
    project_id: str = Field(..., description="Single project UUID string")
    url: str = Field(..., description="Current page URL")
    widget_type: Literal["chatbot", "search", "both"] = Field(default="chatbot")


class IntegrationMatchItem(BaseModel):
    project_id: str
    allowed: bool
    widget_type: Literal["chatbot", "search", "both"]
    reason: Optional[str] = None


class IntegrationMatchResponse(BaseModel):
    matches: list[IntegrationMatchItem]


@router.post("/match", response_model=IntegrationMatchResponse)
async def match_integration_projects(
    payload: IntegrationMatchRequest,
    db: Session = Depends(get_db),
):
    """
    Public endpoint used by embed init script.
    Returns whether each project is allowed for the current page domain and widget type.
    """
    project_id = str(payload.project_id or "").strip()
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="project_id is required",
        )

    request_domain = _normalize_domain_for_compare(payload.url)
    if not request_domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to determine request domain from URL",
        )

    try:
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        return IntegrationMatchResponse(
            matches=[
                IntegrationMatchItem(
                    project_id=project_id,
                    allowed=False,
                    widget_type=payload.widget_type,
                    reason="not_allowed",
                )
            ]
        )

    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        return IntegrationMatchResponse(
            matches=[
                IntegrationMatchItem(
                    project_id=project_id,
                    allowed=False,
                    widget_type=payload.widget_type,
                    reason="not_allowed",
                )
            ]
        )

    config = (
        db.query(IntegrationEmbed)
        .filter(IntegrationEmbed.user_id == project.owner_id)
        .first()
    )
    keys_data = config.keys if (config and isinstance(config.keys, dict)) else {}

    fallback_domains = keys_data.get("domains", []) or []
    chatbot_domains = keys_data.get("chatbot_domains", []) or []
    search_domains = keys_data.get("search_domains", []) or []
    normalized_fallback = {_normalize_domain_for_compare(d) for d in fallback_domains}
    normalized_chatbot = {_normalize_domain_for_compare(d) for d in chatbot_domains}
    normalized_search = {_normalize_domain_for_compare(d) for d in search_domains}

    # Backward compatibility: if specific widget domain list is empty, use legacy domains.
    if payload.widget_type == "chatbot":
        allowed_set = normalized_chatbot or normalized_fallback
        resolved_type: Literal["chatbot", "search", "both"] = "chatbot"
    elif payload.widget_type == "search":
        allowed_set = normalized_search or normalized_fallback
        resolved_type = "search"
    else:
        allowed_set = normalized_chatbot | normalized_search | normalized_fallback
        resolved_type = "both"

    allowed = request_domain in {d for d in allowed_set if d}
    matches: list[IntegrationMatchItem] = [
        IntegrationMatchItem(
            project_id=project_id,
            allowed=allowed,
            widget_type=resolved_type,
            reason=None if allowed else "not_allowed",
        )
    ]

    logger.info(
        "Integration match: domain=%s widget_type=%s total=%d allowed=%d",
        request_domain,
        payload.widget_type,
        len(matches),
        sum(1 for m in matches if m.allowed),
    )
    return IntegrationMatchResponse(matches=matches)


@router.get("/embed", response_model=IntegrationEmbedConfigOut)
async def get_embed_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Get the current user's embed configuration (publicId + keys).
    If none exists yet, create a default record with a generated publicId and no keys.
    """
    try:
        config: Optional[IntegrationEmbed] = (
            db.query(IntegrationEmbed)
            .filter(IntegrationEmbed.user_id == current_user.id)
            .first()
        )

        if not config:
            # Create a default config for this user
            public_id = _generate_default_public_id()
            config = IntegrationEmbed(
                user_id=current_user.id,
                public_id=public_id,
                keys={},
                embed_secret=secrets.token_hex(32),
            )
            db.add(config)
            db.commit()
            db.refresh(config)
            logger.info(
                "Created default embed config for user %s with public_id=%s",
                current_user.id,
                public_id,
            )
        elif not config.embed_secret:
            # Backfill secret for existing configs
            config.embed_secret = secrets.token_hex(32)
            db.commit()
            db.refresh(config)

        # Ensure keys is always a dict with "keys" list so it matches the Pydantic schema
        raw_keys = config.keys or {}
        if isinstance(raw_keys, list):
            # Backwards compatibility if we ever stored list directly
            normalized_keys = {"keys": raw_keys}
        else:
            normalized_keys = raw_keys

        # The Pydantic model expects a list, not a wrapper object
        keys_list = normalized_keys.get("keys", [])
        # Support both old format (domains) and new format (chatbot_domains, search_domains)
        domains_list = normalized_keys.get("domains", [])  # Deprecated, for backward compatibility
        chatbot_domains_list = normalized_keys.get("chatbot_domains", [])
        search_domains_list = normalized_keys.get("search_domains", [])

        # Get active project to include embed token for it
        from ..auth import generate_embed_token
        from ..models import Project as ProjectModel
        active_project = db.query(ProjectModel).filter(
            ProjectModel.owner_id == current_user.id,
            ProjectModel.is_active == True
        ).first()
        embed_token = None
        if active_project and config.embed_secret:
            embed_token = generate_embed_token(str(active_project.id), config.embed_secret)

        return IntegrationEmbedConfigOut(
            id=config.id,
            user_id=config.user_id,
            public_id=config.public_id,
            keys=keys_list,
            domains=domains_list,  # Deprecated, kept for backward compatibility
            chatbot_domains=chatbot_domains_list,
            search_domains=search_domains_list,
            embed_token=embed_token,
            created_at=config.created_at,
            updated_at=config.updated_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching embed config for user %s: %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch embed configuration",
        )


@router.post("/embed", response_model=IntegrationEmbedConfigOut)
async def upsert_embed_config(
    payload: IntegrationEmbedConfigIn,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    """
    Create or update the current user's embed configuration.
    The frontend sends publicId and an array of keys; we store keys as JSON.
    """
    try:
        config: Optional[IntegrationEmbed] = (
            db.query(IntegrationEmbed)
            .filter(IntegrationEmbed.user_id == current_user.id)
            .first()
        )

        now = datetime.utcnow()

        if config:
            config.public_id = payload.publicId
            # Preserve existing domains if not provided (for partial updates)
            existing_keys = config.keys or {}
            existing_chatbot_domains = existing_keys.get("chatbot_domains", [])
            existing_search_domains = existing_keys.get("search_domains", [])
            incoming_chatbot_domains = _normalize_domain_list(payload.chatbot_domains)
            incoming_search_domains = _normalize_domain_list(payload.search_domains)
            
            # Use Pydantic's JSON mode so datetimes become ISO strings (JSON-serializable)
            config.keys = {
                "keys": [key.model_dump(mode="json") for key in payload.keys],
                "domains": payload.domains,  # Deprecated, kept for backward compatibility
                "chatbot_domains": incoming_chatbot_domains if payload.chatbot_domains else existing_chatbot_domains,
                "search_domains": incoming_search_domains if payload.search_domains else existing_search_domains,
            }
            config.updated_at = now
            logger.info(
                "Updated embed config for user %s with public_id=%s, chatbot_domains=%d, search_domains=%d",
                current_user.id,
                payload.publicId,
                len(config.keys.get("chatbot_domains", [])),
                len(config.keys.get("search_domains", [])),
            )
            
            # Create notification for integration update
            try:
                key_count = len(payload.keys)
                chatbot_domain_count = len(payload.chatbot_domains) if payload.chatbot_domains else len(existing_chatbot_domains)
                search_domain_count = len(payload.search_domains) if payload.search_domains else len(existing_search_domains)
                create_notification(
                    db=db,
                    user_id=current_user.id,
                    title="Integration Updated",
                    message=f"Integration '{payload.publicId}' has been updated with {key_count} API key(s), {chatbot_domain_count} chatbot domain(s), and {search_domain_count} search domain(s).",
                    type="success",
                    action_url="/integrations"
                )
            except Exception as notif_error:
                logger.warning(f"Failed to create integration update notification: {notif_error}")
        else:
            incoming_chatbot_domains = _normalize_domain_list(payload.chatbot_domains)
            incoming_search_domains = _normalize_domain_list(payload.search_domains)
            config = IntegrationEmbed(
                user_id=current_user.id,
                public_id=payload.publicId or _generate_default_public_id(),
                # Store JSON-serializable representation
                keys={
                    "keys": [key.model_dump(mode="json") for key in payload.keys],
                    "domains": payload.domains,  # Deprecated, kept for backward compatibility
                    "chatbot_domains": incoming_chatbot_domains,
                    "search_domains": incoming_search_domains,
                },
                created_at=now,
                updated_at=now,
            )
            db.add(config)
            logger.info(
                "Created embed config for user %s with public_id=%s, chatbot_domains=%d, search_domains=%d",
                current_user.id,
                config.public_id,
                len(payload.chatbot_domains),
                len(payload.search_domains),
            )

        db.commit()
        db.refresh(config)

        emit_audit(
            event_type="integration.embed.updated",
            request=http_request,
            user_id=current_user.id,
            project_id=active_project.id,
            resource_type="integration_embed",
            resource_id=str(config.id),
            summary=f"Embed configuration updated: {config.public_id}",
        )

        keys_list = (config.keys or {}).get("keys", [])
        domains_list = (config.keys or {}).get("domains", [])  # Deprecated
        chatbot_domains_list = (config.keys or {}).get("chatbot_domains", [])
        search_domains_list = (config.keys or {}).get("search_domains", [])

        return IntegrationEmbedConfigOut(
            id=config.id,
            user_id=config.user_id,
            public_id=config.public_id,
            keys=keys_list,
            domains=domains_list,  # Deprecated, kept for backward compatibility
            chatbot_domains=chatbot_domains_list,
            search_domains=search_domains_list,
            created_at=config.created_at,
            updated_at=config.updated_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error saving embed config for user %s: %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save embed configuration",
        )


@router.delete("/embed/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_embed_key(
    key_id: str,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    """
    Delete a specific key from the current user's embed configuration.
    Removes the key with matching id from the keys array in the database.
    Route: DELETE /api/v1/integrations/embed/keys/{key_id}
    """
    try:
        config: Optional[IntegrationEmbed] = (
            db.query(IntegrationEmbed)
            .filter(IntegrationEmbed.user_id == current_user.id)
            .first()
        )

        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Embed configuration not found",
            )

        # Get the current keys array
        raw_keys = config.keys or {}
        if isinstance(raw_keys, list):
            # Backwards compatibility if we ever stored list directly
            normalized_keys = {"keys": raw_keys}
        else:
            normalized_keys = raw_keys

        keys_list = normalized_keys.get("keys", [])

        # Find and remove the key with matching id
        original_count = len(keys_list)
        keys_list = [key for key in keys_list if key.get("id") != key_id]

        if len(keys_list) == original_count:
            # Key not found
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Key with id '{key_id}' not found",
            )

        # Update the config with the filtered keys
        # Update the config with the filtered keys, preserving domains
        normalized_keys["keys"] = keys_list
        config.keys = normalized_keys
        config.updated_at = datetime.utcnow()
        db.commit()

        logger.info(
            "Deleted key '%s' from embed config for user %s (public_id=%s)",
            key_id,
            current_user.id,
            config.public_id,
        )

        emit_audit(
            event_type="integration.embed_key.deleted",
            request=http_request,
            user_id=current_user.id,
            project_id=active_project.id,
            resource_type="integration_embed_key",
            resource_id=key_id,
            summary=f"Embed key removed from {config.public_id}",
        )

        return None
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(
            "Error deleting key '%s' from embed config for user %s: %s",
            key_id,
            current_user.id,
            e,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete embed key",
        )


@router.delete("/embed/{identifier}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_embed_item(
    identifier: str,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    """
    Delete either a key or an embed configuration based on the identifier.
    - If identifier starts with "key-", delete the key from the embed config
    - If identifier is a valid UUID, delete the entire embed configuration
    Route: DELETE /api/v1/integrations/embed/{identifier}
    """
    try:
        # Check if it's a key ID (starts with "key-")
        if identifier.startswith("key-"):
            # Delete the key from embed config
            config: Optional[IntegrationEmbed] = (
                db.query(IntegrationEmbed)
                .filter(IntegrationEmbed.user_id == current_user.id)
                .first()
            )

            if not config:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Embed configuration not found",
                )

            # Get the current keys array
            raw_keys = config.keys or {}
            if isinstance(raw_keys, list):
                normalized_keys = {"keys": raw_keys}
            else:
                normalized_keys = raw_keys

            keys_list = normalized_keys.get("keys", [])

            # Find and remove the key with matching id
            original_count = len(keys_list)
            keys_list = [key for key in keys_list if key.get("id") != identifier]

            if len(keys_list) == original_count:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Key with id '{identifier}' not found",
                )

            # Update the config with the filtered keys, preserving domains
            normalized_keys["keys"] = keys_list
            config.keys = normalized_keys
            config.updated_at = datetime.utcnow()
            db.commit()

            logger.info(
                "Deleted key '%s' from embed config for user %s (public_id=%s)",
                identifier,
                current_user.id,
                config.public_id,
            )

            emit_audit(
                event_type="integration.embed_item.deleted",
                request=http_request,
                user_id=current_user.id,
                project_id=active_project.id,
                resource_type="integration_embed_key",
                resource_id=identifier,
                summary=f"Embed item removed (key) from {config.public_id}",
            )

            return None
        else:
            # Try to parse as UUID for embed config deletion
            try:
                embed_id = uuid.UUID(identifier)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid identifier format: '{identifier}'. Expected UUID or key ID starting with 'key-'",
                )

            # Delete the entire embed configuration
            config: Optional[IntegrationEmbed] = (
                db.query(IntegrationEmbed)
                .filter(
                    IntegrationEmbed.id == embed_id,
                    IntegrationEmbed.user_id == current_user.id,
                )
                .first()
            )

            if not config:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Embed configuration not found",
                )

            db.delete(config)
            db.commit()

            logger.info(
                "Deleted embed config for user %s (public_id=%s)",
                current_user.id,
                config.public_id,
            )

            emit_audit(
                event_type="integration.embed_item.deleted",
                request=http_request,
                user_id=current_user.id,
                project_id=active_project.id,
                resource_type="integration_embed",
                resource_id=str(embed_id),
                summary=f"Embed configuration removed: {config.public_id}",
            )

            return None
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(
            "Error deleting embed item '%s' for user %s: %s",
            identifier,
            current_user.id,
            e,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete embed item",
        )


class AddDomainRequest(BaseModel):
    """Request schema for adding a domain"""
    domain: str = Field(..., description="Domain to add (e.g., '216.48.176.228')")
    widget_type: str = Field(default="both", description="Widget type: 'chatbot', 'search', or 'both'")

@router.post("/domains/add", response_model=IntegrationEmbedConfigOut)
async def add_domain(
    request: AddDomainRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    """Add a domain to the user's allowed domains"""
    try:
        # Get or create config
        config = db.query(IntegrationEmbed).filter(
            IntegrationEmbed.user_id == current_user.id
        ).first()
        
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="IntegrationEmbed config not found. Please create one first."
            )
        
        keys = config.keys or {}
        
        # Initialize domain lists
        if "chatbot_domains" not in keys:
            keys["chatbot_domains"] = []
        if "search_domains" not in keys:
            keys["search_domains"] = []
        
        # Normalize domain
        domain = request.domain.lower().strip()
        if '://' in domain:
            domain = domain.split('://')[1]
        if '/' in domain:
            domain = domain.split('/')[0]
        if ':' in domain:
            domain = domain.split(':')[0]
        if domain.startswith('www.'):
            domain = domain[4:]
        
        added = False
        
        # Add to chatbot_domains
        if request.widget_type in ["chatbot", "both"]:
            if domain not in keys["chatbot_domains"]:
                keys["chatbot_domains"].append(domain)
                added = True
        
        # Add to search_domains
        if request.widget_type in ["search", "both"]:
            if domain not in keys["search_domains"]:
                keys["search_domains"].append(domain)
                added = True
        
        # Update config
        config.keys = keys
        config.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(config)

        if added:
            emit_audit(
                event_type="integration.domain.added",
                request=http_request,
                user_id=current_user.id,
                project_id=active_project.id,
                resource_type="integration_embed",
                resource_id=str(config.id),
                summary=f"Allowed domain added: {domain}",
                details={"domain": domain, "widget_type": request.widget_type},
            )

        keys_list = (config.keys or {}).get("keys", [])
        domains_list = (config.keys or {}).get("domains", [])
        chatbot_domains_list = (config.keys or {}).get("chatbot_domains", [])
        search_domains_list = (config.keys or {}).get("search_domains", [])
        
        return IntegrationEmbedConfigOut(
            id=config.id,
            userId=config.user_id,
            publicId=config.public_id,
            keys=keys_list,
            domains=domains_list,
            chatbot_domains=chatbot_domains_list,
            search_domains=search_domains_list,
            createdAt=config.created_at,
            updatedAt=config.updated_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding domain for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add domain"
        )


