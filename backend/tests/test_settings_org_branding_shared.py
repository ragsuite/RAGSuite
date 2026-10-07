"""Org-scoped workspace branding is shared by all members/admins."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Organization, OrganizationMember, Settings, User
from app.schemas import SettingsCreate


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.mark.asyncio
async def test_invited_admin_sees_org_logo_saved_by_orgadmin(db_session, monkeypatch):
    from app.routes import settings as settings_routes

    monkeypatch.setattr(settings_routes, "_can_customize_workspace_brand", lambda: True)

    org = Organization(name="NITSAN", slug="nitsan")
    db_session.add(org)
    db_session.flush()

    orgadmin = User(
        username="orgadmin",
        email="orgadmin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    invited = User(
        username="nitsan_ragsuite",
        email="phone.nitsan@gmail.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add_all([orgadmin, invited])
    db_session.flush()
    db_session.add_all(
        [
            OrganizationMember(
                org_id=org.id, user_id=orgadmin.id, role="org_admin", is_active=True
            ),
            OrganizationMember(
                org_id=org.id, user_id=invited.id, role="org_admin", is_active=True
            ),
        ]
    )
    db_session.commit()

    logo = "data:image/png;base64,nitsan-logo"
    out = await settings_routes.update_settings(
        settings_data=SettingsCreate(
            org_name="NITSAN",
            logo_data_url=logo,
            primary_color="#2E6A4E",
        ),
        db=db_session,
        current_user=orgadmin,
    )
    assert out.logo_data_url == logo

    # Invited admin has no personal settings row — still receives org logo.
    invited_out = settings_routes.get_settings(
        db=db_session,
        auth={"type": "user", "user": invited, "user_id": invited.id},
    )
    assert invited_out.org_name == "NITSAN"
    assert invited_out.logo_data_url == logo
    assert invited_out.primary_color == "#2E6A4E"


def test_invited_admin_sees_legacy_peer_logo_before_org_backfill(db_session, monkeypatch):
    from app.routes import settings as settings_routes

    monkeypatch.setattr(settings_routes, "_can_customize_workspace_brand", lambda: True)

    org = Organization(name="NITSAN", slug="nitsan-legacy")
    db_session.add(org)
    db_session.flush()

    orgadmin = User(
        username="orgadmin",
        email="orgadmin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    invited = User(
        username="invited_admin",
        email="invited@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add_all([orgadmin, invited])
    db_session.flush()
    db_session.add_all(
        [
            OrganizationMember(
                org_id=org.id, user_id=orgadmin.id, role="org_admin", is_active=True
            ),
            OrganizationMember(
                org_id=org.id, user_id=invited.id, role="org_admin", is_active=True
            ),
            Settings(
                user_id=orgadmin.id,
                org_name="NITSAN",
                logo_data_url="data:image/png;base64,legacy",
                primary_color="#2E6A4E",
            ),
        ]
    )
    db_session.commit()

    invited_out = settings_routes.get_settings(
        db=db_session,
        auth={"type": "user", "user": invited, "user_id": invited.id},
    )
    assert invited_out.logo_data_url == "data:image/png;base64,legacy"
    assert invited_out.primary_color == "#2E6A4E"
