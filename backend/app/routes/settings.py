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
from ..models import Organization, OrganizationMember, Settings, User, UserSession
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

WHITE_LABEL_ENTITLEMENT = "white_label:use"
CE_WORKSPACE_BRAND_NAME = "RAGSuite"


def _can_customize_workspace_brand() -> bool:
    """True when white_label is licensed and the EE module is loaded (logo + org name)."""
    try:
        from app.platform.ee_feature_gate import can_use_white_label

        return bool(can_use_white_label())
    except Exception as exc:
        logger.warning("workspace brand entitlement check failed (deny): %s", exc)
        return False


def _effective_workspace_org_name(value: Optional[str]) -> str:
    if not _can_customize_workspace_brand():
        return CE_WORKSPACE_BRAND_NAME
    trimmed = (value or "").strip()
    return trimmed or CE_WORKSPACE_BRAND_NAME


def _effective_workspace_logo_data_url(value: Optional[str]) -> Optional[str]:
    if not _can_customize_workspace_brand():
        return None
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _is_defaultish_org_slug(value: Optional[str]) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"", "default"}


def _force_ce_organization_name(db: Session, user: User) -> None:
    """CE: force Organization.name to RAGSuite; rewrite slug only when defaultish."""
    if not user.org_id:
        return
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        return
    org.name = CE_WORKSPACE_BRAND_NAME
    if _is_defaultish_org_slug(org.slug) or _is_defaultish_org_name(org.slug):
        desired_slug = "ragsuite"
        existing = (
            db.query(Organization)
            .filter(Organization.slug == desired_slug, Organization.id != org.id)
            .first()
        )
        org.slug = f"{desired_slug}-{org.id}" if existing else desired_slug


def _can_hide_system_footer() -> bool:
    """
    Partner OEM may hide the footer only when EE white_label is actually available.

    Requires license entitlement AND the white_label module loaded (EE attached).
    CE (RAGSUITE_EE_ROOT commented / module not loaded) always fails this check,
    even if an EE license key is present on disk.
    """
    try:
        from app.platform.ee_feature_gate import can_use_white_label

        return bool(can_use_white_label())
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


def _resolve_organization_for_auth(db: Session, auth: dict) -> Organization | None:
    """Load the caller's organization (user or widget owner)."""
    org_id = None
    if auth.get("type") == "user":
        user = auth.get("user")
        org_id = getattr(user, "org_id", None) if user is not None else None
    else:
        owner = db.query(User).filter(User.id == auth.get("user_id")).first()
        org_id = owner.org_id if owner else None
    if not org_id:
        return None
    return db.query(Organization).filter(Organization.id == org_id).first()


def _apply_org_workspace_branding(
    org: Organization,
    *,
    org_name: str,
    logo_data_url: Optional[str],
    primary_color: Optional[str],
) -> None:
    """Persist workspace branding on the organization (shared by all members)."""
    org.name = org_name
    org.logo_data_url = logo_data_url
    org.primary_color = primary_color


def _legacy_org_member_branding(
    db: Session, org_id: int
) -> tuple[Optional[str], Optional[str]]:
    """
    Pre-migration fallback: pick logo/color from any org member's settings.

    Prefers org_admin rows, then any row with a logo.
    """
    rows = (
        db.query(Settings.logo_data_url, Settings.primary_color, OrganizationMember.role)
        .join(User, User.id == Settings.user_id)
        .outerjoin(
            OrganizationMember,
            (OrganizationMember.user_id == User.id)
            & (OrganizationMember.org_id == User.org_id),
        )
        .filter(User.org_id == org_id)
        .all()
    )
    if not rows:
        return None, None

    def _rank(row: tuple) -> tuple[int, int]:
        logo, _color, role = row
        has_logo = 0 if (logo and str(logo).strip()) else 1
        is_admin = 0 if role == "org_admin" else 1
        return (is_admin, has_logo)

    rows_sorted = sorted(rows, key=_rank)
    logo = None
    color = None
    for logo_data_url, primary_color, _role in rows_sorted:
        if logo is None and logo_data_url and str(logo_data_url).strip():
            logo = str(logo_data_url).strip()
        if color is None and primary_color and str(primary_color).strip():
            color = str(primary_color).strip()
        if logo is not None and color is not None:
            break
    return logo, color


def _branding_payload_for_user(
    db: Session,
    auth: dict,
    *,
    settings: Settings | None,
) -> tuple[str, Optional[str], Optional[str]]:
    """
    Resolve workspace branding for API responses.

    Prefer org-scoped fields so every member/admin sees the same logo.
    Fall back to per-user / peer-member settings when org fields are still empty
    (pre-migration installs).
    """
    org = _resolve_organization_for_auth(db, auth)
    if org is not None:
        name = org.name or (settings.org_name if settings else None) or "My Organization"
        logo = org.logo_data_url if (org.logo_data_url and str(org.logo_data_url).strip()) else None
        color = org.primary_color if (org.primary_color and str(org.primary_color).strip()) else None
        if logo is None or color is None:
            if settings is not None:
                if logo is None and settings.logo_data_url and str(settings.logo_data_url).strip():
                    logo = str(settings.logo_data_url).strip()
                if color is None and settings.primary_color and str(settings.primary_color).strip():
                    color = str(settings.primary_color).strip()
            if logo is None or color is None:
                peer_logo, peer_color = _legacy_org_member_branding(db, org.id)
                logo = logo or peer_logo
                color = color or peer_color
        return name, logo, color

    if settings is not None:
        return settings.org_name, settings.logo_data_url, settings.primary_color

    display_name = "My Organization"
    if auth.get("type") == "user":
        user = auth.get("user")
        display_name = (getattr(user, "username", None) if user else None) or "My Organization"
    else:
        owner = db.query(User).filter(User.id == auth.get("user_id")).first()
        display_name = (owner.username if owner else None) or "My Organization"
    return display_name, None, None


@router.get("", response_model=SettingsOut, status_code=status.HTTP_200_OK)
def get_settings(
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Get workspace branding for the current user/widget.

    Branding is organization-scoped when the user belongs to an org, so invited
    admins/members see the same logo as the admin who uploaded it.
    CE (no white_label:use): always returns RAGSuite name + null logo.
    """
    current_user_id = auth["user_id"]
    can_brand = _can_customize_workspace_brand()

    settings = db.query(Settings).filter(
        Settings.user_id == current_user_id
    ).first()

    org_name, logo_data_url, primary_color = _branding_payload_for_user(
        db, auth, settings=settings
    )

    # EE: keep legacy per-user settings row aligned with org name when still defaultish.
    if can_brand and settings is not None and _is_defaultish_org_name(settings.org_name):
        org = _resolve_organization_for_auth(db, auth)
        if org and org.name:
            settings.org_name = org.name
            db.commit()
            db.refresh(settings)

    return SettingsOut(
        org_name=_effective_workspace_org_name(org_name),
        logo_data_url=_effective_workspace_logo_data_url(logo_data_url),
        primary_color=primary_color,
    )


@router.post("", response_model=SettingsOut, status_code=status.HTTP_200_OK)
async def update_settings(
    settings_data: SettingsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Update workspace branding.

    When the user belongs to an organization, branding is written to the org
    (shared by all members) and mirrored onto the caller's settings row.
    CE: ignore custom name/logo; force RAGSuite + null logo; force Organization.name.
    """
    can_brand = _can_customize_workspace_brand()
    effective_org_name = _effective_workspace_org_name(settings_data.org_name)
    effective_logo = _effective_workspace_logo_data_url(settings_data.logo_data_url)
    primary_color = settings_data.primary_color

    settings = db.query(Settings).filter(
        Settings.user_id == current_user.id
    ).first()

    if settings:
        settings.org_name = effective_org_name
        settings.logo_data_url = effective_logo
        settings.primary_color = primary_color
        created = False
    else:
        settings = Settings(
            user_id=current_user.id,
            org_name=effective_org_name,
            logo_data_url=effective_logo,
            primary_color=primary_color,
        )
        db.add(settings)
        created = True

    org = (
        db.query(Organization).filter(Organization.id == current_user.org_id).first()
        if current_user.org_id
        else None
    )
    if org is not None:
        if can_brand:
            _apply_org_workspace_branding(
                org,
                org_name=effective_org_name,
                logo_data_url=effective_logo,
                primary_color=primary_color,
            )
        else:
            _force_ce_organization_name(db, current_user)
            org.logo_data_url = None
            # Keep org primary_color writable even on CE (theme accent is not white-label gated).
            org.primary_color = primary_color
    elif not can_brand:
        _force_ce_organization_name(db, current_user)

    db.commit()
    db.refresh(settings)
    if org is not None:
        db.refresh(org)

    logger.info(
        "%s settings for user %s (org_id=%s)",
        "Created" if created else "Updated",
        current_user.id,
        current_user.org_id,
    )

    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Settings Created" if created else "Settings Updated",
            message=(
                f"Your organization settings have been {'created' if created else 'updated'}. "
                f"Organization name: {effective_org_name}"
            ),
            type="success",
            action_url="/settings",
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create settings notification: {notif_error}")

    # Prefer org row after write so response matches what other members will see.
    response_name = org.name if org is not None else settings.org_name
    response_logo = org.logo_data_url if org is not None else settings.logo_data_url
    response_color = org.primary_color if org is not None else settings.primary_color
    return SettingsOut(
        org_name=_effective_workspace_org_name(response_name),
        logo_data_url=_effective_workspace_logo_data_url(response_logo),
        primary_color=response_color,
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
