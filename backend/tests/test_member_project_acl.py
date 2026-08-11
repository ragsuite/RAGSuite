"""Member project ACL and active-project resolution tests."""

from datetime import datetime, timezone
import sys
import types

import pytest
from fastapi import HTTPException
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


def _install_optional_stubs() -> None:
    if "chromadb" in sys.modules:
        return
    chromadb = types.ModuleType("chromadb")
    chromadb.config = types.ModuleType("chromadb.config")
    chromadb.config.Settings = object
    sys.modules["chromadb"] = chromadb
    sys.modules["chromadb.config"] = chromadb.config


_install_optional_stubs()

from app.auth import (
    get_accessible_project_ids,
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
    session.add(
        ProjectMember(
            project_id=assigned_project.id,
            user_id=member.id,
            permissions=["project:read", "chat:use", "search:use"],
            granted_by=admin.id,
        )
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
    second = Project(
        name="T3Planet",
        owner_id=admin.id,
        org_id=assigned_project.org_id,
        is_active=False,
    )
    session.add(second)
    session.flush()
    session.add(
        ProjectMember(
            project_id=second.id,
            user_id=member.id,
            permissions=["project:read", "chat:use"],
            granted_by=admin.id,
        )
    )
    session.commit()

    assert resolve_active_project(session, member).id == assigned_project.id

    set_user_active_project(session, member, second)
    session.refresh(member)
    assert member.active_project_id == second.id
    assert resolve_active_project(session, member).id == second.id
