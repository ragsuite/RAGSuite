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


def test_effective_disclaimer_forced_without_entitlement(chatbot_brand):
    chatbot_brand.state["allowed"] = False
    assert chatbot_brand.routes._effective_show_disclaimer(False) is True
    assert chatbot_brand.routes._effective_disclaimer_text("Custom note") is None
    assert chatbot_brand.routes._effective_show_disclaimer_link(False) is True
    assert chatbot_brand.routes._effective_disclaimer_link_label("acme.com") is None
    assert chatbot_brand.routes._effective_disclaimer_link_url("https://acme.com") is None


def test_effective_disclaimer_allows_custom_with_entitlement(chatbot_brand):
    chatbot_brand.state["allowed"] = True
    assert chatbot_brand.routes._effective_show_disclaimer(False) is False
    assert chatbot_brand.routes._effective_show_disclaimer(None) is True
    assert chatbot_brand.routes._effective_disclaimer_text("Custom note") == "Custom note"
    assert chatbot_brand.routes._effective_disclaimer_text("  ") is None
    assert chatbot_brand.routes._effective_show_disclaimer_link(False) is False
    assert chatbot_brand.routes._effective_disclaimer_link_label("acme.com") == "acme.com"
    assert (
        chatbot_brand.routes._effective_disclaimer_link_url("https://acme.com")
        == "https://acme.com"
    )


def test_customization_out_strips_disclaimer_without_entitlement(chatbot_brand):
    settings = SimpleNamespace(
        widget_logo_url="https://x/logo.png",
        widget_avatar="default-1",
        widget_avatar_size=38,
        widget_chatbot_color="#1F2937",
        widget_background_color="#1a1a1a",
        widget_text_color="#ffffff",
        widget_show_logo=True,
        widget_show_date_time=True,
        widget_show_backdrop=False,
        widget_show_speech_input=True,
        widget_show_speech_output=True,
        widget_show_disclaimer=False,
        widget_disclaimer_text="Custom disclaimer",
        widget_show_disclaimer_link=False,
        widget_disclaimer_link_label="acme.com",
        widget_disclaimer_link_url="https://acme.com",
        widget_bottom_space=15,
        widget_font_size=14,
        widget_trigger_border_radius=50,
        widget_panel_border_radius=20,
        widget_position="bottom-right",
        widget_z_index=50,
        widget_offset_x=0,
        widget_offset_y=0,
        widget_width=None,
        widget_height=None,
    )
    chatbot_brand.state["allowed"] = False
    out_ce = chatbot_brand.routes._customization_out_from_settings(settings)
    assert out_ce.widget_show_disclaimer is True
    assert out_ce.widget_disclaimer_text is None
    assert out_ce.widget_show_disclaimer_link is True
    assert out_ce.widget_disclaimer_link_label is None
    assert out_ce.widget_disclaimer_link_url is None
    assert out_ce.widget_logo_url is None

    chatbot_brand.state["allowed"] = True
    out_ee = chatbot_brand.routes._customization_out_from_settings(settings)
    assert out_ee.widget_show_disclaimer is False
    assert out_ee.widget_disclaimer_text == "Custom disclaimer"
    assert out_ee.widget_show_disclaimer_link is False
    assert out_ee.widget_disclaimer_link_label == "acme.com"
    assert out_ee.widget_disclaimer_link_url == "https://acme.com"
    assert out_ee.widget_logo_url == "https://x/logo.png"


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
