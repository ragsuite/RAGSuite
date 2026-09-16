"""Intent planner: clean the user ask and select tools from the live registry."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from .tools import (
    _parse_limit,
    registered_tool_names,
    tool_catalog_for_planner,
)
from .ui_catalog import route_catalog_for_planner
from .ui_workflows import workflow_keys_for_planner

logger = logging.getLogger(__name__)

MAX_TOOL_CALLS = 4
PLANNER_TEMPERATURE = 0.0

ALLOWED_INTENTS = frozenset(
    {
        "ops_metrics",
        "ops_history",
        "ops_system_health",
        "crawl",
        "jobs",
        "docs",
        "config",
        "product_links",
        "ui_navigation",
        "ui_howto",
        "ui_crawl_sources",
        "greeting",
        "out_of_scope",
        "other",
    }
)

_NAV_INTENTS = frozenset({"ui_navigation", "ui_howto", "ui_crawl_sources"})
_OPS_INTENTS = frozenset({"ops_metrics", "ops_history", "ops_system_health"})


@dataclass
class PlannedToolCall:
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class IntentPlan:
    cleaned_query: str
    intent: str
    needs_tools: bool
    tool_calls: list[PlannedToolCall]
    out_of_scope: bool
    refusal_hint: Optional[str] = None
    focus_route: Optional[str] = None
    ui_workflow_key: Optional[str] = None
    ui_workflow_keys: Optional[list[str]] = None


def fallback_intent_plan(user_message: str) -> IntentPlan:
    """Safe fallback: keep original text, call no tools, invent nothing."""
    cleaned = (user_message or "").strip() or (user_message or "")
    plan = IntentPlan(
        cleaned_query=cleaned,
        intent="other",
        needs_tools=False,
        tool_calls=[],
        out_of_scope=False,
        refusal_hint=None,
        focus_route=None,
        ui_workflow_key=None,
        ui_workflow_keys=None,
    )
    from .route_policy import apply_route_policy

    return apply_route_policy(plan, user_message)


def _extract_json_object(text: str) -> Optional[dict[str, Any]]:
    if not text or not str(text).strip():
        return None
    raw = str(text).strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, flags=re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(raw[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
    return None


def _normalize_arguments(tool_name: str, arguments: Any) -> dict[str, Any]:
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments) if arguments.strip() else {}
        except json.JSONDecodeError:
            arguments = {}
    if not isinstance(arguments, dict):
        arguments = {}
    args = dict(arguments)
    if tool_name == "overview_metrics":
        if "days" in args and "limit" not in args:
            args["limit"] = args.get("days")
        days = _parse_limit(args, default=7, max_limit=90)
        return {"days": days, "limit": days}
    if tool_name in ("top_chat_queries", "top_search_queries", "list_crawl_sources", "list_recent_jobs"):
        default = 5 if tool_name in ("top_chat_queries", "top_search_queries") else 10
        max_limit = 50 if tool_name not in ("top_chat_queries", "top_search_queries") else 20
        return {"limit": _parse_limit(args, default=default, max_limit=max_limit)}
    return {}


def _normalize_intent(intent: str) -> str:
    if intent == "ui_howto" or intent == "ui_crawl_sources":
        return "ui_navigation"
    return intent


def _normalize_optional_str(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def validate_intent_plan(raw: Any, original_message: str) -> IntentPlan:
    """Validate planner JSON against the live tool registry; drop unknown tools."""
    if not isinstance(raw, dict):
        return fallback_intent_plan(original_message)

    cleaned = raw.get("cleaned_query")
    if not isinstance(cleaned, str) or not cleaned.strip():
        cleaned = (original_message or "").strip() or (original_message or "")
    else:
        cleaned = cleaned.strip()

    intent_raw = raw.get("intent")
    intent = intent_raw.strip() if isinstance(intent_raw, str) and intent_raw.strip() else "other"
    if intent not in ALLOWED_INTENTS:
        intent = "other"
    intent = _normalize_intent(intent)

    out_of_scope = bool(raw.get("out_of_scope")) or intent == "out_of_scope"
    refusal_hint = raw.get("refusal_hint")
    if refusal_hint is not None and not isinstance(refusal_hint, str):
        refusal_hint = None

    focus_route = _normalize_optional_str(raw.get("focus_route"))
    ui_workflow_key = _normalize_optional_str(raw.get("ui_workflow_key"))
    ui_workflow_keys: Optional[list[str]] = None
    raw_keys = raw.get("ui_workflow_keys")
    if isinstance(raw_keys, list):
        ui_workflow_keys = [str(k).strip() for k in raw_keys if isinstance(k, str) and str(k).strip()]
        if not ui_workflow_keys:
            ui_workflow_keys = None

    allowed = registered_tool_names()
    tool_calls: list[PlannedToolCall] = []
    raw_calls = raw.get("tool_calls") or []
    if isinstance(raw_calls, list):
        for item in raw_calls:
            if len(tool_calls) >= MAX_TOOL_CALLS:
                break
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not isinstance(name, str) or name.strip() not in allowed:
                continue
            name = name.strip()
            args = _normalize_arguments(name, item.get("arguments") or {})
            if any(tc.name == name and tc.arguments == args for tc in tool_calls):
                continue
            tool_calls.append(PlannedToolCall(name=name, arguments=args))

    needs_tools = bool(raw.get("needs_tools")) and bool(tool_calls) and not out_of_scope

    if out_of_scope:
        needs_tools = False
        tool_calls = []
    elif not tool_calls:
        needs_tools = False
    elif intent == "ui_navigation":
        # Pure dashboard navigation: workflows only, no ops tools.
        needs_tools = False
        tool_calls = []
    elif intent == "greeting":
        needs_tools = False
        tool_calls = []

    plan = IntentPlan(
        cleaned_query=cleaned,
        intent=intent,
        needs_tools=needs_tools,
        tool_calls=tool_calls if needs_tools else [],
        out_of_scope=out_of_scope,
        refusal_hint=refusal_hint.strip() if isinstance(refusal_hint, str) and refusal_hint.strip() else None,
        focus_route=focus_route,
        ui_workflow_key=ui_workflow_key,
        ui_workflow_keys=ui_workflow_keys,
    )
    # Lazy import avoids circular dependency at module load.
    from .route_policy import apply_route_policy

    return apply_route_policy(plan, original_message)


def _planner_system_prompt(tool_catalog: list[dict[str, Any]]) -> str:
    routes = route_catalog_for_planner()
    workflows = workflow_keys_for_planner()
    return (
        "You are an intent planner for the RAGSuite in-app AI Assistant (project operators). "
        "Given the user message, output ONLY a single JSON object (no markdown, no prose) with keys:\n"
        "cleaned_query (string: clear restatement of what the user wants),\n"
        "intent (one of: ops_metrics, ops_history, ops_system_health, crawl, jobs, docs, config, "
        "product_links, ui_navigation, greeting, out_of_scope, other),\n"
        "needs_tools (boolean),\n"
        "tool_calls (array of {name, arguments}; empty if none),\n"
        "focus_route (string or null: dashboard route slug from the route catalog when the ask maps to a screen),\n"
        "ui_workflow_key (string or null: workflow key from the UI workflow list when known),\n"
        "ui_workflow_keys (array of strings or null: multiple workflow keys when the ask covers chatbot and search embed),\n"
        "out_of_scope (boolean: true if not about this project dashboard / AI Assistant / official product links),\n"
        "refusal_hint (string or null).\n"
        "Rules:\n"
        "- Select tools ONLY from the tool catalog; never invent tool names.\n"
        "- Chatbot or search widget/embed/script/snippet integration: intent=ui_navigation, "
        "focus_route=chatbot-config and/or search-config, workflow keys chatbot_embed_integrations "
        "and/or search_embed_integrations. Not sidebar route configuration (platform API keys).\n"
        "- Chatbot or search Settings / Customization / Configuration how-tos "
        "(widget panels, domains, models, FAQ, etc.): intent=ui_navigation, "
        "focus_route=chatbot-config or search-config, ui_workflow_key from "
        "chatbot_settings_* or search_settings_* — not embed workflows unless the ask "
        "includes embed/script/snippet/integrate. Use only real UI labels from the catalog.\n"
        "- Broad inventory asks (what/which settings, types of settings, available options "
        "for chatbot or search): intent=ui_navigation, "
        "ui_workflow_key=chatbot_config_catalog or search_config_catalog — not embed "
        "and not a single chatbot_settings_* / search_settings_* section.\n"
        "- Create or add a project (All Projects): intent=ui_navigation, focus_route=projects, "
        "ui_workflow_key=create_project — not crawl-management / Sources.\n"
        "- Status questions (current / what is) about latency, usage, thumbs: intent=ops_metrics, "
        "needs_tools=true, tool_calls=[overview_metrics]; set focus_route=index when relevant.\n"
        "- When the user asks about a named dashboard area, set focus_route to that route slug from the catalog.\n"
        "- System Health screen (infrastructure / service status / health score): "
        "intent=ops_system_health, focus_route=system-health, needs_tools=true, "
        "tool_calls=[system_health_snapshot]. Never use overview_metrics for this.\n"
        "- Project usage analytics (query volume, thumbs, average response time / latency on Analytics): "
        "intent=ops_metrics, focus_route=index when relevant, use overview_metrics.\n"
        "- Dashboard click-path / navigation for a named route: intent=ui_navigation, needs_tools=false, "
        "tool_calls=[], set focus_route and ui_workflow_key when known.\n"
        "- Top N / frequent / popular chatbot query history: intent=ops_history, "
        "needs_tools=true, tool_calls=[top_chat_queries] with limit; "
        "focus_route=history. Never All Projects / create_project / settings catalog.\n"
        "- Top N / frequent search query history: intent=ops_history, "
        "needs_tools=true, tool_calls=[top_search_queries] with limit.\n"
        "- Greetings: intent=greeting, needs_tools=false.\n"
        "- Out of scope: out_of_scope=true, needs_tools=false.\n"
        "- Prefer the minimum set of tools (max "
        + str(MAX_TOOL_CALLS)
        + ").\n\n"
        "Dashboard routes (real sidebar labels):\n"
        + json.dumps(routes, ensure_ascii=False)
        + "\n\nUI workflow keys (for navigation answers):\n"
        + json.dumps(workflows, ensure_ascii=False)
        + "\n\nTool catalog:\n"
        + json.dumps(tool_catalog, ensure_ascii=False)
    )


def plan_intent(
    client: Any,
    *,
    model: str,
    user_message: str,
    history: Optional[list[dict[str, Any]]] = None,
) -> IntentPlan:
    """Run one low-temperature completion and validate into an IntentPlan."""
    original = user_message or ""
    catalog = tool_catalog_for_planner()
    if not catalog:
        return fallback_intent_plan(original)

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _planner_system_prompt(catalog)},
    ]
    if history:
        for item in history[-4:]:
            role = item.get("role")
            content = item.get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                messages.append({"role": role, "content": content.strip()[:1500]})
    messages.append({"role": "user", "content": original})

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=PLANNER_TEMPERATURE,
            max_tokens=512,
        )
        content = ""
        if response and getattr(response, "choices", None):
            content = (response.choices[0].message.content or "").strip()
        parsed = _extract_json_object(content)
        if parsed is None:
            logger.warning("AI Assistant intent planner returned non-JSON; using fallback")
            return fallback_intent_plan(original)
        return validate_intent_plan(parsed, original)
    except Exception:
        logger.exception("AI Assistant intent planner failed; using fallback")
        return fallback_intent_plan(original)
