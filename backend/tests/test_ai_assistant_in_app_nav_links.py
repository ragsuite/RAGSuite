"""Tests for Ops UI label formatting (bold text; no in-app nav links)."""

from __future__ import annotations

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.ai_assistant.backend.ui_config_surfaces import (  # noqa: E402
    build_config_setting_workflows_cached,
)
from ragsuite_modules.ai_assistant.backend.ui_workflows import (  # noqa: E402
    format_in_app_nav_link,
    is_in_app_nav_path,
    match_ui_workflows,
    render_ui_howto_answer_text,
    render_ui_workflow_facts,
)


def test_is_in_app_nav_path_allowlist():
    assert is_in_app_nav_path("/(app)/chatbot-config")
    assert is_in_app_nav_path("/(app)/chatbot-config/chat-widget-customization")
    assert is_in_app_nav_path("/(app)")
    assert not is_in_app_nav_path("/api/v1/documents/1")
    assert not is_in_app_nav_path("https://example.com")
    assert not is_in_app_nav_path("")


def test_format_in_app_nav_link_is_bold_only():
    assert (
        format_in_app_nav_link("Chatbot Configuration", "/(app)/chatbot-config")
        == "**Chatbot Configuration**"
    )
    assert format_in_app_nav_link("Settings", None) == "**Settings**"
    assert format_in_app_nav_link("Docs", "https://evil.example") == "**Docs**"
    assert format_in_app_nav_link("Sources", "/(app)/(tabs)/crawl-management") == "**Sources**"


def test_howto_render_uses_bold_not_in_app_links():
    build_config_setting_workflows_cached.cache_clear()
    matches = match_ui_workflows("where is customization setting for chatbot")
    assert matches, "expected a chatbot customization workflow match"
    blocks = [render_ui_workflow_facts(m) for m in matches[:1]]
    text = render_ui_howto_answer_text(blocks)
    assert "](/(app)/" not in text
    assert "http://" not in text
    assert "https://" not in text
    assert "Customization" in text or "Customisation" in text


def test_workflow_facts_may_still_include_step_paths():
    """Paths may remain on facts for grounding; rendered answers must not expose them as links."""
    build_config_setting_workflows_cached.cache_clear()
    matches = match_ui_workflows("chatbot widget customization")
    assert matches
    facts = render_ui_workflow_facts(matches[0])
    steps = facts.get("steps") or []
    assert isinstance(steps, list) and steps
    text = render_ui_howto_answer_text([facts])
    assert "](/(app)/" not in text


def test_crawl_add_source_howto_bolds_sources_module():
    matches = match_ui_workflows("how do I crawl new source?")
    assert matches, "expected crawl_add_source (or related) workflow"
    assert any(m.workflow.key == "crawl_add_source" for m in matches) or any(
        "crawl" in m.workflow.key for m in matches
    )
    blocks = [render_ui_workflow_facts(m) for m in matches[:1]]
    text = render_ui_howto_answer_text(blocks)
    assert "**Sources**" in text
    assert "[Sources](/(app)/(tabs)/crawl-management)" not in text
    assert "](/(app)/(tabs)/crawl-management)" not in text


def test_add_source_howto_bolds_sources_module():
    matches = match_ui_workflows("how do I add a new source")
    assert matches
    blocks = [render_ui_workflow_facts(m) for m in matches[:1]]
    text = render_ui_howto_answer_text(blocks)
    assert "**Sources**" in text
    assert "](/(app)/(tabs)/crawl-management)" not in text
