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
