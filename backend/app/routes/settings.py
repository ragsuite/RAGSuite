"""
Settings API routes - Theme and branding configuration + session timeout
"""
import logging
import os
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
    SystemFooterOut,
    SystemFooterUpdate,
    UserResponse,
)
from ..services.audit_service import emit_audit
from ..services.notification_service import create_notification
from ..services.session_timeout import (
    SESSION_TIMEOUT_MAX_MINUTES,
    SESSION_TIMEOUT_MIN_MINUTES,
    clamp_session_timeout_minutes,
    is_session_timeout_enabled,
    resolve_jwt_expire_minutes,
    session_timeout_source,
    utc_session_expiry,
)
from ..settings import settings as app_settings
from datetime import datetime, timedelta, timezone
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])

_SHOW_SYSTEM_FOOTER_ENV = "SHOW_SYSTEM_FOOTER"
_ENV_TRUE = frozenset({"1", "true", "yes", "on"})
_ENV_FALSE = frozenset({"0", "false", "no", "off"})


def _can_hide_system_footer() -> bool:
    """
    Partner OEM may hide the footer only when EE white_label is actually available.

    Requires license entitlement AND the white_label module loaded (EE attached).
    CE (RAGSUITE_EE_ROOT commented / module not loaded) always fails this check,
    even if an EE license key is present on disk.
    """
    try:
        from app.platform.ee_feature_gate import enterprise_feature_denial

        return enterprise_feature_denial("white_label") is None
    except Exception as exc:
        logger.warning("system footer white-label gate failed (deny): %s", exc)
        return False


def _explicit_show_system_footer_env() -> Optional[bool]:
    """
    Return True/False only when SHOW_SYSTEM_FOOTER is set in the process env.

    Missing or blank → None (not configured). Code field defaults are ignored so
    flipping ``show_system_footer: bool = False`` in settings.py cannot hide the footer.
    Dotenv is loaded at import of app.platform.settings before this runs.
    """
    raw = os.environ.get(_SHOW_SYSTEM_FOOTER_ENV)
    if raw is None:
        return None
    normalized = str(raw).strip().lower()
    if not normalized:
        return None
    if normalized in _ENV_TRUE:
        return True
    if normalized in _ENV_FALSE:
        return False
    logger.warning(
        "Invalid %s=%r; treating as unset (footer shown)",
        _SHOW_SYSTEM_FOOTER_ENV,
        raw,
    )
    return None


def effective_show_system_footer() -> bool:
    """
    Env + EE white-label hybrid for the authenticated app shell footer.

    - SHOW_SYSTEM_FOOTER unset → always show (ignores code defaults)
    - SHOW_SYSTEM_FOOTER=true → show
    - SHOW_SYSTEM_FOOTER=false + EE white_label loaded + licensed → hide
    - SHOW_SYSTEM_FOOTER=false on CE / without EE module → still show
    """
    explicit = _explicit_show_system_footer_env()
    if explicit is None or explicit is True:
        return True
    if _can_hide_system_footer():
        return False
    return True


def _system_footer_response() -> SystemFooterOut:
    return SystemFooterOut(show_system_footer=effective_show_system_footer())


def _is_defaultish_org_name(value: Optional[str]) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"", "default organization", "default", "my organization"}


def _session_timeout_response(db: Session, user: User, org: Organization) -> SessionTimeoutOut:
    enabled = is_session_timeout_enabled(org)
    if org.session_timeout_minutes is None:
        minutes = max(1, int(app_settings.jwt_expire_minutes))
    else:
        minutes = clamp_session_timeout_minutes(int(org.session_timeout_minutes))
    return SessionTimeoutOut(
        session_timeout_minutes=minutes,
        session_timeout_enabled=enabled,
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
def get_settings(
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
def get_session_timeout(
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
    old_minutes = org.session_timeout_minutes
    old_enabled = is_session_timeout_enabled(org)

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No session timeout fields provided")

    if "session_timeout_enabled" in data:
        org.session_timeout_enabled = bool(data["session_timeout_enabled"])

    enabled_after = is_session_timeout_enabled(org)

    if "session_timeout_minutes" in data and data["session_timeout_minutes"] is not None:
        org.session_timeout_minutes = clamp_session_timeout_minutes(int(data["session_timeout_minutes"]))
    elif enabled_after and org.session_timeout_minutes is None and "session_timeout_enabled" in data:
        # Turning on without minutes: persist env default as org override so source=org.
        org.session_timeout_minutes = clamp_session_timeout_minutes(int(app_settings.jwt_expire_minutes))

    if enabled_after and org.session_timeout_minutes is None:
        raise HTTPException(
            status_code=400,
            detail="session_timeout_minutes is required when session timeout is enabled",
        )

    db.commit()
    db.refresh(org)

    emit_audit(
        event_type="settings.session_timeout.updated",
        request=request,
        user_id=current_user.id,
        resource_type="session_timeout",
        resource_id=str(org.id),
        summary=(
            f"Session timeout {'enabled' if enabled_after else 'disabled'}"
            + (
                f" ({org.session_timeout_minutes} minutes)"
                if enabled_after and org.session_timeout_minutes is not None
                else ""
            )
        ),
        details={
            "session_timeout_enabled": enabled_after,
            "session_timeout_minutes": org.session_timeout_minutes,
            "previous_enabled": old_enabled,
            "previous_minutes": old_minutes,
        },
        db=db,
    )
    return _session_timeout_response(db, current_user, org)


@router.get("/system-footer", response_model=SystemFooterOut)
async def get_system_footer(
    current_user: User = Depends(get_current_user_required),
):
    """Effective system footer visibility for the authenticated member's shell."""
    _ = current_user
    return _system_footer_response()


@router.put("/system-footer", response_model=SystemFooterOut)
async def update_system_footer(
    payload: SystemFooterUpdate,
    current_user: User = Depends(require_org_admin),
):
    """Soft no-op: footer visibility is env + license only (no customer write)."""
    _ = payload, current_user
    return _system_footer_response()


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
