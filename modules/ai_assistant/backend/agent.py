"""AI Assistant agent: Planner → Tools → Answerer over project operational data."""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Iterator, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import AIAssistantSettings
from app.services.rag.language_config import build_language_instruction
from app.utils.api_key import normalize_provider_for_connection_test

from .intent import IntentPlan, plan_intent
from .tools import (
    build_system_prompt,
    execute_tool,
    present_tool_result,
    resolve_product_links,
    sanitize_assistant_answer,
)
from .ui_catalog import allowed_route_labels, query_has_embed_signal, workflow_route_index
from .route_policy import classify_ask_mode
from .ui_workflows import (
    WorkflowMatch,
    match_ui_workflows,
    render_config_catalog_answer_text,
    render_ui_howto_answer_text,
    render_ui_workflow_facts,
    render_workflow_answer_text,
)
from .ui_config_surfaces import is_config_settings_workflow_key
from .ui_app_surfaces import is_inventory_catalog_workflow_key

logger = logging.getLogger(__name__)


def _openai_compatible_base(provider: str, base_url: Optional[str]) -> tuple[str, Optional[str]]:
    """Return (base_url, default_header_style) for OpenAI-compatible clients."""
    p = normalize_provider_for_connection_test(provider)
    if base_url and base_url.strip():
        return base_url.rstrip("/"), p
    if p == "mistral":
        return "https://api.mistral.ai/v1", p
    if p == "ollama":
        return (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434/v1").rstrip("/"), p
    if p == "gemini":
        return "https://generativelanguage.googleapis.com/v1beta/openai", p
    return "https://api.openai.com/v1", p


def _build_client(settings: AIAssistantSettings):
    from openai import OpenAI

    provider = normalize_provider_for_connection_test(settings.model_provider)
    base_url, _ = _openai_compatible_base(provider, settings.base_url)
    api_key = (settings.api_key or "").strip() or ("ollama" if provider == "ollama" else "")
    if not api_key and provider != "ollama":
        raise ValueError("AI Assistant API key is not configured for this project.")
    return OpenAI(api_key=api_key or "ollama", base_url=base_url), provider


def _model_name(settings: AIAssistantSettings, provider: str) -> str:
    if settings.chat_model and settings.chat_model.strip():
        return settings.chat_model.strip()
    defaults = {
        "openai": "gpt-4o-mini",
        "mistral": "mistral-small-latest",
        "gemini": "gemini-2.0-flash",
        "ollama": "llama3.2",
    }
    return defaults.get(provider, "gpt-4o-mini")


def _temperature(settings: AIAssistantSettings) -> float:
    """Prefer low temperature to reduce invented URLs and metrics."""
    try:
        value = float(settings.temperature) if settings.temperature else 0.1
    except (TypeError, ValueError):
        value = 0.1
    return max(0.0, min(value, 0.2))


def _product_links_system_message(presented: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    if presented is not None:
        payload = presented
    else:
        payload = {
            "product": "RAGSuite",
            "links": resolve_product_links(),
            "note": "Use only these URLs. Do not invent alternate domains.",
        }
    return {
        "role": "system",
        "content": (
            "Official RAGSuite product links (authoritative — copy URLs only from this payload):\n"
            + json.dumps(payload, ensure_ascii=False, default=str)
        ),
    }


def _grounding_system_message(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "role": "system",
        "content": (
            "Grounding facts for this turn only (operator-facing). "
            "Answer using these facts and do not invent additional project data:\n"
            + json.dumps(blocks, ensure_ascii=False, default=str)
        ),
    }


def _strict_ui_workflow_message() -> dict[str, Any]:
    return {
        "role": "system",
        "content": (
            "UI workflow mode: answer using ONLY the numbered workflow steps provided. "
            "Write as a helpful assistant (short prose is fine). "
            "Start with the answer directly — do not open with phrases like "
            "'Based on the provided workflow', 'Based on the provided context', "
            "or 'Based on the provided steps'. "
            "Use markdown **bold** for sidebar labels and button names. "
            "Use ONLY the exact labels that appear in those steps "
            "(module name, tab, settings section, feature panel). "
            "Do not invent section names that are not in the steps. "
            "Do not say a listed feature may be unavailable or unsupported. "
            "Do not mention edit, delete, API, backend, tools, or screens not listed in those steps."
        ),
    }


def _status_hybrid_message() -> dict[str, Any]:
    return {
        "role": "system",
        "content": (
            "Status mode: lead with the live numbers from grounding facts. "
            "Mention where to verify in the dashboard only briefly if helpful. "
            "Do not turn a status question into a click-path tutorial. "
            "Use markdown **bold** for key metric names and values."
        ),
    }


def _howto_hybrid_message() -> dict[str, Any]:
    return {
        "role": "system",
        "content": (
            "Hybrid mode: explain where to see this in the dashboard using workflow steps, "
            "then add any numeric facts from grounding without naming tools or APIs. "
            "Use markdown **bold** for sidebar labels and button names."
        ),
    }


def _system_health_label() -> str:
    return workflow_route_index().get("system-health") or "System Health"


def _navigation_refusal_message() -> str:
    labels = allowed_route_labels()
    sample = ", ".join(labels[:12]) if labels else "Sources, Analytics, History, Compare Models"
    docs = resolve_product_links().get("documentation", "")
    return (
        "I don't have a guided click-path for that yet in AI Assistant. "
        f"Try these dashboard areas: {sample}. "
        + (f"Documentation: {docs}" if docs else "")
    )


def _ungrounded_fallback_message() -> str:
    labels = allowed_route_labels()
    sample = ", ".join(labels[:10]) if labels else "Analytics, Sources, History"
    docs = resolve_product_links().get("documentation", "")
    return (
        "I couldn't match that question to a specific screen or data source in this project dashboard. "
        f"Please ask about a named area ({sample}) or rephrase with the screen you are trying to use. "
        + (f"Product documentation: {docs}" if docs else "")
    )


def _is_navigation_intent(plan: IntentPlan) -> bool:
    return plan.intent in ("ui_navigation", "ui_howto", "ui_crawl_sources", "config")


def _should_use_ungrounded_fallback(
    plan: IntentPlan,
    user_message: str,
    ui_matches: list[WorkflowMatch],
    presented_blocks: list[dict[str, Any]],
) -> bool:
    if plan.out_of_scope or plan.intent == "greeting":
        return False
    if presented_blocks:
        return False
    if ui_matches:
        return False
    query = (user_message or "").strip() or (plan.cleaned_query or "")
    navigationish = plan.intent in (
        "ui_navigation",
        "ui_howto",
        "ui_crawl_sources",
        "config",
        "crawl",
        "docs",
        "jobs",
        "other",
    )
    return navigationish or query_has_embed_signal(query)


def _stream_text(final_text: str) -> Iterator[dict[str, Any]]:
    chunk_size = 48
    for i in range(0, len(final_text), chunk_size):
        yield {"type": "token", "content": final_text[i : i + chunk_size]}
    yield {"type": "done", "content": final_text}


def _out_of_scope_system_message(plan: IntentPlan) -> dict[str, Any]:
    hint = plan.refusal_hint or (
        "Politely refuse: you only help with this project's dashboard operations, "
        "AI Assistant usage, and official RAGSuite product links."
    )
    return {"role": "system", "content": f"Out-of-scope request. {hint}"}


def run_assistant_turn(
    db: Session,
    *,
    project_id: UUID,
    settings: AIAssistantSettings,
    history: list[dict[str, Any]],
    user_message: str,
) -> Iterator[dict[str, Any]]:
    """
    Yield events:
      {"type":"token","content":"..."}
      {"type":"tool","name":"...","result":{...}}
      {"type":"done","content":"..."}
      {"type":"error","message":"..."}
    """
    try:
        client, provider = _build_client(settings)
    except Exception as exc:
        yield {"type": "error", "message": str(exc)}
        return

    model = _model_name(settings, provider)

    try:
        plan = plan_intent(
            client,
            model=model,
            user_message=user_message,
            history=history,
        )

        presented_blocks: list[dict[str, Any]] = []
        product_links_presented: Optional[dict[str, Any]] = None
        # Prefer the original user message so planner cleaned_query cannot drop feature tokens.
        match_text = (user_message or "").strip() or (plan.cleaned_query or "")
        ui_matches = match_ui_workflows(
            match_text,
            focus_route=plan.focus_route,
            workflow_key=plan.ui_workflow_key,
            workflow_keys=plan.ui_workflow_keys,
        )
        for ui_match in ui_matches:
            presented_blocks.append(render_ui_workflow_facts(ui_match))

        ui_match = ui_matches[0] if ui_matches else None
        nav_only_workflow = bool(ui_matches) and all(m.workflow.scope == "navigation_only" for m in ui_matches)
        allow_tools = plan.needs_tools and plan.tool_calls and not plan.out_of_scope
        if nav_only_workflow and _is_navigation_intent(plan):
            allow_tools = False

        if allow_tools:
            for tc in plan.tool_calls:
                raw = execute_tool(db, project_id, tc.name, tc.arguments)
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = {"raw": raw}
                presented = present_tool_result(tc.name, parsed)
                presented_blocks.append({"tool": tc.name, **presented})
                if tc.name == "product_links":
                    product_links_presented = presented
                yield {"type": "tool", "name": tc.name, "result": presented}

        if _should_use_ungrounded_fallback(plan, user_message, ui_matches, presented_blocks):
            final_text = sanitize_assistant_answer(
                _ungrounded_fallback_message(),
                resolve_product_links(),
            )
            yield from _stream_text(final_text)
            return

        if _is_navigation_intent(plan) and not ui_matches and not presented_blocks and not plan.out_of_scope:
            final_text = sanitize_assistant_answer(
                _navigation_refusal_message(),
                resolve_product_links(),
            )
            yield from _stream_text(final_text)
            return

        has_tool_facts = any(isinstance(b, dict) and b.get("tool") for b in presented_blocks)
        workflow_blocks = [b for b in presented_blocks if isinstance(b, dict) and b.get("kind") == "ui_workflow"]
        ask_mode = classify_ask_mode(match_text, intent=plan.intent)

        catalog_blocks = [
            b
            for b in workflow_blocks
            if is_inventory_catalog_workflow_key(str(b.get("key") or ""))
        ]
        if catalog_blocks and not has_tool_facts:
            final_text = sanitize_assistant_answer(
                render_config_catalog_answer_text(catalog_blocks),
                resolve_product_links(),
            )
            if final_text:
                yield from _stream_text(final_text)
                return

        # Feature-panel how-tos: deterministic steps (do not depend on LLM obedience).
        feature_howto_blocks = [
            b
            for b in workflow_blocks
            if isinstance(b, dict)
            and is_config_settings_workflow_key(str(b.get("key") or ""))
            and b.get("feature_panel")
        ]
        if feature_howto_blocks and not has_tool_facts and ask_mode == "howto":
            final_text = sanitize_assistant_answer(
                render_ui_howto_answer_text(feature_howto_blocks),
                resolve_product_links(),
            )
            if final_text:
                yield from _stream_text(final_text)
                return

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": build_system_prompt()},
        ]
        language_instruction = build_language_instruction(getattr(settings, "language", None) or "en")
        if language_instruction:
            messages.append({"role": "system", "content": language_instruction.strip()})

        if plan.out_of_scope:
            messages.append(_out_of_scope_system_message(plan))
        if presented_blocks:
            messages.append(_grounding_system_message(presented_blocks))
            has_health_tool = any(
                isinstance(b, dict) and b.get("tool") == "system_health_snapshot" for b in presented_blocks
            )
            if ui_match and has_tool_facts:
                if ask_mode == "status" or plan.intent in ("ops_metrics", "ops_system_health", "ops_history"):
                    messages.append(_status_hybrid_message())
                else:
                    messages.append(_howto_hybrid_message())
            elif ui_match and not has_tool_facts:
                messages.append(_strict_ui_workflow_message())
            elif has_health_tool and not ui_match:
                label = _system_health_label()
                messages.append(
                    {
                        "role": "system",
                        "content": (
                            f"Answer from the service health facts only. "
                            f"Point operators to the {label} screen in the sidebar for the live dashboard. "
                            "Do not invent Crawl, Documents, or usage analytics advice. "
                            "Use markdown **bold** for status and scores."
                        ),
                    }
                )
        if product_links_presented is not None:
            messages.append(_product_links_system_message(product_links_presented))

        for item in history:
            role = item.get("role")
            if role in ("user", "assistant") and item.get("content"):
                messages.append({"role": role, "content": item["content"]})

        messages.append({"role": "user", "content": match_text})

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": _temperature(settings),
        }
        if settings.max_tokens:
            kwargs["max_tokens"] = int(settings.max_tokens)

        response = client.chat.completions.create(**kwargs)
        final_text = (response.choices[0].message.content or "").strip()
        if not final_text and nav_only_workflow and workflow_blocks and not has_tool_facts:
            final_text = render_workflow_answer_text(workflow_blocks)
        if not final_text:
            final_text = "No response generated. Check AI Assistant model settings."

        final_text = sanitize_assistant_answer(final_text, resolve_product_links())
        yield from _stream_text(final_text)
    except Exception as exc:
        logger.exception("AI Assistant turn failed")
        yield {"type": "error", "message": str(exc)}
