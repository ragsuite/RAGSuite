"""Shared login session + JWT issuance for password and SSO auth."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_device_info, get_location_from_ip, get_real_ip
from app.models import OrganizationMember, User, UserSession
from app.schemas import LoginResponse, UserResponse
from app.services.audit_service import emit_audit
from app.services.notification_service import create_notification
from app.services.onboarding_gate import post_auth_redirect_path
from app.settings import settings


def _finalize_session_and_notify(
    session_id,
    user_id: int,
    ip_address: str | None,
    device_info: str,
    previous_last_login,
    login_notifications_enabled: bool,
) -> None:
    location = get_location_from_ip(ip_address)
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        session = db.query(UserSession).filter(UserSession.id == session_id).first()
        if session:
            session.location = location
            db.commit()
        if login_notifications_enabled:
            should_notify = True
            if previous_last_login:
                elapsed = datetime.now(timezone.utc) - previous_last_login
                should_notify = elapsed.total_seconds() > 300
            if should_notify:
                create_notification(
                    db=db,
                    user_id=user_id,
                    title="New Sign-In Detected",
                    message=(
                        f"Your account was accessed from {device_info} in {location} ({ip_address}). "
                        "If this wasn't you, please secure your account immediately."
                    ),
                    type="info",
                    action_url="/profile?tab=security",
                )
    finally:
        db.close()


def _should_use_secure_cookie(request: Request) -> bool:
    """Use secure cookies on HTTPS, except localhost dev flows."""
    host = (request.url.hostname or "").strip().lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return False
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return request.url.scheme == "https" or forwarded_proto == "https"


def create_login_session_and_token(
    request: Request,
    user: User,
    db: Session,
    background_tasks,
    *,
    audit_event: str = "auth.login.success",
    audit_summary: str | None = None,
) -> tuple[str, JSONResponse]:
    if not user.is_active:
        raise ValueError("Inactive users cannot start a session")
    if user.org_id:
        membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.org_id == user.org_id,
                OrganizationMember.user_id == user.id,
                OrganizationMember.is_active == True,
            )
            .first()
        )
        if membership is None:
            raise ValueError("Inactive users cannot start a session")

    jti = str(uuid.uuid4())
    user_agent = request.headers.get("user-agent", "")
    ip_address = get_real_ip(request)
    device_info = get_device_info(user_agent)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)

    session = UserSession(
        user_id=user.id,
        token_jti=jti,
        device_info=device_info,
        ip_address=ip_address,
        location="Unknown Location",
        user_agent=user_agent,
        expires_at=expires_at,
        last_activity=datetime.utcnow(),
    )
    db.add(session)

    access_token = create_access_token(data={"sub": user.username}, jti=jti)
    previous_last_login = user.last_login
    user.last_login = datetime.now(timezone.utc)
    user.last_activity = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)

    login_notifications_enabled = getattr(user, "login_notifications", True)
    background_tasks.add_task(
        _finalize_session_and_notify,
        session.id,
        user.id,
        ip_address,
        device_info,
        previous_last_login,
        login_notifications_enabled,
    )
    emit_audit(
        event_type=audit_event,
        request=request,
        user_id=user.id,
        summary=audit_summary or f"User {user.username} signed in",
    )

    response_body = LoginResponse(
        requires_2fa=False,
        temp_token=None,
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
            last_login=user.last_login,
        ),
    )
    response = JSONResponse(content=response_body.model_dump(mode="json"))
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=_should_use_secure_cookie(request),
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return access_token, response


def _spa_auth_fragment_params(
    access_token: str,
    *,
    redirect_path: str | None = None,
    user: User | None = None,
) -> dict[str, str]:
    params: dict[str, str] = {"access_token": access_token, "token_type": "bearer"}
    if redirect_path:
        params["redirect_path"] = redirect_path
    if user is not None:
        params["user_id"] = str(user.id)
        params["username"] = user.username
        params["email"] = user.email
        params["is_admin"] = "1" if user.is_admin else "0"
        params["is_active"] = "1" if user.is_active else "0"
    return params


def _append_spa_auth_fragment(
    redirect_url: str,
    access_token: str,
    *,
    redirect_path: str | None = None,
    user: User | None = None,
) -> str:
    """Append Bearer token to the redirect URL hash for cross-origin SPAs.

    URL fragments are not sent to the server on navigation, which avoids leaking
    the JWT in Referer headers. Cookies remain set for same-origin legacy clients.
    """
    params = _spa_auth_fragment_params(access_token, redirect_path=redirect_path, user=user)
    fragment = urlencode(params)
    base, sep, existing = redirect_url.partition("#")
    if sep:
        fragment = f"{existing}&{fragment}" if existing else fragment
    return f"{base}#{fragment}"


def create_login_redirect_with_cookie(
    request: Request,
    user: User,
    db: Session,
    background_tasks,
    redirect_url: str,
    *,
    audit_event: str = "auth.login.success",
    audit_summary: str | None = None,
    include_spa_token_fragment: bool = True,
) -> RedirectResponse:
    access_token, _json_response = create_login_session_and_token(
        request,
        user,
        db,
        background_tasks,
        audit_event=audit_event,
        audit_summary=audit_summary,
    )
    redirect_path = post_auth_redirect_path(db, user.id)
    final_redirect_url = (
        _append_spa_auth_fragment(
            redirect_url,
            access_token,
            redirect_path=redirect_path,
            user=user,
        )
        if include_spa_token_fragment
        else redirect_url
    )
    response = RedirectResponse(url=final_redirect_url, status_code=302)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=_should_use_secure_cookie(request),
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return response
