"""
API Key routes for managing API keys
"""
import hashlib
import logging
import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from uuid import UUID

from ..db import get_db
from ..models import (
    APIKey,
    User,
    Project,
    APIKeyEnvironment as ModelAPIKeyEnvironment,
    QueryLog,
)
from ..schemas import (
    APIKeyCreate,
    APIKeyResponse,
    APIKeyRevealResponse,
    APIKeyListResponse,
    APIKeyExpirationOption,
    APIKeyEnvironment as SchemaAPIKeyEnvironment
)
from ..auth import get_current_user_required, get_active_project
from ..services.notification_service import create_notification
from ..services.audit_service import emit_audit

logger = logging.getLogger(__name__)

# Create API keys router
router = APIRouter(prefix="/api/v1/api-keys", tags=["API Keys"])

def generate_api_key(environment: SchemaAPIKeyEnvironment) -> str:
    """Generate a secure API key with prefix based on environment"""
    # Generate a secure random token
    token = secrets.token_urlsafe(32)  # 32 bytes = ~43 characters
    
    # Add prefix based on environment value
    env_value = environment.value if hasattr(environment, 'value') else str(environment)
    if env_value == "Production":
        prefix = "rgs_live_"
    else:
        prefix = "rgs_test_"
    
    return prefix + token

def calculate_expiration(expiration_option: APIKeyExpirationOption) -> Optional[datetime]:
    """Calculate expiration date from expiration option"""
    if expiration_option == APIKeyExpirationOption.NEVER:
        return None
    elif expiration_option == APIKeyExpirationOption.DAYS_30:
        return datetime.utcnow() + timedelta(days=30)
    elif expiration_option == APIKeyExpirationOption.DAYS_90:
        return datetime.utcnow() + timedelta(days=90)
    elif expiration_option == APIKeyExpirationOption.YEAR_1:
        return datetime.utcnow() + timedelta(days=365)
    return None


@router.post("", response_model=APIKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    api_key_data: APIKeyCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    """
    Create a new API key.
    The full key is only returned once upon creation.
    """
    try:
        # Generate the API key
        api_key_token = generate_api_key(api_key_data.environment)
        api_key_hash = hashlib.sha256(api_key_token.encode()).hexdigest()

        # Calculate expiration
        expires_at = calculate_expiration(api_key_data.expiration)

        # Create the API key record
        # Convert schema enum to model enum
        env_value = api_key_data.environment.value
        if env_value == "Production":
            model_env = ModelAPIKeyEnvironment.PRODUCTION
        elif env_value == "Staging":
            model_env = ModelAPIKeyEnvironment.STAGING
        else:
            model_env = ModelAPIKeyEnvironment.DEVELOPMENT

        if api_key_data.project_id:
            target_project = db.query(Project).filter(
                Project.id == api_key_data.project_id,
                Project.owner_id == current_user.id
            ).first()
            if not target_project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found or access denied"
                )
            resolved_project_id = api_key_data.project_id
        else:
            resolved_project_id = active_project.id

        new_api_key = APIKey(
            name=api_key_data.name,
            description=api_key_data.description,
            key=api_key_token,
            key_hash=api_key_hash,
            environment=model_env,
            rate_limit=api_key_data.rate_limit,
            expires_at=expires_at,
            is_active=True,
            request_count=0,
            created_by_id=current_user.id,
            project_id=resolved_project_id
        )
        
        db.add(new_api_key)
        db.commit()
        db.refresh(new_api_key)
        
        logger.info(f"API key created: {new_api_key.id} by user {current_user.username}")
        
        # Create notification for API key creation
        try:
            expiration_text = f" and expires on {expires_at.strftime('%Y-%m-%d')}" if expires_at else " and never expires"
            create_notification(
                db=db,
                user_id=current_user.id,
                title="API Key Created",
                message=f"API key '{new_api_key.name}' has been created successfully{expiration_text}",
                type="success",
                action_url="/api-keys"
            )
        except Exception as notif_error:
            logger.warning(f"Failed to create notification: {notif_error}")

        emit_audit(
            event_type="api_key.created",
            request=request,
            user_id=current_user.id,
            project_id=new_api_key.project_id,
            resource_type="api_key",
            resource_id=str(new_api_key.id),
            summary=f"API key created: {new_api_key.name}",
        )
        
        # Convert model enum to schema enum for response
        env_value = new_api_key.environment.value if hasattr(new_api_key.environment, 'value') else str(new_api_key.environment)
        if env_value == "Production":
            schema_env = SchemaAPIKeyEnvironment.PRODUCTION
        elif env_value == "Staging":
            schema_env = SchemaAPIKeyEnvironment.STAGING
        else:
            schema_env = SchemaAPIKeyEnvironment.DEVELOPMENT
        
        return APIKeyResponse(
            id=new_api_key.id,
            name=new_api_key.name,
            description=new_api_key.description,
            key=new_api_key.key,
            environment=schema_env,
            rate_limit=new_api_key.rate_limit,
            expires_at=new_api_key.expires_at,
            is_active=new_api_key.is_active,
            request_count=new_api_key.request_count or 0,  # Ensure it's always a number
            last_used_at=new_api_key.last_used_at,
            created_at=new_api_key.created_at,
            updated_at=new_api_key.updated_at,
            project_id=new_api_key.project_id
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create API key: {str(e)}"
        )

@router.get("", response_model=List[APIKeyListResponse])
async def list_api_keys(
    project_id: Optional[UUID] = Query(None, description="Filter keys by project ID", alias="projectId"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    """
    List all API keys for the current user.
    Returns truncated key previews for security.
    """
    try:
        # Get all API keys created by the current user
        # Get all API keys created by the current user
        query = db.query(APIKey).filter(
            APIKey.created_by_id == current_user.id
        )
        
        if project_id:
            query = query.filter(APIKey.project_id == project_id)
        else:
            # If no explicit filter, default to active project
            query = query.filter(APIKey.project_id == active_project.id)
            
        api_keys = query.order_by(APIKey.created_at.desc()).all()
        
        # Check for expiring API keys and create notifications
        now = datetime.now(timezone.utc)
        for api_key in api_keys:
            if api_key.expires_at and api_key.is_active:
                days_until_expiry = (api_key.expires_at.replace(tzinfo=timezone.utc) - now).days
                if 0 < days_until_expiry <= 7:
                    # Check if notification already exists for this key
                    from ..models import Notification
                    existing_notif = db.query(Notification).filter(
                        Notification.user_id == current_user.id,
                        Notification.title == "API Key Expiring Soon",
                        Notification.message.like(f"%{api_key.name}%"),
                        Notification.is_read == False
                    ).first()
                    
                    if not existing_notif:
                        try:
                            create_notification(
                                db=db,
                                user_id=current_user.id,
                                title="API Key Expiring Soon",
                                message=f"Your API key '{api_key.name}' will expire in {days_until_expiry} day{'s' if days_until_expiry != 1 else ''}",
                                type="warning",
                                action_url="/api-keys"
                            )
                        except Exception as notif_error:
                            logger.warning(f"Failed to create expiration notification: {notif_error}")
        
        result = []
        for api_key in api_keys:
            # Truncate: show prefix + "..." + last 4 chars only — enough to identify, not enough to use
            _k = api_key.key or ""
            key_preview = (_k[:12] + "..." + _k[-4:]) if len(_k) > 16 else _k
            
            result.append(APIKeyListResponse(
                id=api_key.id,
                name=api_key.name,
                description=api_key.description,
                key_preview=key_preview,
                environment=api_key.environment,
                rate_limit=api_key.rate_limit,
                expires_at=api_key.expires_at,
                is_active=api_key.is_active,
                request_count=api_key.request_count or 0,
                requests=api_key.request_count or 0,  # Explicitly set requests alias
                last_used_at=api_key.last_used_at,
                created_at=api_key.created_at,
                updated_at=api_key.updated_at,
                project_id=api_key.project_id
            ))
        
        return result
    except Exception as e:
        logger.error(f"Error listing API keys: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list API keys: {str(e)}"
        )


def _get_owned_api_key(db: Session, api_key_id: UUID, current_user: User) -> APIKey:
    api_key = db.query(APIKey).filter(
        APIKey.id == api_key_id,
        APIKey.created_by_id == current_user.id,
    ).first()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )
    return api_key


def _full_api_key_token(api_key: APIKey) -> str:
    token = (api_key.key or "").strip()
    if not token or "..." in token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key secret is not available. Create a new API key.",
        )
    return token


@router.get("/{api_key_id}/reveal", response_model=APIKeyRevealResponse)
async def reveal_api_key(
    api_key_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Return the full API key token for the owner (used by n8n and API key UI)."""
    api_key = _get_owned_api_key(db, api_key_id, current_user)
    return APIKeyRevealResponse(key=_full_api_key_token(api_key))


@router.get("/{api_key_id}", response_model=APIKeyResponse)
async def get_api_key(
    api_key_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get a specific API key by ID (owner only).
    Returns the full key so it can be revealed and copied again in the UI.
    """
    try:
        api_key = _get_owned_api_key(db, api_key_id, current_user)

        # Convert model enum to schema enum
        env_value = api_key.environment.value if hasattr(api_key.environment, 'value') else str(api_key.environment)
        if env_value == "Production":
            schema_env = SchemaAPIKeyEnvironment.PRODUCTION
        elif env_value == "Staging":
            schema_env = SchemaAPIKeyEnvironment.STAGING
        else:
            schema_env = SchemaAPIKeyEnvironment.DEVELOPMENT
        
        return APIKeyResponse(
            id=api_key.id,
            name=api_key.name,
            description=api_key.description,
            key=_full_api_key_token(api_key),
            environment=schema_env,
            rate_limit=api_key.rate_limit,
            expires_at=api_key.expires_at,
            is_active=api_key.is_active,
            request_count=api_key.request_count or 0,
            last_used_at=api_key.last_used_at,
            created_at=api_key.created_at,
            updated_at=api_key.updated_at,
            project_id=api_key.project_id
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get API key: {str(e)}"
        )

@router.delete("/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    api_key_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Delete an API key by ID.
    """
    try:
        api_key = db.query(APIKey).filter(
            APIKey.id == api_key_id,
            APIKey.created_by_id == current_user.id
        ).first()
        
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API key not found"
            )

        # First, clear references from query_logs to avoid FK violations
        db.query(QueryLog).filter(QueryLog.apikey_id == api_key_id).update(
            {QueryLog.apikey_id: None}
        )

        _key_name = api_key.name
        _key_pid = api_key.project_id
        # Now it's safe to delete the API key itself
        db.delete(api_key)
        db.commit()

        emit_audit(
            event_type="api_key.deleted",
            request=request,
            user_id=current_user.id,
            project_id=_key_pid,
            resource_type="api_key",
            resource_id=str(api_key_id),
            summary=f"API key deleted: {_key_name}",
        )

        logger.info(
            f"API key deleted: {api_key_id} by user {current_user.username} "
            f"(cleared query_logs.apikey_id references first)"
        )

        return None
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete API key: {str(e)}"
        )

