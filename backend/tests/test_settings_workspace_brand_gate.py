"""Workspace branding white-label gate (CE forces RAGSuite name + null logo)."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Organization, Settings, User
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


@pytest.fixture
def workspace_brand(monkeypatch):
    from app.routes import settings as settings_routes

    state = {"allowed": False}

    def _can():
        return state["allowed"]

    monkeypatch.setattr(settings_routes, "_can_customize_workspace_brand", _can)
    return SimpleNamespace(routes=settings_routes, state=state)


def _seed_user_with_settings(db_session, *, org_name="Acme", logo="data:image/png;base64,abc"):
    org = Organization(name="Acme Corp", slug="acme-corp")
    db_session.add(org)
    db_session.flush()
    user = User(
        username="orgadmin",
        email="orgadmin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        Settings(
            user_id=user.id,
            org_name=org_name,
            logo_data_url=logo,
            primary_color="#2E6A4E",
        )
    )
    db_session.commit()
    return user, org


def test_effective_org_name_forced_without_entitlement(workspace_brand):
    workspace_brand.state["allowed"] = False
    assert workspace_brand.routes._effective_workspace_org_name("Acme") == "RAGSuite"
    assert workspace_brand.routes._effective_workspace_org_name(None) == "RAGSuite"


def test_effective_org_name_allows_custom_with_entitlement(workspace_brand):
    workspace_brand.state["allowed"] = True
    assert workspace_brand.routes._effective_workspace_org_name("Acme") == "Acme"
    assert workspace_brand.routes._effective_workspace_org_name("  ") == "RAGSuite"


def test_effective_logo_forced_null_without_entitlement(workspace_brand):
    workspace_brand.state["allowed"] = False
    assert workspace_brand.routes._effective_workspace_logo_data_url("data:image/png;base64,x") is None


def test_effective_logo_allows_custom_with_entitlement(workspace_brand):
    workspace_brand.state["allowed"] = True
    assert (
        workspace_brand.routes._effective_workspace_logo_data_url("data:image/png;base64,x")
        == "data:image/png;base64,x"
    )
    assert workspace_brand.routes._effective_workspace_logo_data_url("  ") is None


def test_get_settings_strips_brand_without_entitlement(db_session, workspace_brand):
    workspace_brand.state["allowed"] = False
    user, _org = _seed_user_with_settings(db_session)
    out = workspace_brand.routes.get_settings(
        db=db_session,
        auth={"type": "user", "user": user, "user_id": user.id},
    )
    assert out.org_name == "RAGSuite"
    assert out.logo_data_url is None
    assert out.primary_color == "#2E6A4E"


def test_get_settings_keeps_brand_with_entitlement(db_session, workspace_brand):
    workspace_brand.state["allowed"] = True
    user, org = _seed_user_with_settings(db_session)
    # Org-scoped branding: name comes from Organization; logo falls back to user settings.
    out = workspace_brand.routes.get_settings(
        db=db_session,
        auth={"type": "user", "user": user, "user_id": user.id},
    )
    assert out.org_name == org.name
    assert out.logo_data_url == "data:image/png;base64,abc"


@pytest.mark.asyncio
async def test_update_settings_forces_ce_brand_and_org_name(db_session, workspace_brand):
    workspace_brand.state["allowed"] = False
    user, org = _seed_user_with_settings(db_session)
    out = await workspace_brand.routes.update_settings(
        settings_data=SettingsCreate(
            org_name="Hacked Inc",
            logo_data_url="data:image/png;base64,hack",
            primary_color="#B6802E",
        ),
        db=db_session,
        current_user=user,
    )
    assert out.org_name == "RAGSuite"
    assert out.logo_data_url is None
    assert out.primary_color == "#B6802E"

    stored = db_session.query(Settings).filter(Settings.user_id == user.id).first()
    assert stored.org_name == "RAGSuite"
    assert stored.logo_data_url is None
    assert stored.primary_color == "#B6802E"

    db_session.refresh(org)
    assert org.name == "RAGSuite"
    # Non-default slug preserved
    assert org.slug == "acme-corp"


@pytest.mark.asyncio
async def test_update_settings_allows_ee_brand(db_session, workspace_brand):
    workspace_brand.state["allowed"] = True
    user, org = _seed_user_with_settings(db_session)
    out = await workspace_brand.routes.update_settings(
        settings_data=SettingsCreate(
            org_name="Partner Co",
            logo_data_url="data:image/png;base64,ee",
            primary_color="#1E3A30",
        ),
        db=db_session,
        current_user=user,
    )
    assert out.org_name == "Partner Co"
    assert out.logo_data_url == "data:image/png;base64,ee"
    assert out.primary_color == "#1E3A30"
    db_session.refresh(org)
    assert org.name == "Partner Co"
    assert org.logo_data_url == "data:image/png;base64,ee"
    assert org.primary_color == "#1E3A30"


def test_can_customize_workspace_brand_false_when_dual_gate_denies(monkeypatch):
    from app.routes import settings as settings_routes

    monkeypatch.setattr(
        "app.platform.ee_feature_gate.can_use_white_label",
        lambda: False,
    )
    assert settings_routes._can_customize_workspace_brand() is False


def test_can_customize_workspace_brand_true_when_dual_gate_allows(monkeypatch):
    from app.routes import settings as settings_routes

    monkeypatch.setattr(
        "app.platform.ee_feature_gate.can_use_white_label",
        lambda: True,
    )
    assert settings_routes._can_customize_workspace_brand() is True


def test_can_customize_workspace_brand_requires_module_not_license_alone(monkeypatch):
    from app.routes import settings as settings_routes

    monkeypatch.setattr(
        "app.platform.entitlement_deps.has_feature_entitlement",
        lambda *features: True,
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate._module_loaded",
        lambda module_id: False,
    )
    assert settings_routes._can_customize_workspace_brand() is False


@pytest.mark.asyncio
async def test_update_settings_forces_ce_when_dual_gate_fails(db_session, monkeypatch):
    """License-without-module (dual gate deny) still strips custom name/logo."""
    from app.routes import settings as settings_routes

    monkeypatch.setattr(
        "app.platform.ee_feature_gate.can_use_white_label",
        lambda: False,
    )
    user, org = _seed_user_with_settings(db_session)
    out = await settings_routes.update_settings(
        settings_data=SettingsCreate(
            org_name="Hacked Inc",
            logo_data_url="data:image/png;base64,hack",
            primary_color="#B6802E",
        ),
        db=db_session,
        current_user=user,
    )
    assert out.org_name == "RAGSuite"
    assert out.logo_data_url is None
    assert out.primary_color == "#B6802E"
    db_session.refresh(org)
    assert org.name == "RAGSuite"
