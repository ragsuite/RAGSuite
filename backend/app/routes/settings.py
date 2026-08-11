"""
Settings API routes - Theme and branding configuration
"""
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..db import get_db
from ..auth import get_current_user_required, get_project_id_or_user
from ..schemas import SettingsCreate, SettingsOut
from ..models import User, Settings, Organization
from ..services.notification_service import create_notification
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])


def _is_defaultish_org_name(value: Optional[str]) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"", "default organization", "default", "my organization"}


@router.get("", response_model=SettingsOut, status_code=status.HTTP_200_OK)
async def get_settings(
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Get current user's settings (theme/branding configuration).
    Works for both authenticated users and widgets (via projectId).
    """
    current_user_id = auth["user_id"]
    
    # Get or create settings for user
    settings = db.query(Settings).filter(
        Settings.user_id == current_user_id
    ).first()
    
    if not settings:
        # Get username safely for fallback
        display_name = "My Organization"
        if auth["type"] == "user":
            user = auth["user"]
            if user.org_id:
                org = db.query(Organization).filter(Organization.id == user.org_id).first()
                if org and org.name:
                    display_name = org.name
                else:
                    display_name = user.username or "My Organization"
            else:
                display_name = user.username or "My Organization"
        elif auth["type"] == "widget":
             owner = db.query(User).filter(User.id == current_user_id).first()
             if owner:
                if owner.org_id:
                    org = db.query(Organization).filter(Organization.id == owner.org_id).first()
                    if org and org.name:
                        display_name = org.name
                    else:
                        display_name = owner.username
                else:
                    display_name = owner.username
        
        # Return default settings if none exist
        return SettingsOut(
            org_name=display_name,
            logo_data_url=None,
            primary_color=None
        )
    
    resolved_org_name = settings.org_name
    if auth["type"] == "user":
        user = auth["user"]
        if user.org_id:
            org = db.query(Organization).filter(Organization.id == user.org_id).first()
            if org and org.name and _is_defaultish_org_name(settings.org_name):
                resolved_org_name = org.name
                settings.org_name = org.name
                db.commit()
                db.refresh(settings)
    elif auth["type"] == "widget":
        owner = db.query(User).filter(User.id == current_user_id).first()
        if owner and owner.org_id:
            org = db.query(Organization).filter(Organization.id == owner.org_id).first()
            if org and org.name and _is_defaultish_org_name(settings.org_name):
                resolved_org_name = org.name

    return SettingsOut(
        org_name=resolved_org_name,
        logo_data_url=settings.logo_data_url,
        primary_color=settings.primary_color
    )


@router.post("", response_model=SettingsOut, status_code=status.HTTP_200_OK)
async def update_settings(
    settings_data: SettingsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Update user's settings (theme/branding configuration)
    Creates settings if they don't exist, updates if they do
    """
    # Get existing settings
    settings = db.query(Settings).filter(
        Settings.user_id == current_user.id
    ).first()
    
    if settings:
        # Update existing settings
        settings.org_name = settings_data.org_name
        settings.logo_data_url = settings_data.logo_data_url
        settings.primary_color = settings_data.primary_color
        
        db.commit()
        db.refresh(settings)
        
        logger.info(f"Updated settings for user {current_user.id}")
        
        # Create notification for settings update
        try:
            create_notification(
                db=db,
                user_id=current_user.id,
                title="Settings Updated",
                message=f"Your organization settings have been updated. Organization name: {settings_data.org_name}",
                type="success",
                action_url="/settings"
            )
        except Exception as notif_error:
            logger.warning(f"Failed to create settings update notification: {notif_error}")
    else:
        # Create new settings
        settings = Settings(
            user_id=current_user.id,
            org_name=settings_data.org_name,
            logo_data_url=settings_data.logo_data_url,
            primary_color=settings_data.primary_color
        )
        
        db.add(settings)
        db.commit()
        db.refresh(settings)
        
        logger.info(f"Created settings for user {current_user.id}")
        
        # Create notification for settings creation
        try:
            create_notification(
                db=db,
                user_id=current_user.id,
                title="Settings Created",
                message=f"Your organization settings have been created. Organization name: {settings_data.org_name}",
                type="success",
                action_url="/settings"
            )
        except Exception as notif_error:
            logger.warning(f"Failed to create settings creation notification: {notif_error}")
    
    return SettingsOut(
        org_name=settings.org_name,
        logo_data_url=settings.logo_data_url,
        primary_color=settings.primary_color
    )

