"""AI Assistant preference helpers (isolated from Search/Chatbot settings)."""

from __future__ import annotations

from typing import Any, Optional

DEFAULT_MODE_OPS = "ops"
DEFAULT_MODE_SOURCES = "sources"
ALLOWED_DEFAULT_MODES = frozenset({DEFAULT_MODE_OPS, DEFAULT_MODE_SOURCES})

ANSWER_LENGTH_SHORT = "short"
ANSWER_LENGTH_BALANCED = "balanced"
ANSWER_LENGTH_DETAILED = "detailed"
ALLOWED_ANSWER_LENGTHS = frozenset(
    {ANSWER_LENGTH_SHORT, ANSWER_LENGTH_BALANCED, ANSWER_LENGTH_DETAILED}
)

# Ops (Sources off) finish-safe ceilings (prompt targets length; tokens must not mid-cut).
OPS_ANSWER_LENGTH_TOKENS = {
    ANSWER_LENGTH_SHORT: 480,
    ANSWER_LENGTH_BALANCED: 520,
    ANSWER_LENGTH_DETAILED: 1000,
}

# Sources mode finish-safe ceilings (assistant path only; does not mutate Search settings).
SOURCES_ANSWER_LENGTH_TOKENS = {
    ANSWER_LENGTH_SHORT: 420,
    ANSWER_LENGTH_BALANCED: 480,
    ANSWER_LENGTH_DETAILED: 900,
}

LOADING_STYLE_TYPING = "typing"
LOADING_STYLE_SKELETON = "skeleton"
ALLOWED_LOADING_STYLES = frozenset({LOADING_STYLE_TYPING, LOADING_STYLE_SKELETON})

TOOL_SCOPE_KEYS = (
    "ui_howto",
    "ops_metrics",
    "ops_history",
    "crawl_and_jobs",
    "product_links",
)

DEFAULT_TOOL_SCOPE: dict[str, bool] = {key: True for key in TOOL_SCOPE_KEYS}

# UX group → registered tool names (ui_howto also gates workflow matching in the agent).
TOOL_SCOPE_TO_TOOLS: dict[str, frozenset[str]] = {
    "ui_howto": frozenset({"describe_chatbot_config", "describe_search_config"}),
    "ops_metrics": frozenset({"overview_metrics", "system_health_snapshot"}),
    "ops_history": frozenset({"top_chat_queries", "top_search_queries"}),
    "crawl_and_jobs": frozenset(
        {"list_crawl_sources", "list_recent_jobs", "document_stats"}
    ),
    "product_links": frozenset({"product_links"}),
}

DEFAULT_OPS_LOOKBACK_DAYS = 7
MIN_OPS_LOOKBACK_DAYS = 1
MAX_OPS_LOOKBACK_DAYS = 90


def default_tool_scope() -> dict[str, bool]:
    return dict(DEFAULT_TOOL_SCOPE)


def normalize_default_mode(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in ALLOWED_DEFAULT_MODES:
        return raw
    return DEFAULT_MODE_OPS


def normalize_answer_length(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in ALLOWED_ANSWER_LENGTHS:
        return raw
    return ANSWER_LENGTH_BALANCED


def normalize_loading_style(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in ALLOWED_LOADING_STYLES:
        return raw
    return LOADING_STYLE_TYPING


def answer_length_instruction(length: Any) -> str:
    """System instruction so Short/Balanced/Detailed change reply style, not only ceilings."""
    normalized = normalize_answer_length(length)
    finish_rule = (
        "Never stop mid-sentence, mid-bullet, or mid-word. "
        "If you are near the length target, finish the current thought cleanly and then stop. "
        "Prefer a complete answer over hitting an exact character count."
    )
    closing_rule = (
        "CLOSING: Always end with a final plain paragraph of 1–2 lines "
        "(not a bullet or heading) after any lists/sections, so the reply is visibly complete. "
        "Prefer a concise wrap-up or one natural follow-up question when helpful; "
        "do not invent marketing CTAs. Count this closer inside the length band."
    )
    if normalized == ANSWER_LENGTH_SHORT:
        return (
            "ANSWER LENGTH: Short. Keep the body to 1–2 lines (~80–220 characters "
            "including the closing paragraph). Prefer a single short paragraph. "
            "Do not use multi-section lists; at most one brief bullet if essential. "
            "No preamble or filler. Scale to the question — never pad. "
            f"{finish_rule} {closing_rule}"
        )
    if normalized == ANSWER_LENGTH_DETAILED:
        return (
            "ANSWER LENGTH: Detailed. Aim for 1,200–2,800 characters when the question "
            "warrants it (toward the lower end for simpler asks). Use clear structure "
            "(short intro, then steps/bullets/sections when useful). Cover important "
            "nuances without inventing facts or padding with filler. "
            f"{finish_rule} {closing_rule}"
        )
    return (
        "ANSWER LENGTH: Balanced. Aim for 350–900 characters with only the essential "
        "points (a concise summary), including the closing paragraph. Scale to the question — "
        "do not pad to fill the band, and do not expand into essay length. "
        f"{finish_rule} {closing_rule}"
    )


def normalize_tool_scope(value: Any) -> dict[str, bool]:
    base = default_tool_scope()
    if not isinstance(value, dict):
        return base
    out = dict(base)
    for key in TOOL_SCOPE_KEYS:
        if key in value:
            out[key] = bool(value.get(key))
    return out


def normalize_ops_lookback_days(value: Any) -> int:
    try:
        days = int(value)
    except (TypeError, ValueError):
        return DEFAULT_OPS_LOOKBACK_DAYS
    return max(MIN_OPS_LOOKBACK_DAYS, min(MAX_OPS_LOOKBACK_DAYS, days))


def normalize_show_citations(value: Any) -> bool:
    return bool(value)


def ops_max_tokens(answer_length: Any, max_tokens: Optional[int] = None) -> int:
    length = normalize_answer_length(answer_length)
    budget = OPS_ANSWER_LENGTH_TOKENS[length]
    if max_tokens is not None:
        try:
            cap = int(max_tokens)
            if cap > 0:
                return min(budget, cap)
        except (TypeError, ValueError):
            pass
    return budget


def sources_max_tokens(answer_length: Any) -> int:
    length = normalize_answer_length(answer_length)
    return SOURCES_ANSWER_LENGTH_TOKENS[length]


def allowed_tool_names(tool_scope: Any) -> set[str]:
    scope = normalize_tool_scope(tool_scope)
    names: set[str] = set()
    for key, tools in TOOL_SCOPE_TO_TOOLS.items():
        if scope.get(key, True):
            names.update(tools)
    return names


def ui_howto_enabled(tool_scope: Any) -> bool:
    return bool(normalize_tool_scope(tool_scope).get("ui_howto", True))


def prefs_from_settings(settings: Any) -> dict[str, Any]:
    """Read preference fields from an AIAssistantSettings row (safe defaults)."""
    if settings is None:
        return {
            "default_mode": DEFAULT_MODE_OPS,
            "answer_length": ANSWER_LENGTH_BALANCED,
            "show_citations": False,
            "tool_scope": default_tool_scope(),
            "ops_lookback_days": DEFAULT_OPS_LOOKBACK_DAYS,
            "loading_style": LOADING_STYLE_TYPING,
        }
    return {
        "default_mode": normalize_default_mode(getattr(settings, "default_mode", None)),
        "answer_length": normalize_answer_length(getattr(settings, "answer_length", None)),
        "show_citations": normalize_show_citations(getattr(settings, "show_citations", False)),
        "tool_scope": normalize_tool_scope(getattr(settings, "tool_scope", None)),
        "ops_lookback_days": normalize_ops_lookback_days(
            getattr(settings, "ops_lookback_days", None)
        ),
        "loading_style": normalize_loading_style(getattr(settings, "loading_style", None)),
    }
