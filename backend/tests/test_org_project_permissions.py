"""Org project listing and per-project permission isolation tests."""

from datetime import datetime, timezone
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import resolve_scoped_project
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

    nitsan = Project(name="Nitsan AI", owner_id=admin.id, org_id=org.id, is_active=True)
    t3planet = Project(name="T3Planet", owner_id=admin.id, org_id=org.id, is_active=False)
    session.add_all([nitsan, t3planet])
    session.flush()
    session.add_all(
        [
            ProjectMember(
                project_id=nitsan.id,
                user_id=member.id,
                permissions=["project:read", "chat:use", "search:use", "analytics:read"],
                granted_by=admin.id,
            ),
            ProjectMember(
                project_id=t3planet.id,
                user_id=member.id,
                permissions=["project:read", "chat:use"],
                granted_by=admin.id,
            ),
        ]
    )
    session.commit()
    yield session, org, admin, member, nitsan, t3planet
    session.close()


def test_org_projects_include_all_non_temp_projects(org_context):
    session, org, admin, _member, nitsan, t3planet = org_context
    rows = (
        session.query(Project)
        .filter(Project.org_id == org.id)
        .order_by(Project.created_at.desc())
        .all()
    )
    names = {row.name for row in rows}
    assert "Nitsan AI" in names
    assert "T3Planet" in names
    assert nitsan.org_id == org.id
    assert t3planet.org_id == org.id


def test_member_analytics_access_uses_assignment_not_ownership(org_context):
    session, _org, admin, member, nitsan, t3planet = org_context
    resolved = resolve_scoped_project(
        session,
        member,
        nitsan.id,
        required_permission="analytics:read",
        active_fallback=nitsan,
    )
    assert resolved.id == nitsan.id

    with pytest.raises(HTTPException) as exc:
        resolve_scoped_project(
            session,
            member,
            t3planet.id,
            required_permission="analytics:read",
            active_fallback=t3planet,
        )
    assert exc.value.status_code == 404
    assert exc.value.detail == "Project not found or access denied"


def test_project_permissions_are_isolated_per_project(org_context):
    session, _org, _admin, member, nitsan, t3planet = org_context
    nitsan_row = (
        session.query(ProjectMember)
        .filter(ProjectMember.user_id == member.id, ProjectMember.project_id == nitsan.id)
        .one()
    )
    t3_row = (
        session.query(ProjectMember)
        .filter(ProjectMember.user_id == member.id, ProjectMember.project_id == t3planet.id)
        .one()
    )
    assert "analytics:read" in (nitsan_row.permissions or [])
    assert "analytics:read" not in (t3_row.permissions or [])
    assert nitsan_row.permissions != t3_row.permissions


def test_replace_assignments_keeps_distinct_permissions(org_context):
    session, org, admin, member, nitsan, t3planet = org_context
    org_project_ids = [
        row[0] for row in session.query(Project.id).filter(Project.org_id == org.id).all()
    ]
    session.query(ProjectMember).filter(
        ProjectMember.user_id == member.id,
        ProjectMember.project_id.in_(org_project_ids),
    ).delete(synchronize_session=False)
    session.add_all(
        [
            ProjectMember(
                project_id=nitsan.id,
                user_id=member.id,
                permissions=["project:read", "analytics:read"],
                granted_by=admin.id,
            ),
            ProjectMember(
                project_id=t3planet.id,
                user_id=member.id,
                permissions=["project:read", "chat:use"],
                granted_by=admin.id,
            ),
        ]
    )
    session.commit()

    rows = (
        session.query(ProjectMember)
        .filter(ProjectMember.user_id == member.id)
        .order_by(ProjectMember.project_id)
        .all()
    )
    by_project = {row.project_id: list(row.permissions or []) for row in rows}
    assert by_project[nitsan.id] == ["project:read", "analytics:read"]
    assert by_project[t3planet.id] == ["project:read", "chat:use"]
