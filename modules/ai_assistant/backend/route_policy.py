"""Deterministic route policy applied after the LLM intent planner."""
from __future__ import annotations

from typing import Literal, Optional

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
from .ui_config_surfaces import config_routes, is_config_settings_workflow_key
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


def apply_route_policy(plan: IntentPlan, user_message: str) -> IntentPlan:
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

    query = plan.cleaned_query or user_message or ""
    ask_mode = classify_ask_mode(query, intent=plan.intent)

    embed_routes = detect_embed_routes(query)
    if embed_routes:
        keys: list[str] = []
        for route in embed_routes:
            surface = embed_surface_for_route(route) or {}
            key = str(surface.get("workflow_key") or "")
            if key:
                keys.append(key)
        primary_route = embed_routes[0]
        return IntentPlan(
            cleaned_query=plan.cleaned_query,
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            refusal_hint=plan.refusal_hint,
            focus_route=primary_route,
            ui_workflow_key=keys[0] if keys else None,
            ui_workflow_keys=keys if len(keys) > 1 else None,
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

    focus = _resolve_focus_route(plan, user_message)
    workflow_key = plan.ui_workflow_key

    # Drop stale embed workflow keys when the ask is not about embed/script.
    if (
        workflow_key in ("chatbot_embed_integrations", "search_embed_integrations")
        and not query_has_embed_signal(query)
    ):
        workflow_key = None

    # Settings / Customization how-tos: pick best settings section from query tokens.
    if focus in config_routes() and ask_mode == "howto" and not query_has_embed_signal(query):
        ui_match = match_ui_workflow(
            plan.cleaned_query or user_message,
            focus_route=focus,
            workflow_key=None,
        )
    else:
        ui_match = match_ui_workflow(
            plan.cleaned_query or user_message,
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
    q_tokens = _tokenize(query)
    if (
        focus == _PROJECTS_ROUTE
        or (ui_match and ui_match.workflow.key == "create_project")
        or (q_tokens & {"project", "projects"} and q_tokens & {"add", "new", "create"} and not (q_tokens & {"source", "sources", "crawl"}))
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
                days = 1 if ask_mode == "status" else 7
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


__all__ = ["apply_route_policy", "classify_ask_mode"]
