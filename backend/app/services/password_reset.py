"""Password reset token helpers and eligibility checks."""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import InviteStatus, Organization, OrganizationMember, User
from ..services.org_invite import hash_invite_token

PASSWORD_RESET_INVALID_MESSAGE = "Invalid or expired password reset link."
PASSWORD_RESET_EXPIRED_MESSAGE = (
    "This password reset link has expired. Request a new link from the sign-in page."
)
PASSWORD_RESET_GENERIC_SENT_MESSAGE = (
    "If an account exists for this email, a password reset link has been sent."
)
PASSWORD_RESET_SMTP_NOT_READY_MESSAGE = (
    "Email delivery is not configured. Set real SMTP_HOST, SMTP_USER, SMTP_PASSWORD, "
    "and EMAIL_FROM in your .env (not smoke or placeholder values), then restart the API."
)
PASSWORD_RESET_SMTP_SEND_FAILED_MESSAGE = (
    "Unable to send email right now. Please try again later or contact your administrator."
)


def password_reset_expired(user: User) -> bool:
    if user.password_reset_expires_at is None:
        return True
    expires_at = user.password_reset_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= expires_at


def find_user_by_reset_token(db: Session, token: str) -> tuple[User, OrganizationMember, Organization] | None:
    token_hash = hash_invite_token(token.strip())
    row = (
        db.query(User, OrganizationMember, Organization)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .join(Organization, Organization.id == OrganizationMember.org_id)
        .filter(
            User.password_reset_token_hash == token_hash,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.invite_status == InviteStatus.ACCEPTED,
        )
        .first()
    )
    if not row:
        return None
    return row[0], row[1], row[2]


def user_eligible_for_password_reset(db: Session, user: User) -> bool:
    if not user.is_active:
        return False
    if user.org_id is None:
        return True
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.org_id == user.org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.invite_status == InviteStatus.ACCEPTED,
        )
        .first()
    )
    return membership is not None


def find_reset_eligible_user_by_email(db: Session, email: str) -> User | None:
    normalized = email.strip().lower()
    if not normalized:
        return None
    user = db.query(User).filter(func.lower(User.email) == normalized).first()
    if not user or not user_eligible_for_password_reset(db, user):
        return None
    return user


def clear_password_reset_token(user: User) -> None:
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None


def resolve_frontend_base(request: Request | None) -> str:
    from ..settings import settings

    if request is not None:
        headers = getattr(request, "headers", None)
        if headers is not None and hasattr(headers, "get"):
            raw_origin = headers.get("origin", "")
            origin = raw_origin.strip() if isinstance(raw_origin, str) else ""
            if origin:
                parsed = urlparse(origin)
                if parsed.scheme and parsed.netloc:
                    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
            raw_referer = headers.get("referer", "")
            referer = raw_referer.strip() if isinstance(raw_referer, str) else ""
            if referer:
                parsed = urlparse(referer)
                if parsed.scheme and parsed.netloc:
                    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return settings.frontend_base_url.rstrip("/")
