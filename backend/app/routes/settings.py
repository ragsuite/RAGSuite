"""
Settings API routes - Theme and branding configuration + session timeout
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from ..auth import (
    create_access_token,
    get_current_user_required,
    get_device_info,
    get_project_id_or_user,
    get_real_ip,
    require_org_admin,
    verify_token,
)
from ..db import get_db
from ..models import Organization, Settings, User, UserSession
from ..schemas import (
    SessionRefreshResponse,
    SessionTimeoutOut,
    SessionTimeoutUpdate,
    SettingsCreate,
    SettingsOut,
    UserResponse,
)
from ..services.audit_service import emit_audit
from ..services.notification_service import create_notification
from ..services.session_timeout import (
    SESSION_TIMEOUT_MAX_MINUTES,
    SESSION_TIMEOUT_MIN_MINUTES,
    clamp_session_timeout_minutes,
    resolve_jwt_expire_minutes,
    session_timeout_source,
    utc_session_expiry,
)
from ..settings import settings as app_settings
from datetime import datetime, timedelta, timezone
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])


def _is_defaultish_org_name(value: Optional[str]) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"", "default organization", "default", "my organization"}


def _session_timeout_response(db: Session, user: User, org: Organization) -> SessionTimeoutOut:
    if org.session_timeout_minutes is None:
        minutes = max(1, int(app_settings.jwt_expire_minutes))
    else:
        minutes = clamp_session_timeout_minutes(int(org.session_timeout_minutes))
    return SessionTimeoutOut(
        session_timeout_minutes=minutes,
        default_minutes=int(app_settings.jwt_expire_minutes),
        min_minutes=SESSION_TIMEOUT_MIN_MINUTES,
        max_minutes=SESSION_TIMEOUT_MAX_MINUTES,
        source=session_timeout_source(db, user),
    )


def _get_org_for_admin(db: Session, user: User) -> Organization:
    if not user.org_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


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

    settings = db.query(Settings).filter(
        Settings.user_id == current_user_id
    ).first()

    if not settings:
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
    settings = db.query(Settings).filter(
        Settings.user_id == current_user.id
    ).first()

    if settings:
        settings.org_name = settings_data.org_name
        settings.logo_data_url = settings_data.logo_data_url
        settings.primary_color = settings_data.primary_color

        db.commit()
        db.refresh(settings)

        logger.info(f"Updated settings for user {current_user.id}")

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


@router.get("/session-timeout", response_model=SessionTimeoutOut)
async def get_session_timeout(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    org = _get_org_for_admin(db, current_user)
    return _session_timeout_response(db, current_user, org)


@router.put("/session-timeout", response_model=SessionTimeoutOut)
async def update_session_timeout(
    payload: SessionTimeoutUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    org = _get_org_for_admin(db, current_user)
    new_minutes = clamp_session_timeout_minutes(payload.session_timeout_minutes)
    old = org.session_timeout_minutes
    org.session_timeout_minutes = new_minutes
    db.commit()
    db.refresh(org)

    emit_audit(
        event_type="settings.session_timeout.updated",
        request=request,
        user_id=current_user.id,
        resource_type="session_timeout",
        resource_id=str(org.id),
        summary=f"Session timeout updated to {new_minutes} minutes",
        details={"session_timeout_minutes": new_minutes, "previous": old},
        db=db,
    )
    return _session_timeout_response(db, current_user, org)


@router.post("/refresh-session", response_model=SessionRefreshResponse)
async def refresh_current_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Re-issue JWT + UserSession for the current user using resolved org TTL."""
    expire_minutes = resolve_jwt_expire_minutes(db, current_user)
    expires_at = utc_session_expiry(expire_minutes)

    # Revoke current session if we can identify it
    auth_header = request.headers.get("Authorization") or ""
    token = auth_header.split(" ", 1)[1].strip() if auth_header.startswith("Bearer ") else request.cookies.get("access_token")
    if token:
        try:
            _, payload = verify_token(token)
            jti = payload.get("jti")
            if jti:
                old = db.query(UserSession).filter(UserSession.token_jti == jti).first()
                if old:
                    old.is_active = False
        except Exception:
            pass

    new_jti = str(uuid.uuid4())
    user_agent = request.headers.get("user-agent", "")
    ip_address = get_real_ip(request)
    device_info = get_device_info(user_agent)
    session = UserSession(
        user_id=current_user.id,
        token_jti=new_jti,
        device_info=device_info,
        ip_address=ip_address,
        location="Unknown Location",
        user_agent=user_agent,
        expires_at=expires_at,
        last_activity=datetime.now(timezone.utc),
    )
    db.add(session)
    current_user.last_activity = datetime.now(timezone.utc)
    db.commit()

    access_token = create_access_token(
        data={"sub": current_user.username},
        expires_delta=timedelta(minutes=expire_minutes),
        jti=new_jti,
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
        samesite="lax",
        max_age=expire_minutes * 60,
        path="/",
    )
    return SessionRefreshResponse(
        access_token=access_token,
        token_type="bearer",
        expires_at=expires_at,
        user=UserResponse(
            id=current_user.id,
            username=current_user.username,
            email=current_user.email,
            is_active=current_user.is_active,
            is_admin=current_user.is_admin,
            created_at=current_user.created_at,
            last_login=current_user.last_login,
        ),
    )
