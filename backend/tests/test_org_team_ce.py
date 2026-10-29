"""CE platform team-admin: Admin invites allowed; Member role locked without entitlement."""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, InviteStatus, Organization, OrganizationMember, User
from app.routes.org_team import (
    create_org_user,
    deactivate_org_user,
    get_org_team_capabilities,
    list_org_users,
    update_org_user,
)
from app.routes.crawl import login_user
from app.schemas import OrgUserCreate, OrgUserUpdate, OrganizationRole, UserLogin
from app.auth import get_password_hash
from app.services.org_team import MEMBER_ACTIVE_ON_CE_MESSAGE, deactivate_members_for_ce_fallback
from fastapi import BackgroundTasks, Request


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
        hashed_password=get_password_hash("AdminPass123!"),
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
        onboarding_completed_at=datetime.now(timezone.utc),
    )
    session.add(admin)
    session.flush()
    session.add(OrganizationMember(org_id=org.id, user_id=admin.id, role="org_admin", is_active=True))
    session.commit()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _deny_organization_entitlement(monkeypatch):
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: False)


@pytest.mark.asyncio
async def test_ce_invite_admin_succeeds(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    out = await create_org_user(
        OrgUserCreate(
            username="coadmin",
            email="coadmin@acme.com",
            role=OrganizationRole.ORG_ADMIN,
            send_invite_email=False,
        ),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )
    assert out.role == OrganizationRole.ORG_ADMIN
    assert out.invite_status == "pending"


@pytest.mark.asyncio
async def test_ce_invite_member_rejected(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    with pytest.raises(HTTPException) as exc:
        await create_org_user(
            OrgUserCreate(
                username="member1",
                email="member1@acme.com",
                role=OrganizationRole.MEMBER,
                send_invite_email=False,
            ),
            MagicMock(),
            current_admin=admin,
            db=db_session,
        )
    assert exc.value.status_code == 403
    assert "Enterprise" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_ce_demote_admin_to_member_rejected(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    invited = await create_org_user(
        OrgUserCreate(
            username="coadmin2",
            email="coadmin2@acme.com",
            role=OrganizationRole.ORG_ADMIN,
            send_invite_email=False,
        ),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )
    with pytest.raises(HTTPException) as exc:
        await update_org_user(
            invited.id,
            OrgUserUpdate(role=OrganizationRole.MEMBER),
            MagicMock(),
            current_admin=admin,
            db=db_session,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_deactivated_user_login_returns_inactive_detail(db_session, monkeypatch):
    admin = db_session.query(User).filter(User.username == "admin").first()
    invited = await create_org_user(
        OrgUserCreate(
            username="soon_inactive",
            email="soon_inactive@acme.com",
            role=OrganizationRole.ORG_ADMIN,
            send_invite_email=False,
        ),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )
    # Activate as if invite completed
    user = db_session.query(User).filter(User.id == invited.id).first()
    user.is_active = True
    user.hashed_password = get_password_hash("ActivePass123!")
    membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    membership.is_active = True
    db_session.commit()

    await deactivate_org_user(user.id, MagicMock(), current_admin=admin, db=db_session)

    request = MagicMock(spec=Request)
    request.client = MagicMock(host="127.0.0.1")
    request.headers = {}
    background = BackgroundTasks()
    with pytest.raises(HTTPException) as exc:
        await login_user(
            request,
            UserLogin(username="soon_inactive", password="ActivePass123!"),
            background,
            db_session,
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == "User account is inactive"


def _seed_active_member(db_session, *, username: str, email: str) -> User:
    admin = db_session.query(User).filter(User.username == "admin").first()
    user = User(
        username=username,
        email=email,
        hashed_password=get_password_hash("MemberPass123!"),
        is_active=True,
        is_admin=False,
        org_id=admin.org_id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=admin.org_id,
            user_id=user.id,
            role="member",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
        )
    )
    db_session.commit()
    return user


def test_ce_fallback_deactivates_members_not_admins(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = _seed_active_member(db_session, username="seat_member", email="seat_member@acme.com")

    count = deactivate_members_for_ce_fallback(db_session)
    assert count == 1

    db_session.refresh(member)
    db_session.refresh(admin)
    membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.user_id == member.id)
        .first()
    )
    admin_membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.user_id == admin.id)
        .first()
    )

    assert member.is_active is False
    assert membership.is_active is False
    assert membership.role == "member"
    assert admin.is_active is True
    assert admin_membership.is_active is True
    assert admin_membership.role == "org_admin"


def test_ce_fallback_revokes_pending_member_invites(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    pending = User(
        username="pending_member",
        email="pending_member@acme.com",
        hashed_password=get_password_hash("temp"),
        is_active=False,
        org_id=admin.org_id,
    )
    db_session.add(pending)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=admin.org_id,
            user_id=pending.id,
            role="member",
            is_active=False,
            invite_status=InviteStatus.PENDING,
            invite_token_hash="abc",
        )
    )
    db_session.commit()

    count = deactivate_members_for_ce_fallback(db_session)
    assert count == 1
    membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.user_id == pending.id)
        .first()
    )
    assert membership.invite_status == InviteStatus.REVOKED
    assert membership.invite_token_hash is None
    assert membership.role == "member"


def test_ce_fallback_noop_when_entitled(db_session, monkeypatch):
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: True)
    member = _seed_active_member(db_session, username="keep_member", email="keep_member@acme.com")
    count = deactivate_members_for_ce_fallback(db_session)
    assert count == 0
    db_session.refresh(member)
    assert member.is_active is True


@pytest.mark.asyncio
async def test_capabilities_reports_member_role_false_on_ce(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    caps = await get_org_team_capabilities(current_admin=admin, db=db_session)
    assert caps.member_role is False


@pytest.mark.asyncio
async def test_list_org_users_marks_members_inactive_on_ce(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = _seed_active_member(db_session, username="listed_member", email="listed_member@acme.com")

    result = await list_org_users(current_admin=admin, db=db_session)
    listed = next(u for u in result.users if u.id == member.id)
    assert listed.role == OrganizationRole.MEMBER
    assert listed.is_active is False

    db_session.refresh(member)
    assert member.is_active is False


@pytest.mark.asyncio
async def test_ce_rejects_reactivating_member_without_entitlement(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = _seed_active_member(db_session, username="stuck_member", email="stuck_member@acme.com")
    deactivate_members_for_ce_fallback(db_session)

    with pytest.raises(HTTPException) as exc:
        await update_org_user(
            member.id,
            OrgUserUpdate(is_active=True),
            MagicMock(),
            current_admin=admin,
            db=db_session,
        )
    assert exc.value.status_code == 403
    assert str(exc.value.detail) == MEMBER_ACTIVE_ON_CE_MESSAGE


@pytest.mark.asyncio
async def test_ce_promote_member_to_admin_auto_activates(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = _seed_active_member(db_session, username="promote_me", email="promote_me@acme.com")
    deactivate_members_for_ce_fallback(db_session)

    out = await update_org_user(
        member.id,
        OrgUserUpdate(role=OrganizationRole.ORG_ADMIN, is_active=False),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )
    assert out.role == OrganizationRole.ORG_ADMIN
    assert out.is_active is True

    db_session.refresh(member)
    membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.user_id == member.id)
        .first()
    )
    assert member.is_active is True
    assert member.is_admin is True
    assert membership.is_active is True
    assert membership.role == "org_admin"
    assert membership.invite_status == InviteStatus.ACCEPTED


@pytest.mark.asyncio
async def test_ee_allows_demote_admin_to_member_when_entitled(db_session, monkeypatch):
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: True)
    admin = db_session.query(User).filter(User.username == "admin").first()
    invited = await create_org_user(
        OrgUserCreate(
            username="ee_demote",
            email="ee_demote@acme.com",
            role=OrganizationRole.ORG_ADMIN,
            send_invite_email=False,
        ),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )
    # Activate pending invite so demote exercises an active Admin → Member path.
    user = db_session.query(User).filter(User.id == invited.id).first()
    user.is_active = True
    membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    membership.is_active = True
    membership.invite_status = InviteStatus.ACCEPTED
    db_session.commit()

    out = await update_org_user(
        invited.id,
        OrgUserUpdate(role=OrganizationRole.MEMBER),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )
    assert out.role == OrganizationRole.MEMBER
    assert out.is_active is True


@pytest.mark.asyncio
async def test_demote_admin_strips_project_admin_and_revokes_sessions(db_session, monkeypatch):
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: True)
    from app.models import Project, UserSession
    from datetime import datetime, timedelta, timezone
    import uuid

    admin = db_session.query(User).filter(User.username == "admin").first()
    invited = await create_org_user(
        OrgUserCreate(
            username="demote_acl",
            email="demote_acl@acme.com",
            role=OrganizationRole.ORG_ADMIN,
            send_invite_email=False,
        ),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )
    user = db_session.query(User).filter(User.id == invited.id).first()
    user.is_active = True
    user.is_admin = True
    membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    membership.is_active = True
    membership.invite_status = InviteStatus.ACCEPTED
    project = Project(name="ACL Proj", org_id=admin.org_id, owner_id=user.id, is_active=True)
    db_session.add(project)
    db_session.flush()
    from app.services.member_acl import grant_member_via_group

    grant_member_via_group(
        db_session,
        user,
        project,
        ["project:admin", "analytics:read", "crawl:manage"],
        group_name="Legacy admin",
    )
    db_session.add(
        UserSession(
            user_id=user.id,
            token_jti=f"tok-demote-acl-{uuid.uuid4().hex}",
            is_active=True,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db_session.commit()

    await update_org_user(
        user.id,
        OrgUserUpdate(role=OrganizationRole.MEMBER),
        MagicMock(),
        current_admin=admin,
        db=db_session,
    )

    db_session.refresh(user)
    from app.models import UserGroupMember
    from app.platform.auth import project_permissions_for_user

    assert user.is_admin is False
    assert (
        db_session.query(UserGroupMember).filter(UserGroupMember.user_id == user.id).count() == 0
    )
    assert project_permissions_for_user(db_session, user, project) is None
    assert (
        db_session.query(UserSession)
        .filter(UserSession.user_id == user.id, UserSession.is_active == True)  # noqa: E712
        .count()
        == 0
    )


def test_project_permissions_prefer_membership_over_owner(db_session, monkeypatch):
    from app.platform.auth import project_permissions_for_user
    from app.models import Project

    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: True)
    admin = db_session.query(User).filter(User.username == "admin").first()
    member = _seed_active_member(db_session, username="owner_member", email="owner_member@acme.com")
    project = Project(name="Owned", org_id=admin.org_id, owner_id=member.id, is_active=True)
    db_session.add(project)
    db_session.flush()
    from app.services.member_acl import grant_member_via_group

    grant_member_via_group(db_session, member, project, ["project:read"])
    db_session.commit()

    perms = project_permissions_for_user(db_session, member, project)
    assert perms == ["project:read"]
    assert "project:admin" not in perms


def test_replace_member_projects_never_grants_workspace_create(db_session, monkeypatch):
    """Direct project ACL writes never grant workspace create."""
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: True)
    from app.schemas import OrgUserProjectsOut
    from app.services.org_team import replace_member_projects

    admin = db_session.query(User).filter(User.username == "admin").first()
    member = _seed_active_member(db_session, username="create_only", email="create_only@acme.com")

    out = replace_member_projects(
        db_session,
        admin,
        member.id,
        OrgUserProjectsOut(user_id=member.id, assignments=[], can_create_projects=True),
    )
    assert out.can_create_projects is False
    assert "project:create" not in (out.workspace_permissions or [])


@pytest.mark.asyncio
async def test_member_without_create_cannot_create_project_admin_still_can(db_session, monkeypatch):
    """Members cannot create via team ACL; org admin create_project remains unchanged."""
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: True)
    from fastapi import HTTPException

    from app.platform.auth import get_accessible_project_ids
    from app.routes.projects import create_project
    from app.schemas import ProjectCreate

    admin = db_session.query(User).filter(User.username == "admin").first()
    member = _seed_active_member(
        db_session, username="no_create_member", email="no_create_member@acme.com"
    )
    with pytest.raises(HTTPException) as denied:
        await create_project(
            ProjectCreate(name="Member Should Fail", description=None),
            MagicMock(),
            db=db_session,
            current_user=member,
        )
    assert denied.value.status_code == 403

    created = await create_project(
        ProjectCreate(name="Admin Created Still Works", description=None),
        MagicMock(),
        db=db_session,
        current_user=admin,
    )
    assert created.name == "Admin Created Still Works"
    assert created.id in get_accessible_project_ids(db_session, admin)
