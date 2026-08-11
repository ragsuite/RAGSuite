from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, InviteStatus, Organization, OrganizationMember, Project, User
from app.services.onboarding_gate import post_auth_redirect_path


def test_bootstrap_admin_redirects_to_onboarding_until_project_active():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        user = User(
            username="bootstrap-admin",
            email="bootstrap-admin@example.com",
            hashed_password="x" * 60,
            is_active=True,
            is_admin=True,
            email_verified_at=datetime.now(timezone.utc),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        assert post_auth_redirect_path(session, user.id) == "/onboarding"

        project = Project(
            name="Main Project",
            owner_id=user.id,
            is_active=True,
        )
        session.add(project)
        session.commit()
        assert post_auth_redirect_path(session, user.id) == "/organization"
    finally:
        session.close()


def test_provisioned_member_skips_onboarding_after_invite_acceptance():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        org = Organization(name="Acme", slug="acme")
        session.add(org)
        session.flush()

        admin = User(
            username="orgadmin",
            email="orgadmin@example.com",
            hashed_password="x" * 60,
            is_active=True,
            is_admin=True,
            org_id=org.id,
            email_verified_at=datetime.now(timezone.utc),
        )
        session.add(admin)
        session.flush()

        invited = User(
            username="member1",
            email="member1@example.com",
            hashed_password="x" * 60,
            is_active=True,
            is_admin=False,
            org_id=org.id,
            provisioned_by=admin.id,
            email_verified_at=datetime.now(timezone.utc),
            onboarding_completed_at=None,
        )
        session.add(invited)
        session.flush()
        session.add(
            OrganizationMember(
                org_id=org.id,
                user_id=invited.id,
                role="member",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            )
        )
        session.commit()

        assert post_auth_redirect_path(session, invited.id) == "/"
    finally:
        session.close()
