"""Unit tests for AI Assistant preference helpers and wiring."""

from __future__ import annotations

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.ai_assistant.backend.preferences import (  # noqa: E402
    ALLOWED_ANSWER_LENGTHS,
    ALLOWED_DEFAULT_MODES,
    ALLOWED_LOADING_STYLES,
    allowed_tool_names,
    answer_length_instruction,
    default_tool_scope,
    normalize_answer_length,
    normalize_default_mode,
    normalize_loading_style,
    normalize_ops_lookback_days,
    normalize_tool_scope,
    ops_max_tokens,
    prefs_from_settings,
    sources_max_tokens,
    ui_howto_enabled,
)
from ragsuite_modules.ai_assistant.backend.intent import (  # noqa: E402
    IntentPlan,
    PlannedToolCall,
    validate_intent_plan,
)
from ragsuite_modules.ai_assistant.backend.route_policy import apply_route_policy  # noqa: E402
from ragsuite_modules.ai_assistant.backend.docs_answer import (  # noqa: E402
    _citation_items_from_retrieval_meta,
    _format_and_tokens,
)


def test_normalize_defaults():
    assert normalize_default_mode("sources") == "sources"
    assert normalize_default_mode("nope") == "ops"
    assert normalize_answer_length("detailed") == "detailed"
    assert normalize_answer_length("") == "balanced"
    assert normalize_ops_lookback_days(120) == 90
    assert normalize_ops_lookback_days(0) == 1
    assert set(ALLOWED_DEFAULT_MODES) == {"ops", "sources"}
    assert set(ALLOWED_ANSWER_LENGTHS) == {"short", "balanced", "detailed"}


def test_tool_scope_filters_tools():
    scope = default_tool_scope()
    scope["ops_metrics"] = False
    scope["product_links"] = False
    names = allowed_tool_names(scope)
    assert "overview_metrics" not in names
    assert "system_health_snapshot" not in names
    assert "product_links" not in names
    assert "list_crawl_sources" in names
    assert ui_howto_enabled({"ui_howto": False}) is False


def test_answer_length_token_budgets():
    assert ops_max_tokens("short", None) == 480
    assert ops_max_tokens("balanced", 800) == 520
    assert ops_max_tokens("balanced", 300) == 300
    assert ops_max_tokens("detailed", 9000) == 1000
    assert sources_max_tokens("short") == 420
    assert sources_max_tokens("balanced") == 480
    assert sources_max_tokens("detailed") == 900


def test_answer_length_instruction_differs_by_preset():
    short = answer_length_instruction("short")
    balanced = answer_length_instruction("balanced")
    detailed = answer_length_instruction("detailed")
    assert "Short" in short
    assert "1–2 lines" in short or "1-2 lines" in short
    assert "220" in short
    assert "Balanced" in balanced
    assert "350" in balanced and "900" in balanced
    assert "1,500" not in balanced
    assert "Detailed" in detailed
    assert "1,200" in detailed and "2,800" in detailed
    assert "6,000" not in detailed
    assert short != balanced != detailed
    assert answer_length_instruction("nope") == balanced
    for text in (short, balanced, detailed):
        assert "mid-sentence" in text
        assert "finish the current thought" in text
        assert "CLOSING:" in text
        assert "1–2 lines" in text or "1-2 lines" in text


def test_loading_style_normalize_and_prefs():
    assert normalize_loading_style("skeleton") == "skeleton"
    assert normalize_loading_style("typing") == "typing"
    assert normalize_loading_style("nope") == "typing"
    assert set(ALLOWED_LOADING_STYLES) == {"typing", "skeleton"}
    defaults = prefs_from_settings(None)
    assert defaults["loading_style"] == "typing"

    class _Row:
        default_mode = "ops"
        answer_length = "short"
        show_citations = True
        tool_scope = None
        ops_lookback_days = 14
        loading_style = "skeleton"

    prefs = prefs_from_settings(_Row())
    assert prefs["loading_style"] == "skeleton"
    assert prefs["answer_length"] == "short"


def test_route_policy_respects_tool_scope_and_lookback():
    plan = IntentPlan(
        cleaned_query="what is current latency",
        intent="ops_metrics",
        needs_tools=True,
        tool_calls=[
            PlannedToolCall(name="overview_metrics", arguments={"days": 7, "limit": 7}),
            PlannedToolCall(name="product_links", arguments={}),
        ],
        out_of_scope=False,
    )
    allowed = allowed_tool_names(normalize_tool_scope({"product_links": False}))
    out = apply_route_policy(
        plan,
        "what is current latency on analytics",
        allowed_tools=allowed,
        ops_lookback_days=30,
    )
    names = {tc.name for tc in out.tool_calls}
    assert "product_links" not in names
    metrics = [tc for tc in out.tool_calls if tc.name == "overview_metrics"]
    assert metrics
    # status-like ask may force days=1; either 1 or lookback is acceptable
    assert metrics[0].arguments.get("days") in (1, 30)


def test_validate_intent_plan_drops_disallowed_tools():
    raw = {
        "cleaned_query": "show docs",
        "intent": "product_links",
        "needs_tools": True,
        "tool_calls": [{"name": "product_links", "arguments": {}}],
        "out_of_scope": False,
    }
    allowed = allowed_tool_names({"product_links": False})
    plan = validate_intent_plan(raw, "show docs", allowed_tools=allowed, ops_lookback_days=14)
    assert all(tc.name != "product_links" for tc in plan.tool_calls)


def test_citation_items_from_meta():
    items = _citation_items_from_retrieval_meta(
        {
            "retrieval_ready": True,
            "raw_contexts_metadatas": [
                {"title": "A", "url": "https://example.com/a"},
                {"title": "A", "url": "https://example.com/a"},
                {"title": "B", "url": "https://example.com/b"},
            ],
        }
    )
    assert len(items) == 2
    assert items[0]["title"] == "A"


def test_citation_items_forward_og_image():
    items = _citation_items_from_retrieval_meta(
        {
            "raw_contexts_metadatas": [
                {
                    "title": "Partner",
                    "url": "https://nitsantech.de/blog/partner-mit-typo3-agentur",
                    "og_image": "/media/og-partner.jpg",
                },
                {
                    "title": "GDPR",
                    "url": "https://nitsantech.de/blog/gdpr",
                    "og_image": "https://cdn.example/gdpr.png",
                },
            ],
        }
    )
    assert len(items) == 2
    assert items[0]["image"] == "https://nitsantech.de/media/og-partner.jpg"
    assert items[1]["image"] == "https://cdn.example/gdpr.png"


def test_format_and_tokens_prefers_assistant_answer_length():
    class _S:
        answer_length = "short"

    fmt, tokens = _format_and_tokens(None, assistant_settings=_S())
    assert fmt == "markdown"
    assert tokens == 420
