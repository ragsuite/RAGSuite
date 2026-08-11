"""Organization invite token helpers and pending-invite lookups."""

from __future__ import annotations

import hashlib
import secrets
import string
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import InviteStatus, Organization, OrganizationMember, User

INVITE_INVALID_MESSAGE = "Invalid or expired invitation."
INVITE_EXPIRED_MESSAGE = (
    "Your invitation has expired. Contact your organization administrator for a new invite."
)
INVITE_SETUP_REQUIRED_MESSAGE = (
    "Please complete account setup using the link in your invitation email."
)


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_temp_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def invite_temp_password_expired(membership: OrganizationMember) -> bool:
    if membership.invite_expires_at is None:
        return False
    expires_at = membership.invite_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= expires_at


def get_pending_invite_membership(db: Session, user_id: int) -> OrganizationMember | None:
    return (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user_id,
            OrganizationMember.invite_status == InviteStatus.PENDING,
        )
        .first()
    )


def find_pending_invite_by_token(
    db: Session,
    token: str,
) -> tuple[OrganizationMember, User, Organization] | None:
    token_hash = hash_invite_token(token.strip())
    row = (
        db.query(OrganizationMember, User, Organization)
        .join(User, User.id == OrganizationMember.user_id)
        .join(Organization, Organization.id == OrganizationMember.org_id)
        .filter(
            OrganizationMember.invite_token_hash == token_hash,
            OrganizationMember.invite_status == InviteStatus.PENDING,
        )
        .first()
    )
    if not row:
        return None
    return row[0], row[1], row[2]


INVITE_ALREADY_COMPLETED_MESSAGE = (
    "This invitation has already been completed. Sign in with your new password."
)


def is_org_provisioned_user(user: User) -> bool:
    """True for accounts created by an org admin invite/provision flow."""
    return user.provisioned_by is not None


def is_reclaimable_org_provisioned_user(db: Session, user: User) -> bool:
    """Provisioned users with no org memberships can be recreated on re-invite."""
    if not is_org_provisioned_user(user):
        return False
    membership_count = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .count()
    )
    return membership_count == 0
