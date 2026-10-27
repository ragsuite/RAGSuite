"""Read members can view training-run details; write stays required to mutate."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import (
    Base,
    Organization,
    OrganizationMember,
    Project,
    User,
)
from app.services.member_acl import grant_member_via_group
from app.routes.crawl import _can_manage_project, _can_view_project


@pytest.fixture()
def ctx():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    now = datetime.now(timezone.utc)
    org = Organization(name="Org", slug="org")
    session.add(org)
    session.flush()

    owner = User(
        username="owner",
        email="owner@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    member = User(
        username="member",
        email="member@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    outsider = User(
        username="outsider",
        email="outsider@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    session.add_all([owner, member, outsider])
    session.flush()
    session.add_all(
        [
            OrganizationMember(org_id=org.id, user_id=owner.id, role="org_admin", is_active=True),
            OrganizationMember(org_id=org.id, user_id=member.id, role="member", is_active=True),
            OrganizationMember(org_id=org.id, user_id=outsider.id, role="member", is_active=True),
        ]
    )
    project = Project(name="Assigned", owner_id=owner.id, org_id=org.id, is_active=True)
    session.add(project)
    session.flush()
    session.commit()
    session.refresh(owner)
    session.refresh(member)
    session.refresh(outsider)
    session.refresh(project)
    yield {
        "db": session,
        "project": project,
        "owner": owner,
        "member": member,
        "outsider": outsider,
    }
    session.close()


def _grant(ctx, permissions):
    grant_member_via_group(ctx["db"], ctx["member"], ctx["project"], permissions)
    ctx["db"].commit()


def test_read_member_can_view_but_not_manage(ctx):
    _grant(ctx, ["project:read", "crawl_domain:read"])
    assert _can_view_project(ctx["db"], ctx["member"], ctx["project"].id) is True
    assert _can_manage_project(ctx["db"], ctx["member"], ctx["project"].id) is False


def test_write_member_can_view_and_manage(ctx):
    _grant(ctx, ["project:read", "crawl_domain:write"])
    assert _can_view_project(ctx["db"], ctx["member"], ctx["project"].id) is True
    assert _can_manage_project(ctx["db"], ctx["member"], ctx["project"].id) is True


def test_owner_can_view_and_manage(ctx):
    assert _can_view_project(ctx["db"], ctx["owner"], ctx["project"].id) is True
    assert _can_manage_project(ctx["db"], ctx["owner"], ctx["project"].id) is True


def test_outsider_cannot_view_or_manage(ctx):
    _grant(ctx, ["project:read", "crawl_domain:read"])
    assert _can_view_project(ctx["db"], ctx["outsider"], ctx["project"].id) is False
    assert _can_manage_project(ctx["db"], ctx["outsider"], ctx["project"].id) is False
