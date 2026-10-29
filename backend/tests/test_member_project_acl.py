"""Member project ACL and active-project resolution tests."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base,
    InviteStatus,
    Organization,
    OrganizationMember,
    Project,
    ProjectMember,
    User,
)
from app.services.member_acl import grant_member_via_group


from app.auth import (
    get_accessible_project_ids,
    project_permissions_for_user,
    resolve_active_project,
    get_active_project,
    is_org_admin_user,
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

    main_project = Project(
        name="Main Project",
        description="Default project",
        owner_id=admin.id,
        org_id=org.id,
        is_active=True,
    )
    assigned_project = Project(
        name="Nitsan AI",
        description="Assigned project",
        owner_id=admin.id,
        org_id=org.id,
        is_active=False,
    )
    rogue_project = Project(
        name="asdf",
        description="Created by member",
        owner_id=member.id,
        org_id=org.id,
        is_active=False,
    )
    session.add_all([main_project, assigned_project, rogue_project])
    session.flush()
    grant_member_via_group(
        session,
        member,
        assigned_project,
        ["project:read", "chat:use", "search:use"],
    )
    session.commit()
    yield session, org, admin, member, main_project, assigned_project, rogue_project
    session.close()


def test_member_only_sees_assigned_projects(org_context):
    session, _org, _admin, member, main_project, assigned_project, rogue_project = org_context
    accessible = get_accessible_project_ids(session, member)
    assert accessible == [assigned_project.id]
    assert main_project.id not in accessible
    assert rogue_project.id not in accessible


@pytest.mark.asyncio
async def test_member_active_project_is_assigned_not_org_default(org_context):
    session, _org, _admin, member, main_project, assigned_project, _rogue = org_context
    preferred = resolve_active_project(session, member)
    assert preferred is not None
    assert preferred.id == assigned_project.id
    assert preferred.id != main_project.id

    active = await get_active_project(current_user=member, db=session)
    assert active.id == assigned_project.id


def test_member_is_not_org_admin(org_context):
    session, _org, admin, member, *_rest = org_context
    assert is_org_admin_user(session, admin) is True
    assert is_org_admin_user(session, member) is False


def test_member_active_project_follows_user_selection(org_context):
    from app.auth import resolve_active_project, set_user_active_project

    session, _org, admin, member, _main_project, assigned_project, _rogue = org_context
    first_at = assigned_project.created_at or datetime.now(timezone.utc)
    assigned_project.created_at = first_at
    second = Project(
        name="T3Planet",
        owner_id=admin.id,
        org_id=assigned_project.org_id,
        is_active=False,
        created_at=first_at + timedelta(seconds=1),
    )
    session.add(second)
    session.flush()
    grant_member_via_group(session, member, second, ["project:read", "chat:use"])
    session.commit()

    assert resolve_active_project(session, member).id == assigned_project.id

    set_user_active_project(session, member, second)
    session.refresh(member)
    assert member.active_project_id == second.id
    assert resolve_active_project(session, member).id == second.id


def test_direct_grant_opens_project_without_group(org_context):
    session, _org, _admin, member, _main, assigned_project, _rogue = org_context
    session.query(ProjectMember).filter(ProjectMember.user_id == member.id).delete()
    session.commit()
    # Drop group grants by removing the member from all groups created in the fixture.
    from app.models import UserGroupMember

    session.query(UserGroupMember).filter(UserGroupMember.user_id == member.id).delete()
    session.commit()
    assert get_accessible_project_ids(session, member) == []
    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=["project:read", "documents:write"],
        )
    )
    session.commit()
    assert get_accessible_project_ids(session, member) == [assigned_project.id]
    perms = project_permissions_for_user(session, member, assigned_project)
    assert "documents:write" in (perms or [])


def test_direct_write_overrides_group_read(org_context):
    session, _org, _admin, member, _main, assigned_project, _rogue = org_context
    from app.models import UserGroupMember
    from app.services.project_permissions import compose_direct_acl

    session.query(UserGroupMember).filter(UserGroupMember.user_id == member.id).delete()
    session.query(ProjectMember).filter(ProjectMember.user_id == member.id).delete()
    session.commit()
    grant_member_via_group(session, member, assigned_project, ["project:read", "documents:read"], group_name="Readers")
    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=compose_direct_acl(["project:read", "documents:write"]),
        )
    )
    session.commit()
    perms = project_permissions_for_user(session, member, assigned_project) or []
    assert "documents:write" in perms


def test_direct_read_overrides_group_write(org_context):
    session, _org, _admin, member, _main, assigned_project, _rogue = org_context
    from app.models import UserGroupMember
    from app.services.project_permissions import compose_direct_acl

    session.query(UserGroupMember).filter(UserGroupMember.user_id == member.id).delete()
    session.query(ProjectMember).filter(ProjectMember.user_id == member.id).delete()
    session.commit()
    grant_member_via_group(session, member, assigned_project, ["project:read", "documents:write"], group_name="Writers")
    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=compose_direct_acl(["project:read", "documents:read"]),
        )
    )
    session.commit()
    perms = project_permissions_for_user(session, member, assigned_project) or []
    assert "documents:read" in perms
    assert "documents:write" not in perms


def test_direct_module_deny_blocks_group_write(org_context):
    session, _org, _admin, member, _main, assigned_project, _rogue = org_context
    from app.models import UserGroupMember
    from app.services.project_permissions import compose_direct_acl

    session.query(UserGroupMember).filter(UserGroupMember.user_id == member.id).delete()
    session.query(ProjectMember).filter(ProjectMember.user_id == member.id).delete()
    session.commit()
    grant_member_via_group(
        session,
        member,
        assigned_project,
        ["project:read", "documents:write", "chatbot_chat:read"],
        group_name="Staff",
    )
    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=compose_direct_acl([], denied_modules=["documents"]),
        )
    )
    session.commit()
    perms = project_permissions_for_user(session, member, assigned_project) or []
    assert "documents:write" not in perms
    assert "documents:read" not in perms
    assert "chatbot_chat:read" in perms


def test_project_none_blocks_group_project(org_context):
    session, _org, _admin, member, _main, assigned_project, _rogue = org_context
    from app.services.project_permissions import compose_direct_acl

    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=compose_direct_acl([], project_denied=True),
        )
    )
    session.commit()
    assert assigned_project.id not in get_accessible_project_ids(session, member)
    assert project_permissions_for_user(session, member, assigned_project) is None


def test_clearing_direct_keeps_group_access(org_context):
    session, _org, _admin, member, _main, assigned_project, _rogue = org_context
    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=["project:read", "documents:write"],
        )
    )
    session.commit()
    session.query(ProjectMember).filter(
        ProjectMember.user_id == member.id, ProjectMember.project_id == assigned_project.id
    ).delete()
    session.commit()
    assert get_accessible_project_ids(session, member) == [assigned_project.id]


def test_neither_source_denies_project(org_context):
    session, _org, _admin, member, main_project, assigned_project, _rogue = org_context
    from app.models import UserGroupMember

    session.query(UserGroupMember).filter(UserGroupMember.user_id == member.id).delete()
    session.query(ProjectMember).filter(ProjectMember.user_id == member.id).delete()
    session.commit()
    assert get_accessible_project_ids(session, member) == []
    assert project_permissions_for_user(session, member, assigned_project) is None
    assert project_permissions_for_user(session, member, main_project) is None
