"""Organization route helper tests."""

import pytest
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import MagicMock, patch

from app.models import Base, InviteStatus, Organization, OrganizationMember, Project, ProjectMember, Settings, User
from app.routes.organization import (
    create_org_user,
    deactivate_org_user,
    list_org_users,
    replace_org_user_projects,
    update_org_user,
)
from app.schemas import OrgProjectAssignment, OrgProjectPermission, OrgUserCreate, OrgUserProjectsOut, OrgUserUpdate, OrganizationRole

pytestmark = pytest.mark.ee


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    org = Organization(name="Acme", slug="acme")
    session.add(org)
    session.flush()
    admin = User(
        username="admin",
        email="admin@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    member = User(
        username="member",
        email="member@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add_all([admin, member])
    session.flush()
    session.add_all(
        [
            OrganizationMember(org_id=org.id, user_id=admin.id, role="org_admin", is_active=True),
            OrganizationMember(org_id=org.id, user_id=member.id, role="member", is_active=True),
        ]
    )
    project = Project(name="P1", owner_id=admin.id, org_id=org.id)
    session.add(project)
    session.flush()
    session.add(
        ProjectMember(
            project_id=project.id,
            user_id=member.id,
            permissions=["project:read"],
        )
    )
    session.commit()
    yield session
    session.close()


@pytest.mark.asyncio
async def test_replace_org_user_projects_scoped_to_org(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = db_session.query(User).filter(User.username == "member").first()
    request = MagicMock()
    payload = OrgUserProjectsOut(user_id=member.id, assignments=[])

    await replace_org_user_projects(
        member.id,
        payload,
        request,
        current_admin=admin,
        db=db_session,
    )

    remaining = db_session.query(ProjectMember).filter(ProjectMember.user_id == member.id).count()
    assert remaining == 0


@pytest.mark.asyncio
async def test_replace_org_user_projects_strips_project_admin(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = db_session.query(User).filter(User.username == "member").first()
    project = db_session.query(Project).first()
    request = MagicMock()
    payload = OrgUserProjectsOut(
        user_id=member.id,
        assignments=[
            OrgProjectAssignment(
                project_id=project.id,
                permissions=[
                    OrgProjectPermission.PROJECT_READ,
                    OrgProjectPermission.PROJECT_ADMIN,
                    OrgProjectPermission.CHAT_USE,
                ],
            )
        ],
    )

    await replace_org_user_projects(
        member.id,
        payload,
        request,
        current_admin=admin,
        db=db_session,
    )

    row = (
        db_session.query(ProjectMember)
        .filter(ProjectMember.user_id == member.id, ProjectMember.project_id == project.id)
        .one()
    )
    assert "project:admin" not in (row.permissions or [])
    assert "chat:use" in (row.permissions or [])


@pytest.mark.asyncio
async def test_replace_org_user_projects_rejects_outside_org(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()
    payload = OrgUserProjectsOut(user_id=99999, assignments=[])

    with pytest.raises(HTTPException) as exc:
        await replace_org_user_projects(
            99999,
            payload,
            request,
            current_admin=admin,
            db=db_session,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_create_org_user_creates_pending_invite(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()
    payload = OrgUserCreate(
        username="invited",
        email="invited@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    out = await create_org_user(
        payload,
        request,
        current_admin=admin,
        db=db_session,
    )
    assert out.is_active is False
    assert out.invite_status == "pending"


@pytest.mark.asyncio
async def test_create_org_user_sends_invite_email_by_default(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()
    payload = OrgUserCreate(
        username="emailed",
        email="emailed@acme.com",
        role=OrganizationRole.MEMBER,
        project_assignments=[],
    )
    with patch("app.routes.organization.smtp_configured", return_value=True):
        with patch("app.routes.organization.send_org_invite_email") as invite_mock:
            out = await create_org_user(
                payload,
                request,
                current_admin=admin,
                db=db_session,
            )
    assert out.is_active is False
    assert out.invite_status == "pending"
    assert invite_mock.called


@pytest.mark.asyncio
async def test_create_org_user_respects_send_invite_email_false(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()
    payload = OrgUserCreate(
        username="emailed_blank_pw",
        email="emailed_blank_pw@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    with patch("app.routes.organization.smtp_configured", return_value=True):
        with patch("app.routes.organization.send_org_invite_email") as invite_mock:
            out = await create_org_user(
                payload,
                request,
                current_admin=admin,
                db=db_session,
            )
    assert out.is_active is False
    assert out.invite_status == "pending"
    assert not invite_mock.called


@pytest.mark.asyncio
async def test_create_org_user_invite_link_uses_request_origin(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()
    request.headers = {"origin": "http://localhost:9091"}
    payload = OrgUserCreate(
        username="emailed_origin",
        email="emailed_origin@acme.com",
        role=OrganizationRole.MEMBER,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value="email-link-token"):
        with patch("app.routes.organization.smtp_configured", return_value=True):
            with patch("app.routes.organization.send_org_invite_email") as invite_mock:
                await create_org_user(
                    payload,
                    request,
                    current_admin=admin,
                    db=db_session,
                )
    assert invite_mock.called
    kwargs = invite_mock.call_args.kwargs
    assert kwargs["setup_url"].startswith("http://localhost:9091/sign-in?invite=")


@pytest.mark.asyncio
async def test_update_org_user_rejects_self_deactivation(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await update_org_user(
            admin.id,
            OrgUserUpdate(is_active=False),
            request,
            current_admin=admin,
            db=db_session,
        )
    assert exc.value.status_code == 400
    assert "cannot deactivate your own account" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_deactivate_org_user_rejects_self_deactivation(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await deactivate_org_user(
            admin.id,
            request,
            current_admin=admin,
            db=db_session,
        )
    assert exc.value.status_code == 400
    assert "cannot deactivate your own account" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_deactivate_org_user_allows_admin_to_deactivate_other_admin(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()

    peer_admin = User(
        username="peer_admin",
        email="peer_admin@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=admin.org_id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(peer_admin)
    db_session.flush()
    db_session.add(
        OrganizationMember(org_id=admin.org_id, user_id=peer_admin.id, role="org_admin", is_active=True),
    )
    db_session.commit()

    await deactivate_org_user(
        admin.id,
        request,
        current_admin=peer_admin,
        db=db_session,
    )

    admin_after = db_session.query(User).filter(User.id == admin.id).first()
    admin_membership_after = db_session.query(OrganizationMember).filter(
        OrganizationMember.org_id == admin.org_id,
        OrganizationMember.user_id == admin.id,
    ).first()
    assert admin_after is not None and admin_after.is_active is False
    assert admin_membership_after is not None and admin_membership_after.is_active is False


@pytest.mark.asyncio
async def test_deactivate_org_user_deletes_inactive_member_from_org_list(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = db_session.query(User).filter(User.username == "member").first()
    request = MagicMock()

    # First delete call deactivates.
    await deactivate_org_user(
        member.id,
        request,
        current_admin=admin,
        db=db_session,
    )
    mid_membership = db_session.query(OrganizationMember).filter(
        OrganizationMember.org_id == admin.org_id,
        OrganizationMember.user_id == member.id,
    ).first()
    assert mid_membership is not None
    assert mid_membership.is_active is False

    # Second delete call on already inactive user removes org membership and project assignments.
    await deactivate_org_user(
        member.id,
        request,
        current_admin=admin,
        db=db_session,
    )
    final_membership = db_session.query(OrganizationMember).filter(
        OrganizationMember.org_id == admin.org_id,
        OrganizationMember.user_id == member.id,
    ).first()
    remaining_project_memberships = db_session.query(ProjectMember).filter(
        ProjectMember.user_id == member.id
    ).count()
    member_after = db_session.query(User).filter(User.id == member.id).first()

    assert final_membership is None
    assert remaining_project_memberships == 0
    assert member_after is not None
    assert member_after.org_id is None


@pytest.mark.asyncio
async def test_deleting_pending_invite_hard_deletes_user_and_allows_reinvite(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()

    invited_payload = OrgUserCreate(
        username="test01",
        email="test01@yopmail.com",
        role=OrganizationRole.MEMBER,
        project_assignments=[],
    )
    invited = await create_org_user(
        invited_payload,
        request,
        current_admin=admin,
        db=db_session,
    )

    # Pending invite users are inactive from creation; single delete should hard-delete.
    await deactivate_org_user(
        invited.id,
        request,
        current_admin=admin,
        db=db_session,
    )

    invited_after = db_session.query(User).filter(User.id == invited.id).first()
    assert invited_after is None

    # Reusing same username/email must now succeed.
    reinvite = await create_org_user(
        invited_payload,
        request,
        current_admin=admin,
        db=db_session,
    )
    assert reinvite.username == "test01"
    assert reinvite.email == "test01@yopmail.com"


@pytest.mark.asyncio
async def test_create_org_user_reclaims_orphaned_provisioned_user_row(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()

    orphaned = User(
        username="testing",
        email="testing@yopmail.com",
        hashed_password="x" * 60,
        is_active=False,
        is_admin=False,
        org_id=None,
        provisioned_by=admin.id,
        onboarding_completed_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(orphaned)
    db_session.commit()

    payload = OrgUserCreate(
        username="testing",
        email="testing@yopmail.com",
        role=OrganizationRole.MEMBER,
        project_assignments=[],
    )
    created = await create_org_user(
        payload,
        request,
        current_admin=admin,
        db=db_session,
    )
    assert created.username == "testing"
    assert created.email == "testing@yopmail.com"
    memberships = db_session.query(OrganizationMember).filter(OrganizationMember.user_id == created.id).count()
    assert memberships == 1


@pytest.mark.asyncio
async def test_deleting_activated_provisioned_user_allows_reinvite(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    request = MagicMock()
    now = datetime.now(timezone.utc)

    provisioned = User(
        username="activated_invite",
        email="activated_invite@acme.com",
        hashed_password="x" * 60,
        is_active=False,
        is_admin=False,
        org_id=admin.org_id,
        provisioned_by=admin.id,
        onboarding_completed_at=now,
        last_login=now,
        email_verified_at=now,
    )
    db_session.add(provisioned)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=admin.org_id,
            user_id=provisioned.id,
            role="member",
            is_active=False,
            invite_status=InviteStatus.ACCEPTED,
            invite_activated_at=now,
            joined_at=now,
        )
    )
    db_session.commit()

    await deactivate_org_user(
        provisioned.id,
        request,
        current_admin=admin,
        db=db_session,
    )

    deleted_user = db_session.query(User).filter(User.id == provisioned.id).first()
    assert deleted_user is None

    reinvited = await create_org_user(
        OrgUserCreate(
            username="activated_invite",
            email="activated_invite@acme.com",
            role=OrganizationRole.MEMBER,
            send_invite_email=False,
            project_assignments=[],
        ),
        request,
        current_admin=admin,
        db=db_session,
    )
    assert reinvited.username == "activated_invite"
    assert reinvited.invite_status == "pending"


@pytest.mark.asyncio
async def test_list_org_users_excludes_current_admin(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = db_session.query(User).filter(User.username == "member").first()
    result = await list_org_users(current_admin=admin, db=db_session)
    usernames = {user.username for user in result.users}
    assert "admin" not in usernames
    assert "member" in usernames
    assert result.total == 1


@pytest.mark.asyncio
async def test_create_org_user_email_uses_settings_org_name(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    db_session.add(Settings(user_id=admin.id, org_name="NITSAN", logo_data_url=None, primary_color=None))
    db_session.commit()
    request = MagicMock()
    request.headers = {"origin": "http://localhost:9091"}
    payload = OrgUserCreate(
        username="branded_invite",
        email="branded_invite@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=True,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value="branded-token"):
        with patch("app.routes.organization.smtp_configured", return_value=True):
            with patch("app.routes.organization.send_org_invite_email") as invite_mock:
                await create_org_user(payload, request, current_admin=admin, db=db_session)
    assert invite_mock.called
    assert invite_mock.call_args.kwargs["organization_name"] == "NITSAN"
