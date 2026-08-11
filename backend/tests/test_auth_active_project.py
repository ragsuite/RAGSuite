from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import get_active_project
from app.models import Base, Organization, OrganizationMember, Project, User


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    org = Organization(name="Acme", slug="acme")
    session.add(org)
    session.flush()
    user = User(
        username="admin",
        email="admin@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.flush()
    session.add(
        OrganizationMember(org_id=org.id, user_id=user.id, role="org_admin", is_active=True),
    )
    session.commit()
    yield session, user, org
    session.close()


@pytest.mark.asyncio
async def test_get_active_project_raises_404_when_no_projects(db_session):
    session, user, _org = db_session
    with pytest.raises(HTTPException) as exc:
        await get_active_project(current_user=user, db=session)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_active_project_activates_non_temp_project(db_session):
    session, user, org = db_session
    project = Project(name="Main", owner_id=user.id, org_id=org.id, is_active=False)
    session.add(project)
    session.commit()
    got = await get_active_project(current_user=user, db=session)
    assert got.id == project.id
    assert got.is_active is True


@pytest.mark.asyncio
async def test_get_active_project_falls_back_to_temp_project(db_session):
    session, user, org = db_session
    project = Project(name="__TEMP_ONBOARDING_123", owner_id=user.id, org_id=org.id, is_active=False)
    session.add(project)
    session.commit()
    got = await get_active_project(current_user=user, db=session)
    assert got.id == project.id
    assert got.is_active is True


@pytest.mark.asyncio
async def test_get_active_project_rejects_org_less_project(db_session):
    """One-org architecture: projects without org_id are not usable."""
    session, user, _org = db_session
    orphan_owned = Project(name="Legacy Owned", owner_id=user.id, org_id=None, is_active=False)
    session.add(orphan_owned)
    session.commit()

    with pytest.raises(HTTPException) as exc:
        await get_active_project(current_user=user, db=session)
    assert exc.value.status_code == 404