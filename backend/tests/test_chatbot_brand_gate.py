"""Chatbot white-label brand gate (CE forces RAGSuite title + null logo)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.fixture
def chatbot_brand(monkeypatch):
    from app.routes import chatbot as chatbot_routes

    state = {"allowed": False}

    def _can():
        return state["allowed"]

    monkeypatch.setattr(chatbot_routes, "_can_customize_chatbot_brand", _can)
    return SimpleNamespace(routes=chatbot_routes, state=state)


def test_effective_title_forced_without_entitlement(chatbot_brand):
    chatbot_brand.state["allowed"] = False
    assert chatbot_brand.routes._effective_chatbot_title("Acme Bot") == "RAGSuite"
    assert chatbot_brand.routes._effective_chatbot_title(None) == "RAGSuite"


def test_effective_title_allows_custom_with_entitlement(chatbot_brand):
    chatbot_brand.state["allowed"] = True
    assert chatbot_brand.routes._effective_chatbot_title("Acme Bot") == "Acme Bot"
    assert chatbot_brand.routes._effective_chatbot_title("  ") == "RAGSuite"


def test_effective_logo_forced_null_without_entitlement(chatbot_brand):
    chatbot_brand.state["allowed"] = False
    assert chatbot_brand.routes._effective_widget_logo_url("https://x/logo.png") is None


def test_effective_logo_allows_custom_with_entitlement(chatbot_brand):
    chatbot_brand.state["allowed"] = True
    assert (
        chatbot_brand.routes._effective_widget_logo_url("https://x/logo.png")
        == "https://x/logo.png"
    )
    assert chatbot_brand.routes._effective_widget_logo_url("  ") is None


def test_effective_home_display_name_always_null(chatbot_brand):
    chatbot_brand.state["allowed"] = False
    assert chatbot_brand.routes._effective_home_display_name("Custom Home") is None
    chatbot_brand.state["allowed"] = True
    assert chatbot_brand.routes._effective_home_display_name("Custom Home") is None


def test_configuration_out_never_exposes_home_display_name(chatbot_brand):
    settings = SimpleNamespace(
        chatbot_title="Acme",
        short_description=None,
        bubble_message=None,
        welcome_message="Hi",
        hero_title="Welcome",
        hero_subtitle=None,
        widget_layout="tabbed",
        home_display_name="Legacy Home Name",
        home_status_text="Online",
        home_cta_label="Chat",
        chatbot_language="en",
        feedback_enabled=True,
        store_history_enabled=True,
    )
    chatbot_brand.state["allowed"] = False
    out_ce = chatbot_brand.routes._configuration_out_from_settings(settings)
    assert out_ce.home_display_name is None
    assert out_ce.chatbot_title == "RAGSuite"

    chatbot_brand.state["allowed"] = True
    out_ee = chatbot_brand.routes._configuration_out_from_settings(settings)
    assert out_ee.home_display_name is None
    assert out_ee.chatbot_title == "Acme"
