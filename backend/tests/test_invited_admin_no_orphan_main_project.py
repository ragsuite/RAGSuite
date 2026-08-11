"""Invited org admins must not get a personal orphan Main Project."""

from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import (
    ensure_user_active_project,
    get_accessible_project_ids,
    project_permissions_for_user,
)
from app.models import (
    Base,
    InviteStatus,
    Organization,
    OrganizationMember,
    Project,
    User,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_invited_admin_sees_only_org_projects_not_orphan_main():
    session = _session()
    now = datetime.now(timezone.utc)
    org = Organization(name="NITSAN", slug="nitsan")
    session.add(org)
    session.flush()

    orgadmin = User(
        username="orgadmin",
        email="admin@nitsan.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    testing = User(
        username="testing",
        email="testing@yopmail.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        provisioned_by=1,
        email_verified_at=now,
        onboarding_completed_at=now,
    )
    session.add_all([orgadmin, testing])
    session.flush()
    session.add_all(
        [
            OrganizationMember(
                org_id=org.id,
                user_id=orgadmin.id,
                role="org_admin",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            ),
            OrganizationMember(
                org_id=org.id,
                user_id=testing.id,
                role="org_admin",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            ),
        ]
    )

    test01 = Project(
        name="Test01",
        description="testing",
        owner_id=orgadmin.id,
        org_id=org.id,
        is_active=True,
    )
    test02 = Project(
        name="Test02",
        description="Again Testing",
        owner_id=orgadmin.id,
        org_id=org.id,
        is_active=False,
    )
    orphan = Project(
        name="Main Project",
        description="Default project",
        owner_id=testing.id,
        org_id=None,
        is_active=True,
    )
    session.add_all([test01, test02, orphan])
    session.commit()

    accessible = set(get_accessible_project_ids(session, testing))
    assert accessible == {test01.id, test02.id}
    assert orphan.id not in accessible
    assert project_permissions_for_user(session, testing, orphan) is None

    orgadmin_ids = set(get_accessible_project_ids(session, orgadmin))
    assert orgadmin_ids == {test01.id, test02.id}

    before = session.query(Project).count()
    active = ensure_user_active_project(session, testing)
    after = session.query(Project).count()

    assert active is not None
    assert active.id in {test01.id, test02.id}
    assert after == before

    session.close()


def test_empty_org_does_not_auto_create_main_project():
    """Projects come from onboarding / explicit create — never invent Main Project."""
    session = _session()
    now = datetime.now(timezone.utc)
    org = Organization(name="Empty", slug="empty")
    session.add(org)
    session.flush()
    admin = User(
        username="solo",
        email="solo@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    session.add(admin)
    session.flush()
    session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=admin.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
        )
    )
    session.commit()

    assert get_accessible_project_ids(session, admin) == []
    assert ensure_user_active_project(session, admin) is None
    assert session.query(Project).count() == 0
    session.close()
