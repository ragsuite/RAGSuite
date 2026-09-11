"""Org-scoped login session timeout (absolute JWT / UserSession TTL)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from sqlalchemy.orm import Session

from app.models import Organization, User
from app.settings import settings

SESSION_TIMEOUT_MIN_MINUTES = 5
SESSION_TIMEOUT_MAX_MINUTES = 1440  # 24h
# When absolute timeout is disabled, still issue JWTs with a far-future exp.
SESSION_TIMEOUT_DISABLED_MINUTES = 60 * 24 * 365 * 10  # ~10 years


def clamp_session_timeout_minutes(value: int) -> int:
    return max(SESSION_TIMEOUT_MIN_MINUTES, min(SESSION_TIMEOUT_MAX_MINUTES, int(value)))


def utc_session_expiry(expire_minutes: int) -> datetime:
    """Aware UTC absolute expiry for UserSession + client `expires_at` (JSON with Z)."""
    return datetime.now(timezone.utc) + timedelta(minutes=max(1, int(expire_minutes)))


def ensure_aware_utc(value: datetime) -> datetime:
    """Normalize DB/client datetimes so JSON serialization includes a timezone."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _org_for_user(db: Session, user: Optional[User]) -> Optional[Organization]:
    if user is None or not getattr(user, "org_id", None):
        return None
    return db.query(Organization).filter(Organization.id == user.org_id).first()


def is_session_timeout_enabled(org: Optional[Organization] = None, *, user: Optional[User] = None, db: Optional[Session] = None) -> bool:
    """
    Absolute login TTL enforcement. Defaults to True when unset / no org
    (preserves historical behavior for existing deployments).
    """
    resolved = org
    if resolved is None and db is not None and user is not None:
        resolved = _org_for_user(db, user)
    if resolved is None:
        return True
    raw = getattr(resolved, "session_timeout_enabled", None)
    if raw is None:
        return True
    return bool(raw)


def is_absolute_session_expiry_enforced(db: Session, user_id: Optional[int]) -> bool:
    """Whether UserSession.expires_at should force logout for this user."""
    if not user_id:
        return True
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return True
    return is_session_timeout_enabled(db=db, user=user)


def resolve_jwt_expire_minutes(db: Session, user: Optional[User]) -> int:
    """Absolute login TTL in minutes: org override if set, else env default.

    When org session timeout is disabled, returns a far-future sentinel so JWT
    issuance still has a valid exp without enforcing practical expiry.
    """
    fallback = int(settings.jwt_expire_minutes)
    if user is None or not getattr(user, "org_id", None):
        return max(1, fallback)
    org = _org_for_user(db, user)
    if org is None:
        return max(1, fallback)
    if not is_session_timeout_enabled(org):
        return SESSION_TIMEOUT_DISABLED_MINUTES
    raw = getattr(org, "session_timeout_minutes", None)
    if raw is None:
        return max(1, fallback)
    return clamp_session_timeout_minutes(int(raw))


def session_timeout_source(db: Session, user: Optional[User]) -> Literal["org", "env"]:
    if user is None or not getattr(user, "org_id", None):
        return "env"
    org = _org_for_user(db, user)
    if org is None or getattr(org, "session_timeout_minutes", None) is None:
        return "env"
    return "org"


def resolve_org_for_user(db: Session, user: User) -> Organization:
    if not user.org_id:
        raise ValueError("User has no organization")
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if org is None:
        raise ValueError("Organization not found")
    return org
