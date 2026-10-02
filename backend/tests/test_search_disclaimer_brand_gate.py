"""Search white-label disclaimer brand gate (CE forces defaults)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.fixture
def search_brand(monkeypatch):
    from app.routes import search_models as search_routes

    state = {"allowed": False}

    def _can():
        return state["allowed"]

    monkeypatch.setattr(search_routes, "_can_customize_search_brand", _can)
    return SimpleNamespace(routes=search_routes, state=state)


def test_effective_show_disclaimer_forced_without_entitlement(search_brand):
    search_brand.state["allowed"] = False
    assert search_brand.routes._effective_show_disclaimer(False) is True
    assert search_brand.routes._effective_show_disclaimer(None) is True


def test_effective_show_disclaimer_allows_custom_with_entitlement(search_brand):
    search_brand.state["allowed"] = True
    assert search_brand.routes._effective_show_disclaimer(False) is False
    assert search_brand.routes._effective_show_disclaimer(True) is True
    assert search_brand.routes._effective_show_disclaimer(None) is True


def test_effective_disclaimer_text_stripped_without_entitlement(search_brand):
    search_brand.state["allowed"] = False
    assert search_brand.routes._effective_disclaimer_text("Custom") is None


def test_effective_disclaimer_text_allows_custom_with_entitlement(search_brand):
    search_brand.state["allowed"] = True
    assert search_brand.routes._effective_disclaimer_text("  Custom  ") == "Custom"
    assert search_brand.routes._effective_disclaimer_text("   ") is None
    assert search_brand.routes._effective_disclaimer_text(None) is None


def test_customization_out_strips_disclaimer_without_entitlement(search_brand):
    settings = SimpleNamespace(
        search_form_type="withBtn",
        search_button_type="icon",
        search_button_text="Search",
        search_input_placeholder=None,
        search_recent_search=True,
        search_recent_search_title=None,
        search_recent_search_limit=5,
        search_show_speech_input=True,
        search_show_speech_output=True,
        search_show_disclaimer=False,
        search_disclaimer_text="Custom disclaimer",
        search_show_disclaimer_link=False,
        search_disclaimer_link_label="acme.com",
        search_disclaimer_link_url="https://acme.com",
        search_predefined_questions=False,
        search_questions_position="below-search",
        search_questions_limit=5,
        search_questions=[],
    )
    search_brand.state["allowed"] = False
    out_ce = search_brand.routes._search_customization_out_from_settings(settings)
    assert out_ce.showDisclaimer is True
    assert out_ce.disclaimerText is None
    assert out_ce.showDisclaimerLink is True
    assert out_ce.disclaimerLinkLabel is None
    assert out_ce.disclaimerLinkUrl is None

    search_brand.state["allowed"] = True
    out_ee = search_brand.routes._search_customization_out_from_settings(settings)
    assert out_ee.showDisclaimer is False
    assert out_ee.disclaimerText == "Custom disclaimer"
    assert out_ee.showDisclaimerLink is False
    assert out_ee.disclaimerLinkLabel == "acme.com"
    assert out_ee.disclaimerLinkUrl == "https://acme.com"


def test_customization_out_defaults_when_no_settings(search_brand):
    search_brand.state["allowed"] = False
    out = search_brand.routes._search_customization_out_from_settings(None)
    assert out.showDisclaimer is True
    assert out.disclaimerText is None
    assert out.showDisclaimerLink is True
    assert out.disclaimerLinkLabel is None
    assert out.disclaimerLinkUrl is None


def test_can_customize_search_brand_false_when_dual_gate_denies(monkeypatch):
    from app.routes import search_models as search_routes

    monkeypatch.setattr(
        "app.platform.ee_feature_gate.can_use_white_label",
        lambda: False,
    )
    assert search_routes._can_customize_search_brand() is False


def test_can_customize_search_brand_true_when_dual_gate_allows(monkeypatch):
    from app.routes import search_models as search_routes

    monkeypatch.setattr(
        "app.platform.ee_feature_gate.can_use_white_label",
        lambda: True,
    )
    assert search_routes._can_customize_search_brand() is True


def test_can_customize_search_brand_requires_module_not_license_alone(monkeypatch):
    from app.routes import search_models as search_routes

    monkeypatch.setattr(
        "app.platform.entitlement_deps.has_feature_entitlement",
        lambda *features: True,
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate._module_loaded",
        lambda module_id: False,
    )
    assert search_routes._can_customize_search_brand() is False
