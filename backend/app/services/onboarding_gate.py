"""
Post-auth routing: onboarding vs dashboard for verified users.
"""
from __future__ import annotations

from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..models import InviteStatus, OrganizationMember, Project, User

ONBOARDING_PATH = "/onboarding"
HOME_PATH = "/"
ORG_ADMIN_HOME_PATH = "/organization"


def user_needs_onboarding(db: Session, user_id: int) -> bool:
    """True when the user has not finished onboarding and has no active project."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return True
    if user.onboarding_completed_at is not None:
        return False
    # Backward compatibility: invited/provisioned members should not see onboarding.
    # Older rows may have onboarding_completed_at unset even after invite acceptance.
    if user.provisioned_by is not None and user.org_id is not None:
        member = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.org_id == user.org_id,
                OrganizationMember.user_id == user.id,
                OrganizationMember.is_active.is_(True),
                OrganizationMember.invite_status == InviteStatus.ACCEPTED,
            )
            .first()
        )
        if member is not None:
            return False
    active_project = (
        db.query(Project)
        .filter(
            and_(
                Project.owner_id == user_id,
                Project.is_active.is_(True),
            )
        )
        .first()
    )
    return active_project is None


def post_auth_redirect_path(db: Session, user_id: int) -> str:
    if user_needs_onboarding(db, user_id):
        return ONBOARDING_PATH
    from ..auth import is_org_admin_user

    user = db.query(User).filter(User.id == user_id).first()
    if user and is_org_admin_user(db, user):
        return ORG_ADMIN_HOME_PATH
    return HOME_PATH
