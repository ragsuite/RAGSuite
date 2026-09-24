"""Deterministic route policy applied after the LLM intent planner."""
from __future__ import annotations

from typing import Literal, Optional, Set

from .intent import IntentPlan, PlannedToolCall
from .ui_catalog import (
    _PLATFORM_INTEGRATIONS_ROUTE,
    _raw_tokens,
    _tokenize,
    best_route_match,
    detect_embed_routes,
    embed_surface_for_route,
    query_has_embed_signal,
    workflow_route_index,
)
from .ui_config_surfaces import (
    catalog_workflow_key_for_route,
    config_routes,
    detect_config_catalog_query,
    is_config_catalog_workflow_key,
    is_config_settings_workflow_key,
    query_has_config_feature_hit,
)
from .ui_app_surfaces import (
    CONFIGURATION_MCP_KEY,
    SOURCES_CONNECTORS_CATALOG_KEY,
    detect_mcp_connector_query,
    detect_sources_connectors_catalog_query,
    is_inventory_catalog_workflow_key,
)
from .ui_workflows import match_ui_workflow

# Tools that report project usage analytics (not infrastructure health).
_USAGE_TOOLS = frozenset(
    {
        "overview_metrics",
        "top_chat_queries",
        "top_search_queries",
    }
)

_SYSTEM_HEALTH_ROUTE = "system-health"
_ANALYTICS_ROUTE = "index"
_PROJECTS_ROUTE = "projects"

AskMode = Literal["status", "howto", "other"]

_STATUS_MARKERS = frozenset(
    {"current", "what", "whats", "status", "now", "today", "latest", "average", "avg"}
)
_HOWTO_MARKERS = frozenset(
    {"how", "where", "open", "navigate", "find", "go", "steps", "guide"}
)
_METRIC_SURFACES = frozenset(
    {"latency", "p95", "usage", "thumbs", "traffic", "volume", "metric", "metrics", "health", "uptime"}
)
_TOP_RANK_MARKERS = frozenset({"top", "frequent", "popular", "most"})
_TOP_QUERY_SURFACES = frozenset(
    {"query", "queries", "question", "questions", "history"}
)
_CREATE_PROJECT_MARKERS = frozenset({"add", "new", "create"})
_PROJECT_MARKERS = frozenset({"project", "projects"})
_HISTORY_ROUTE = "history"


def classify_ask_mode(query: str, *, intent: Optional[str] = None) -> AskMode:
    """Classify status vs howto from query structure (not English phrase routing lists)."""
    raw = _raw_tokens(query)
    tokens = _tokenize(query) | raw
    if intent in ("ops_metrics", "ops_history", "ops_system_health"):
        return "status"
    has_status = bool(raw & _STATUS_MARKERS) or bool(tokens & _METRIC_SURFACES and raw & {"current", "what", "whats", "status", "now"})
    has_howto = bool(raw & _HOWTO_MARKERS)
    has_metric = bool(tokens & _METRIC_SURFACES)
    if has_status and has_metric:
        return "status"
    if has_status and not has_howto:
        return "status"
    if has_howto and not (has_status and has_metric):
        return "howto"
    return "other"


def _parse_top_query_limit(query: str, default: int = 5, max_limit: int = 20) -> int:
    import re

    match = re.search(r"\btop\s+(\d{1,2})\b", (query or "").lower())
    if not match:
        match = re.search(r"\b(\d{1,2})\b", (query or "").lower())
    if match:
        try:
            value = int(match.group(1))
            return max(1, min(value, max_limit))
        except ValueError:
            pass
    return default


def detect_top_query_ops(query: str) -> Optional[tuple[str, int]]:
    """
    Ranked chatbot/search query-history asks → (tool_name, limit).

    Requires a ranking token (top/frequent/…) plus a query/history surface.
    Pure \"open History\" how-tos (no ranking tokens) return None.
    """
    if query_has_embed_signal(query):
        return None
    q = _tokenize(query) | _raw_tokens(query)
    if not (q & _TOP_RANK_MARKERS):
        return None
    if not (q & _TOP_QUERY_SURFACES):
        return None

    limit = _parse_top_query_limit(query)
    wants_search = bool(q & {"search"})
    wants_chat = bool(q & {"chatbot", "chat"})
    if wants_search and not wants_chat:
        return ("top_search_queries", limit)
    if wants_chat:
        return ("top_chat_queries", limit)
    # Unqualified \"top queries\" → chatbot (matches heuristic_tools_for_message).
    return ("top_chat_queries", limit)


def _valid_catalog_route(slug: Optional[str]) -> Optional[str]:
    if not slug or not isinstance(slug, str):
        return None
    slug = slug.strip()
    if not slug:
        return None
    if slug in workflow_route_index():
        return slug
    return None


def _resolve_focus_route(plan: IntentPlan, user_message: str) -> Optional[str]:
    if plan.focus_route and _valid_catalog_route(plan.focus_route):
        return plan.focus_route
    query = plan.cleaned_query or user_message or ""
    hit = best_route_match(query)
    if hit:
        return hit.route
    return None


def _filter_plan_by_tool_scope(
    plan: IntentPlan,
    *,
    allowed_tools: Optional[Set[str]],
    ops_lookback_days: int,
) -> IntentPlan:
    """Drop out-of-scope tools; normalize overview_metrics lookback when not status (days=1)."""
    filtered: list[PlannedToolCall] = []
    for tc in plan.tool_calls or []:
        if allowed_tools is not None and tc.name not in allowed_tools:
            continue
        args = dict(tc.arguments or {})
        if tc.name == "overview_metrics":
            try:
                days = int(args.get("days") or args.get("limit") or ops_lookback_days)
            except (TypeError, ValueError):
                days = ops_lookback_days
            # Preserve explicit status-first day=1; otherwise prefer project lookback.
            if days != 1:
                days = ops_lookback_days
            args = {"days": days, "limit": days}
        filtered.append(PlannedToolCall(name=tc.name, arguments=args))
    needs_tools = bool(filtered) and (plan.needs_tools or bool(filtered))
    if not filtered:
        needs_tools = False
    return IntentPlan(
        cleaned_query=plan.cleaned_query,
        intent=plan.intent,
        needs_tools=needs_tools,
        tool_calls=filtered,
        out_of_scope=plan.out_of_scope,
        refusal_hint=plan.refusal_hint,
        focus_route=plan.focus_route,
        ui_workflow_key=plan.ui_workflow_key,
        ui_workflow_keys=plan.ui_workflow_keys,
    )


def apply_route_policy(
    plan: IntentPlan,
    user_message: str,
    *,
    allowed_tools: Optional[set[str]] = None,
    ops_lookback_days: int = 7,
) -> IntentPlan:
    """
    Post-planner safety net: bind tools to dashboard routes.

    - embed scripts → chatbot-config / search-config Integrations workflows
    - add/create project → projects workflow
    - system-health → ops_system_health + system_health_snapshot (never overview_metrics)
    - latency/status on Analytics → force overview_metrics
    - navigation_only workflows → strip ops tools
    """
    result = _apply_route_policy_body(plan, user_message, ops_lookback_days=ops_lookback_days)
    return _filter_plan_by_tool_scope(
        result,
        allowed_tools=allowed_tools,
        ops_lookback_days=ops_lookback_days,
    )


def _apply_route_policy_body(
    plan: IntentPlan,
    user_message: str,
    *,
    ops_lookback_days: int = 7,
) -> IntentPlan:
    """
    Post-planner safety net: bind tools to dashboard routes.

    - embed scripts → chatbot-config / search-config Integrations workflows
    - add/create project → projects workflow
    - system-health → ops_system_health + system_health_snapshot (never overview_metrics)
    - latency/status on Analytics → force overview_metrics
    - navigation_only workflows → strip ops tools
    """
    if plan.out_of_scope:
        return plan

    # Prefer the original ask for matching so planner cleaned_query cannot drop feature tokens.
    query = (user_message or "").strip() or (plan.cleaned_query or "")
    ask_mode = classify_ask_mode(query, intent=plan.intent)

    embed_routes = detect_embed_routes(query)
    if embed_routes:
        keys: list[str] = []
        for route in embed_routes:
            surface = embed_surface_for_route(route) or {}
            key = str(surface.get("workflow_key") or "")
            if key:
                keys.append(key)
        # De-dupe preserving order
        seen_keys: set[str] = set()
        uniq_keys: list[str] = []
        for key in keys:
            if key in seen_keys:
                continue
            seen_keys.add(key)
            uniq_keys.append(key)
        primary = embed_routes[0]
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route=primary,
            ui_workflow_key=uniq_keys[0] if uniq_keys else None,
            ui_workflow_keys=uniq_keys if len(uniq_keys) > 1 else None,
        )

    # Outbound RAGSuite MCP (Cursor/Claude) before inbound Sources connectors.
    if detect_mcp_connector_query(query):
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route="configuration",
            ui_workflow_key=CONFIGURATION_MCP_KEY,
            ui_workflow_keys=None,
        )

    # Sources connectors inventory (before config catalog / create_project).
    if detect_sources_connectors_catalog_query(query):
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route="crawl-management",
            ui_workflow_key=SOURCES_CONNECTORS_CATALOG_KEY,
            ui_workflow_keys=None,
        )

    # Broad "what/which settings can I configure" → full product catalog (not embed / one section).
    # Feature-panel how-tos (avatar, color, …) must never become catalogs.
    catalog_route = None if query_has_config_feature_hit(query) else detect_config_catalog_query(query)
    if catalog_route:
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route=catalog_route,
            ui_workflow_key=catalog_workflow_key_for_route(catalog_route),
            ui_workflow_keys=None,
        )

    # Wrong sidebar Integrations when user meant product embed scripts.
    if (
        plan.focus_route == _PLATFORM_INTEGRATIONS_ROUTE
        and query_has_embed_signal(query)
        and detect_embed_routes(query)
    ):
        embed_routes = detect_embed_routes(query)
        keys = [
            str((embed_surface_for_route(r) or {}).get("workflow_key") or "")
            for r in embed_routes
        ]
        keys = [k for k in keys if k]
        if keys:
            return IntentPlan(
                cleaned_query=plan.cleaned_query,
                intent="ui_navigation",
                needs_tools=False,
                tool_calls=[],
                out_of_scope=False,
                refusal_hint=plan.refusal_hint,
                focus_route=embed_routes[0],
                ui_workflow_key=keys[0],
                ui_workflow_keys=keys if len(keys) > 1 else None,
            )

    # Ranked chatbot/search query history — force ops tools before create_project / nav strip.
    top_ops = detect_top_query_ops(query)
    if top_ops:
        tool_name, limit = top_ops
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ops_history",
            needs_tools=True,
            tool_calls=[PlannedToolCall(name=tool_name, arguments={"limit": limit})],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route=_HISTORY_ROUTE,
            ui_workflow_key="view_history",
        )

    focus = _resolve_focus_route(plan, user_message)
    workflow_key = plan.ui_workflow_key

    # Drop stale embed workflow keys when the ask is not about embed/script.
    if (
        workflow_key in ("chatbot_embed_integrations", "search_embed_integrations")
        and not query_has_embed_signal(query)
    ):
        workflow_key = None

    # Drop catalog keys when the ask targets a concrete feature panel.
    if workflow_key and is_inventory_catalog_workflow_key(workflow_key) and query_has_config_feature_hit(query):
        workflow_key = None
    if workflow_key and is_config_catalog_workflow_key(workflow_key) and query_has_config_feature_hit(query):
        workflow_key = None

    # Settings / Customization how-tos: pick best settings section from original query tokens.
    if focus in config_routes() and ask_mode == "howto" and not query_has_embed_signal(query):
        ui_match = match_ui_workflow(
            query,
            focus_route=focus,
            workflow_key=None,
        )
    else:
        ui_match = match_ui_workflow(
            query,
            focus_route=focus,
            workflow_key=workflow_key,
        )
    if ui_match and not workflow_key:
        workflow_key = ui_match.workflow.key
    elif (
        ui_match
        and is_config_settings_workflow_key(ui_match.workflow.key)
        and not query_has_embed_signal(query)
    ):
        workflow_key = ui_match.workflow.key
    if ui_match and not focus:
        focus = ui_match.workflow.route

    # --- Create / add project (not crawl source) ---
    # Require explicit create intent; bare focus_route=projects must not strip tools.
    q_tokens = _tokenize(query)
    wants_create_project = bool(
        (q_tokens & _CREATE_PROJECT_MARKERS)
        and (q_tokens & _PROJECT_MARKERS)
        and not (q_tokens & {"source", "sources", "crawl"})
    )
    if wants_create_project or (
        ui_match
        and ui_match.workflow.key == "create_project"
        and bool(q_tokens & _CREATE_PROJECT_MARKERS)
    ):
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route=_PROJECTS_ROUTE,
            ui_workflow_key="create_project",
        )

    # --- System Health: never confuse with usage overview ---
    if focus == _SYSTEM_HEALTH_ROUTE or (ui_match and ui_match.workflow.route == _SYSTEM_HEALTH_ROUTE):
        focus = _SYSTEM_HEALTH_ROUTE
        tool_calls = [
            tc for tc in plan.tool_calls if tc.name not in _USAGE_TOOLS and tc.name != "list_crawl_sources"
        ]
        if not any(tc.name == "system_health_snapshot" for tc in tool_calls):
            tool_calls = [PlannedToolCall(name="system_health_snapshot", arguments={})] + tool_calls
        seen = set()
        deduped: list[PlannedToolCall] = []
        for tc in tool_calls:
            if tc.name in seen:
                continue
            seen.add(tc.name)
            deduped.append(tc)
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ops_system_health",
            needs_tools=True,
            tool_calls=deduped[:4],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route=focus,
            ui_workflow_key=workflow_key or "view_system_health",
        )

    # --- Latency / Analytics: fetch overview_metrics (status-first; howto still gets numbers) ---
    latency_surface = bool(q_tokens & {"latency", "p95"}) or (
        ui_match is not None and ui_match.workflow.key == "view_latency"
    )
    if focus == _ANALYTICS_ROUTE or latency_surface:
        if ask_mode == "status" or latency_surface or plan.intent in ("ops_metrics", "other"):
            tools = [tc for tc in plan.tool_calls if tc.name != "system_health_snapshot"]
            if not any(tc.name == "overview_metrics" for tc in tools):
                days = 1 if ask_mode == "status" else ops_lookback_days
                tools = [
                    PlannedToolCall(name="overview_metrics", arguments={"days": days, "limit": days})
                ] + tools
            return IntentPlan(
                cleaned_query=plan.cleaned_query,
                intent="ops_metrics",
                needs_tools=True,
                tool_calls=tools[:4],
                out_of_scope=False,
                refusal_hint=plan.refusal_hint,
                focus_route=focus or _ANALYTICS_ROUTE,
                ui_workflow_key=workflow_key or (ui_match.workflow.key if ui_match else "view_latency"),
            )

    # --- Navigation-only workflow: strip tools when planner asked for UI navigation ---
    if ui_match and ui_match.workflow.scope == "navigation_only":
        if plan.intent in ("ui_navigation", "ui_howto", "ui_crawl_sources") or ask_mode == "howto":
            return IntentPlan(
                cleaned_query=plan.cleaned_query,
                intent="ui_navigation",
                needs_tools=False,
                tool_calls=[],
                out_of_scope=False,
                refusal_hint=plan.refusal_hint,
                focus_route=focus or ui_match.workflow.route,
                ui_workflow_key=workflow_key or ui_match.workflow.key,
            )

    if focus or workflow_key or plan.ui_workflow_keys:
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent=plan.intent,
            needs_tools=plan.needs_tools,
            tool_calls=plan.tool_calls,
            out_of_scope=plan.out_of_scope,
            refusal_hint=plan.refusal_hint,
            focus_route=focus,
            ui_workflow_key=workflow_key,
            ui_workflow_keys=plan.ui_workflow_keys,
        )
    return plan


__all__ = ["apply_route_policy", "classify_ask_mode", "detect_top_query_ops"]
