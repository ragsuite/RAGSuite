"""Connector routes respect project membership and connectors:manage permission."""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import ensure_connector_project_access, try_connector_project_access
from app.models import (
    Base,
    InviteStatus,
    Organization,
    OrganizationMember,
    Project,
    ProjectMember,
    User,
)


@pytest.fixture()
def org_context():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    now = datetime.now(timezone.utc)
    org = Organization(name="NITSAN", slug="nitsan")
    session.add(org)
    session.flush()

    admin = User(
        username="orgadmin",
        email="admin@nitsan.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    member = User(
        username="testing",
        email="testing@yopmail.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        provisioned_by=1,
        email_verified_at=now,
        onboarding_completed_at=now,
    )
    session.add_all([admin, member])
    session.flush()
    session.add_all(
        [
            OrganizationMember(
                org_id=org.id,
                user_id=admin.id,
                role="org_admin",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            ),
            OrganizationMember(
                org_id=org.id,
                user_id=member.id,
                role="member",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            ),
        ]
    )

    assigned_project = Project(
        name="Nitsan AI",
        description="Assigned project",
        owner_id=admin.id,
        org_id=org.id,
        is_active=False,
    )
    session.add(assigned_project)
    session.flush()
    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=["project:read", "chat:use", "search:use"],
            granted_by=admin.id,
        )
    )
    session.commit()
    yield session, admin, member, assigned_project
    session.close()


def test_member_with_assigned_project_can_soft_read_connector_status(org_context):
    session, _admin, member, project = org_context
    assert try_connector_project_access(session, member, project.id) is None


def test_member_without_connectors_manage_cannot_write_connector_settings(org_context):
    session, _admin, member, project = org_context
    with pytest.raises(HTTPException) as exc:
        ensure_connector_project_access(session, member, project.id)
    assert exc.value.status_code == 403
    assert "connectors:manage" in str(exc.value.detail)


def test_member_without_project_assignment_denied(org_context):
    session, admin, member, project = org_context
    other = Project(name="Other", owner_id=admin.id, org_id=admin.org_id, is_active=False)
    session.add(other)
    session.commit()
    with pytest.raises(HTTPException) as exc:
        ensure_connector_project_access(session, member, other.id)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Project access denied"
