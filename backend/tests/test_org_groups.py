"""User group CRUD and Member ACL union tests."""

from datetime import datetime, timezone

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
    UserGroup,
    UserGroupMember,
)
from app.platform.auth import get_accessible_project_ids, project_permissions_for_user
from app.schemas import OrgGroupCreate, OrgGroupUpdate, OrgProjectAssignment
from app.services.member_acl import grant_member_via_group
from app.services.org_groups import (
    add_group_member,
    create_org_group,
    delete_org_group,
    list_org_groups,
    replace_group_projects,
    update_org_group,
)
from app.services.org_team import USER_PROJECT_ACL_GONE_MESSAGE, list_org_members, replace_member_projects
from app.services.project_permissions import normalize_member_permissions

pytestmark = pytest.mark.ee


@pytest.fixture(autouse=True)
def _entitle_organization(monkeypatch):
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: True)


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    now = datetime.now(timezone.utc)
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
        email_verified_at=now,
    )
    member = User(
        username="member",
        email="member@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=now,
    )
    other = User(
        username="other",
        email="other@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=now,
    )
    session.add_all([admin, member, other])
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
            OrganizationMember(
                org_id=org.id,
                user_id=other.id,
                role="member",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            ),
        ]
    )
    project_a = Project(name="A", owner_id=admin.id, org_id=org.id, is_active=True)
    project_b = Project(name="B", owner_id=admin.id, org_id=org.id, is_active=False)
    session.add_all([project_a, project_b])
    session.commit()
    yield session, org, admin, member, other, project_a, project_b
    session.close()


def test_group_name_unique_per_tenant(ctx):
    session, _org, admin, *_rest = ctx
    create_org_group(session, admin, OrgGroupCreate(name="Editors"))
    with pytest.raises(HTTPException) as exc:
        create_org_group(session, admin, OrgGroupCreate(name="editors"))
    assert exc.value.status_code == 409


def test_admin_cannot_join_group(ctx):
    session, _org, admin, *_rest = ctx
    group = create_org_group(session, admin, OrgGroupCreate(name="Editors"))
    with pytest.raises(HTTPException) as exc:
        add_group_member(session, admin, group.id, admin.id)
    assert exc.value.status_code == 400


def test_member_union_across_groups(ctx):
    session, _org, admin, member, _other, project_a, project_b = ctx
    editors = grant_member_via_group(
        session,
        member,
        project_a,
        ["project:read", "documents:write"],
        group_name="Editors",
    )
    analysts = grant_member_via_group(
        session,
        member,
        project_a,
        ["project:read", "analytics:read"],
        group_name="Analysts",
    )
    grant_member_via_group(
        session,
        member,
        project_b,
        ["project:read", "chat:use"],
        group_name="Analysts",
    )
    session.commit()

    ids = set(get_accessible_project_ids(session, member))
    assert ids == {project_a.id, project_b.id}
    perms_a = project_permissions_for_user(session, member, project_a)
    assert "documents:write" in (perms_a or [])
    assert "analytics:read" in (perms_a or [])
    perms_b = project_permissions_for_user(session, member, project_b)
    assert set(perms_b or []) == set(normalize_member_permissions(["project:read", "chat:use"]))
    listed = list_org_groups(session, admin)
    assert listed.total == 2
    by_name = {row.name: row for row in listed.groups}
    assert by_name["Editors"].member_count == 1
    assert by_name["Analysts"].project_count == 2
    assert editors.id != analysts.id


def test_no_group_means_no_project_access(ctx):
    session, _org, _admin, member, _other, project_a, _project_b = ctx
    assert get_accessible_project_ids(session, member) == []
    assert project_permissions_for_user(session, member, project_a) is None


def test_delete_group_keeps_users(ctx):
    session, _org, admin, member, _other, project_a, _project_b = ctx
    group = grant_member_via_group(session, member, project_a, ["project:read"], group_name="Temp")
    session.commit()
    assert get_accessible_project_ids(session, member) == [project_a.id]
    delete_org_group(session, admin, group.id)
    session.refresh(member)
    assert member.id is not None
    assert get_accessible_project_ids(session, member) == []


def test_replace_user_projects_is_gone(ctx):
    session, _org, admin, member, *_rest = ctx
    with pytest.raises(HTTPException) as exc:
        replace_member_projects(session, admin, member.id, None)
    assert exc.value.status_code == 410
    assert USER_PROJECT_ACL_GONE_MESSAGE in str(exc.value.detail)


def test_group_project_replace_strips_project_admin(ctx):
    session, _org, admin, member, _other, project_a, _project_b = ctx
    group = create_org_group(session, admin, OrgGroupCreate(name="Editors"))
    add_group_member(session, admin, group.id, member.id)
    replace_group_projects(
        session,
        admin,
        group.id,
        [
            OrgProjectAssignment(
                project_id=project_a.id,
                permissions=["project:admin", "chat:use"],
            )
        ],
    )
    perms = project_permissions_for_user(session, member, project_a)
    assert "project:admin" not in (perms or [])
    assert "chatbot_chat:read" in (perms or [])


def test_admin_bypass_ignores_groups(ctx):
    session, _org, admin, _member, _other, project_a, project_b = ctx
    ids = set(get_accessible_project_ids(session, admin))
    assert project_a.id in ids
    assert project_b.id in ids
    assert project_permissions_for_user(session, admin, project_a) == ["project:admin"]


def test_update_group_renames(ctx):
    session, _org, admin, *_rest = ctx
    group = create_org_group(session, admin, OrgGroupCreate(name="Editors", description="x"))
    updated = update_org_group(session, admin, group.id, OrgGroupUpdate(name="Writers"))
    assert updated.name == "Writers"


def test_ce_cannot_list_groups(ctx, monkeypatch):
    monkeypatch.setattr("app.services.org_team.has_feature_entitlement", lambda *features: False)
    session, _org, admin, *_rest = ctx
    with pytest.raises(HTTPException) as exc:
        list_org_groups(session, admin)
    assert exc.value.status_code == 403


def test_list_members_includes_groups(ctx):
    session, _org, admin, member, _other, project_a, _project_b = ctx
    grant_member_via_group(session, member, project_a, ["project:read"], group_name="Editors")
    session.commit()
    listed = list_org_members(session, admin)
    by_name = {row.username: row for row in listed.users}
    assert by_name["member"].groups[0].name == "Editors"


def test_list_org_members_omit_limit_returns_all(ctx):
    session, _org, admin, *_rest = ctx
    listed = list_org_members(session, admin)
    paged = list_org_members(session, admin, limit=1, offset=0)
    assert listed.total >= 2
    assert len(listed.users) == listed.total
    assert len(paged.users) == 1
    assert paged.total == listed.total


def test_backfill_clusters_identical_member_grants(ctx):
    import importlib.util
    from pathlib import Path

    session, org, _admin, member, other, project_a, _project_b = ctx
    session.add_all(
        [
            ProjectMember(project_id=project_a.id, user_id=member.id, permissions=["project:read"]),
            ProjectMember(project_id=project_a.id, user_id=other.id, permissions=["project:read"]),
        ]
    )
    session.commit()

    path = Path(__file__).resolve().parents[1] / "alembic/versions/d5e6f7a8b9c0_user_groups_and_grants.py"
    spec = importlib.util.spec_from_file_location("user_groups_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    with session.get_bind().connect() as conn:
        module._backfill_member_grants(conn)
        conn.commit()
    session.expire_all()

    groups = session.query(UserGroup).filter(UserGroup.org_id == org.id).all()
    assert len(groups) == 1
    assert groups[0].name == "Migrated access"
    member_ids = {
        row.user_id
        for row in session.query(UserGroupMember).filter(UserGroupMember.group_id == groups[0].id).all()
    }
    assert member_ids == {member.id, other.id}
    remaining = (
        session.query(ProjectMember)
        .filter(ProjectMember.user_id.in_([member.id, other.id]))
        .count()
    )
    assert remaining == 0
    assert get_accessible_project_ids(session, member) == [project_a.id]
    assert project_permissions_for_user(session, member, project_a) == ["project:read"]


def test_list_org_groups_pagination(ctx):
    session, _org, admin, *_rest = ctx
    create_org_group(session, admin, OrgGroupCreate(name="Analysts"))
    create_org_group(session, admin, OrgGroupCreate(name="Editors"))
    create_org_group(session, admin, OrgGroupCreate(name="Viewers"))

    unpaged = list_org_groups(session, admin)
    assert unpaged.total == 3
    assert [row.name for row in unpaged.groups] == ["Analysts", "Editors", "Viewers"]

    first = list_org_groups(session, admin, limit=2, offset=0)
    assert first.total == 3
    assert [row.name for row in first.groups] == ["Analysts", "Editors"]

    second = list_org_groups(session, admin, limit=2, offset=2)
    assert second.total == 3
    assert [row.name for row in second.groups] == ["Viewers"]

    filtered = list_org_groups(session, admin, q="edit", limit=10, offset=0)
    assert filtered.total == 1
    assert [row.name for row in filtered.groups] == ["Editors"]
