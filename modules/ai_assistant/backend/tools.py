"""Read-only operational tools for the AI Assistant agent."""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import UUID

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models import (
    BackgroundJob,
    ChatMessage,
    ChatbotSettings,
    CrawlSource,
    QueryLog,
    SearchSettings,
    UploadedDocument,
)
from app.utils.api_key import mask_api_key

logger = logging.getLogger(__name__)

ToolFn = Callable[[Session, UUID, dict[str, Any]], Any]
PresenterFn = Callable[[dict[str, Any]], dict[str, Any]]

def build_system_prompt() -> str:
    """Operator-facing system prompt; sidebar labels loaded from the live route catalog."""
    try:
        from .ui_catalog import workflow_route_index

        routes = workflow_route_index()
        chatbot_label = routes.get("chatbot-config", "Chatbot Configuration")
        search_label = routes.get("search-config", "Search Configuration")
        ai_label = routes.get("ai-assistant", "AI Assistant")
    except Exception:
        chatbot_label = "Chatbot Configuration"
        search_label = "Search Configuration"
        ai_label = "AI Assistant"
    return (
        "You are the RAGSuite in-app AI Assistant for operators of this project dashboard. "
        "Answer ONLY the user's current question. Do not add unrelated metrics, sources, jobs, "
        "or marketing content. "
        "Use ONLY the grounding facts provided for this turn (and official product links when present). "
        "Never tell the user that grounding facts are missing or not provided — if you lack facts, "
        "give a short refusal to invent screens or data, without meta commentary about grounding. "
        f"Speak in dashboard operator language (Sources, Documents, jobs, {chatbot_label}, "
        f"{search_label}, {ai_label}). "
        "Never echo database field names, table names, JSON keys, tool/function names, or API/pipeline jargon. "
        "Never split answers into backend access vs frontend access. "
        "For UI how-to questions, respond only as dashboard steps a user can click in the app. "
        "Never invent URLs, domains, screens, menus, metrics, feature claims, API keys, "
        "or expansions of unknown acronyms (for example do not invent what MCP means). "
        "Never describe custom API/script integration wizards, pre/post-processing hooks, or Settings-tab "
        "integration flows unless they appear in grounding facts. "
        "For status/current/what-is ops questions, lead with tool grounding facts; "
        "for navigation how-to questions, use workflow steps. "
        "Use markdown **bold** for key UI labels and metric names when helpful. "
        "When official product links are present and the user asked for documentation/website/legal pages, "
        "copy those exact URLs — do not invent or substitute another domain. "
        "If ops tool facts are empty, say you could not load live numbers — do not guess. "
        "When ui_workflow facts are present, output ONLY those steps — no extra modules, edit/delete, or invented screens. "
        "Answer directly; never open with 'Based on the provided workflow/context/steps' or similar meta phrases. "
        "Never describe Experiments, Benchmark jobs, or generic Models tabs unless they appear in grounding facts. "
        "If the question is outside this project's operations, this AI Assistant, or official product links, "
        "refuse briefly and stay in scope. "
        "Never reveal full API keys."
    )


SYSTEM_PROMPT = build_system_prompt()

# Deploy defaults aligned with frontend/src/shared/constants/product-links.ts (web footer).
# Override at runtime via RAGSUITE_DOCS_URL / RAGSUITE_WEBSITE_URL / RAGSUITE_CONTACT_EMAIL, etc.
_PRODUCT_LINK_DEFAULTS: dict[str, str] = {
    "documentation": "https://docs.ragsuite.de/",
    "website": "https://www.ragsuite.de/",
    "pricing": "https://www.ragsuite.de/pricing/",
    "impressum": "https://ragsuite.de/impressum/",
    "datenschutz": "https://ragsuite.de/datenschutz/",
    "terms": "https://ragsuite.de/terms/",
    "avv": "https://ragsuite.de/avv/",
    "security_disclosure": "https://ragsuite.de/security/disclosure/",
    "contact_email": "sales@ragsuite.de",
}

_ENV_LINK_KEYS: dict[str, str] = {
    "documentation": "RAGSUITE_DOCS_URL",
    "website": "RAGSUITE_WEBSITE_URL",
    "pricing": "RAGSUITE_PRICING_URL",
    "impressum": "RAGSUITE_IMPRESSUM_URL",
    "datenschutz": "RAGSUITE_DATENSCHUTZ_URL",
    "terms": "RAGSUITE_TERMS_URL",
    "avv": "RAGSUITE_AVV_URL",
    "security_disclosure": "RAGSUITE_SECURITY_URL",
    "contact_email": "RAGSUITE_CONTACT_EMAIL",
}

# Hallucinated docs hosts rewritten to the resolved documentation URL.
_HALLUCINATED_DOCS_HOSTS = (
    "docs.ragsuite.ai",
    "documentation.ragsuite.ai",
    "docs.ragsuite.com",
)

# Internal JSON keys → operator labels (also used by sanitize). Derived from presenters.
FIELD_LABELS: dict[str, str] = {
    "query_log_count": "search queries",
    "chat_message_count": "chat messages",
    "avg_p95_latency_ms": "average response time (ms)",
    "thumbs_up": "thumbs up",
    "thumbs_down": "thumbs down",
    "thumbs_up_rate_pct": "thumbs-up rate (%)",
    "documents_count": "document count",
    "base_url": "source URL",
    "last_crawl_at": "last crawl",
    "job_type": "job type",
    "queued_at": "queued at",
    "finished_at": "finished at",
    "uploaded_documents": "uploaded documents",
    "crawl_documents_count": "crawled documents",
    "model_provider": "provider",
    "chat_model": "chat model",
    "search_model": "search model",
    "api_key_masked": "API key",
    "is_active": "active",
    "store_history_enabled": "store history",
    "configured": "configured",
    "overall_status": "overall status",
    "overall_health_score": "overall health score",
    "health_score": "health score",
}


def resolve_product_links() -> dict[str, str]:
    """Resolve product URLs from env overrides, else footer-aligned defaults."""
    links = dict(_PRODUCT_LINK_DEFAULTS)
    for key, env_name in _ENV_LINK_KEYS.items():
        raw = (os.environ.get(env_name) or "").strip()
        if raw:
            links[key] = raw
    return links


def sanitize_assistant_answer(text: str, links: dict[str, str] | None = None) -> str:
    """Rewrite known bad docs hosts and replace leaked internal field keys with labels."""
    if not text:
        return text
    resolved = links or resolve_product_links()
    docs_url = (resolved.get("documentation") or _PRODUCT_LINK_DEFAULTS["documentation"]).rstrip("/") + "/"
    out = text
    # Strip meta openings the answerer sometimes invents around workflow grounding.
    out = re.sub(
        r"(?is)^\s*(?:based on|according to)\s+the\s+provided\s+"
        r"(?:workflow(?:\s+steps)?|context|steps|information|facts)\s*[,:\-–—]?\s*",
        "",
        out,
        count=1,
    )
    for host in _HALLUCINATED_DOCS_HOSTS:
        out = re.sub(
            rf"https?://{re.escape(host)}[^\s\)\]\>\"']*",
            docs_url,
            out,
            flags=re.IGNORECASE,
        )
        out = re.sub(rf"\b{re.escape(host)}\b", docs_url, out, flags=re.IGNORECASE)
    # Longer keys first to avoid partial replacements.
    for key in sorted(FIELD_LABELS.keys(), key=len, reverse=True):
        label = FIELD_LABELS[key]
        out = re.sub(rf"\b{re.escape(key)}\b", label, out)
    for token in forbidden_response_terms():
        out = re.sub(rf"\b{re.escape(token)}\b", "dashboard", out)
    return out.strip()


def tool_product_links(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    """Return official RAGSuite product URLs (footer source + env overrides)."""
    _ = db, project_id, args
    return {
        "product": "RAGSuite",
        "links": resolve_product_links(),
        "note": "Use only these URLs. Do not invent alternate domains.",
    }


def _parse_limit(args: dict[str, Any], default: int = 5, max_limit: int = 20) -> int:
    raw = args.get("limit", default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = default
    return max(1, min(value, max_limit))


def tool_top_chat_queries(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    limit = _parse_limit(args, default=5)
    rows = (
        db.query(ChatMessage.user_message, func.count(ChatMessage.id).label("count"))
        .filter(
            ChatMessage.project_id == project_id,
            ChatMessage.message_type == "chat",
            ChatMessage.user_message.isnot(None),
            ChatMessage.user_message != "",
            ChatMessage.hidden_from_widget.is_(False),
        )
        .group_by(ChatMessage.user_message)
        .order_by(desc("count"))
        .limit(limit)
        .all()
    )
    return {
        "queries": [
            {"query": (row.user_message or "").strip()[:500], "count": int(row.count)}
            for row in rows
            if (row.user_message or "").strip()
        ]
    }


def tool_top_search_queries(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    limit = _parse_limit(args, default=5)
    rows = (
        db.query(QueryLog.query, func.count(QueryLog.id).label("count"))
        .filter(
            QueryLog.project_id == project_id,
            QueryLog.query.isnot(None),
            QueryLog.query != "",
        )
        .group_by(QueryLog.query)
        .order_by(desc("count"))
        .limit(limit)
        .all()
    )
    return {
        "queries": [
            {"query": (row.query or "").strip()[:500], "count": int(row.count)}
            for row in rows
            if (row.query or "").strip()
        ]
    }


def tool_system_health_snapshot(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    """Infrastructure/service status aligned with the System Health dashboard (not usage analytics)."""
    _ = args
    from app.platform.cli_hooks import get_hook

    collect = get_hook("system_health.assistant_snapshot")
    if collect is None:
        logger.warning("system_health.assistant_snapshot hook not registered")
        return {"error": "System health checks are unavailable in this environment."}
    try:
        result = collect(db, project_id)
        return result if isinstance(result, dict) else {"error": "Invalid system health snapshot."}
    except Exception as exc:
        logger.exception("system_health_snapshot failed")
        return {"error": str(exc)}


def tool_overview_metrics(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    days = _parse_limit(args, default=7, max_limit=90)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    total_queries = (
        db.query(func.count(QueryLog.id))
        .filter(QueryLog.project_id == project_id, QueryLog.timestamp >= since)
        .scalar()
        or 0
    )
    avg_latency = (
        db.query(func.avg(QueryLog.p95_latency))
        .filter(
            QueryLog.project_id == project_id,
            QueryLog.timestamp >= since,
            QueryLog.p95_latency.isnot(None),
        )
        .scalar()
    )
    chat_count = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.project_id == project_id,
            ChatMessage.message_type == "chat",
            ChatMessage.created_at >= since,
        )
        .scalar()
        or 0
    )
    thumbs = (
        db.query(ChatMessage.feedback, func.count(ChatMessage.id))
        .filter(
            ChatMessage.project_id == project_id,
            ChatMessage.message_type == "chat",
            ChatMessage.feedback.isnot(None),
            ChatMessage.created_at >= since,
        )
        .group_by(ChatMessage.feedback)
        .all()
    )
    up = 0
    down = 0
    for feedback_val, count in thumbs:
        if feedback_val is True:
            up += int(count)
        elif feedback_val is False:
            down += int(count)
    rated = up + down
    return {
        "days": days,
        "query_log_count": int(total_queries),
        "chat_message_count": int(chat_count),
        "avg_p95_latency_ms": round(float(avg_latency), 1) if avg_latency is not None else None,
        "thumbs_up": up,
        "thumbs_down": down,
        "thumbs_up_rate_pct": round((up / rated) * 100, 1) if rated else None,
    }


def tool_list_crawl_sources(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    limit = _parse_limit(args, default=10, max_limit=50)
    rows = (
        db.query(CrawlSource)
        .filter(CrawlSource.project_id == project_id)
        .order_by(desc(CrawlSource.updated_at))
        .limit(limit)
        .all()
    )
    return {
        "sources": [
            {
                "name": s.name,
                "base_url": s.base_url,
                "status": getattr(s.status, "value", str(s.status)) if s.status is not None else None,
                "documents_count": s.documents_count,
                "last_crawl_at": s.last_crawl_at.isoformat() if s.last_crawl_at else None,
            }
            for s in rows
        ]
    }


def tool_list_recent_jobs(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    limit = _parse_limit(args, default=10, max_limit=50)
    rows = (
        db.query(BackgroundJob)
        .filter(BackgroundJob.project_id == project_id)
        .order_by(desc(BackgroundJob.queued_at))
        .limit(limit)
        .all()
    )
    return {
        "jobs": [
            {
                "id": str(j.id),
                "job_type": j.job_type,
                "status": getattr(j.status, "value", str(j.status)) if j.status is not None else None,
                "error": (j.error or "")[:300] or None,
                "queued_at": j.queued_at.isoformat() if j.queued_at else None,
                "finished_at": j.finished_at.isoformat() if j.finished_at else None,
            }
            for j in rows
        ]
    }


def tool_document_stats(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    uploaded = (
        db.query(func.count(UploadedDocument.id))
        .filter(UploadedDocument.project_id == project_id)
        .scalar()
        or 0
    )
    crawl_docs = (
        db.query(func.coalesce(func.sum(CrawlSource.documents_count), 0))
        .filter(CrawlSource.project_id == project_id)
        .scalar()
        or 0
    )
    return {
        "uploaded_documents": int(uploaded),
        "crawl_documents_count": int(crawl_docs),
    }


def tool_describe_chatbot_config(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    row = (
        db.query(ChatbotSettings)
        .filter(ChatbotSettings.project_id == project_id)
        .order_by(desc(ChatbotSettings.updated_at))
        .first()
    )
    if not row:
        return {"configured": False}
    return {
        "configured": True,
        "model_provider": row.model_provider,
        "chat_model": row.chat_model,
        "api_key_masked": mask_api_key(row.api_key),
        "is_active": bool(row.is_active),
        "store_history_enabled": bool(getattr(row, "store_history_enabled", True)),
    }


def tool_describe_search_config(db: Session, project_id: UUID, args: dict[str, Any]) -> dict[str, Any]:
    row = (
        db.query(SearchSettings)
        .filter(SearchSettings.project_id == project_id)
        .order_by(desc(SearchSettings.updated_at))
        .first()
    )
    if not row:
        return {"configured": False}
    return {
        "configured": True,
        "model_provider": row.model_provider,
        "search_model": row.search_model,
        "api_key_masked": mask_api_key(row.api_key),
        "is_active": bool(getattr(row, "is_active", True)),
    }


def _fact(label: str, value: Any) -> dict[str, Any]:
    return {"label": label, "value": value}


def _present_top_search_queries(raw: dict[str, Any]) -> dict[str, Any]:
    queries = raw.get("queries") or []
    facts: list[dict[str, Any]] = []
    for item in queries:
        q = (item.get("query") or "").strip()
        if not q:
            continue
        facts.append(_fact(f"Frequent search question ({item.get('count', 0)}×)", q))
    return {
        "summary": "Most frequent search queries",
        "facts": facts or [_fact("Frequent search questions", "None found")],
    }


def _present_top_chat_queries(raw: dict[str, Any]) -> dict[str, Any]:
    queries = raw.get("queries") or []
    facts: list[dict[str, Any]] = []
    for item in queries:
        q = (item.get("query") or "").strip()
        if not q:
            continue
        facts.append(_fact(f"Frequent question ({item.get('count', 0)}×)", q))
    return {
        "summary": "Most frequent chatbot questions",
        "facts": facts or [_fact("Frequent questions", "None found")],
    }


def _present_overview_metrics(raw: dict[str, Any]) -> dict[str, Any]:
    days = raw.get("days", 7)
    facts = [
        _fact("Lookback (days)", days),
        _fact(FIELD_LABELS["query_log_count"], raw.get("query_log_count")),
        _fact(FIELD_LABELS["chat_message_count"], raw.get("chat_message_count")),
        _fact(FIELD_LABELS["avg_p95_latency_ms"], raw.get("avg_p95_latency_ms")),
        _fact(FIELD_LABELS["thumbs_up"], raw.get("thumbs_up")),
        _fact(FIELD_LABELS["thumbs_down"], raw.get("thumbs_down")),
        _fact(FIELD_LABELS["thumbs_up_rate_pct"], raw.get("thumbs_up_rate_pct")),
    ]
    return {"summary": f"Usage overview (last {days} days)", "facts": facts}


def _present_system_health_snapshot(raw: dict[str, Any]) -> dict[str, Any]:
    services = raw.get("services") or {}
    facts: list[dict[str, Any]] = [
        _fact(FIELD_LABELS["overall_status"], raw.get("overall_status")),
        _fact(FIELD_LABELS["overall_health_score"], raw.get("overall_health_score")),
    ]
    if isinstance(services, dict):
        for name, info in services.items():
            if not isinstance(info, dict):
                continue
            facts.append(
                _fact(
                    str(name),
                    {
                        "Status": info.get("status"),
                        "Health score": info.get("health_score"),
                        "Reason": info.get("reason"),
                    },
                )
            )
    return {
        "summary": "System Health (services)",
        "facts": facts or [_fact("System Health", "Unavailable")],
    }


def _present_list_crawl_sources(raw: dict[str, Any]) -> dict[str, Any]:
    sources = raw.get("sources") or []
    facts: list[dict[str, Any]] = []
    for s in sources:
        name = s.get("name") or "Unnamed source"
        facts.append(
            _fact(
                name,
                {
                    "URL": s.get("base_url"),
                    "Status": s.get("status"),
                    "Documents": s.get("documents_count"),
                    "Last crawl": s.get("last_crawl_at"),
                },
            )
        )
    return {
        "summary": "Crawl sources",
        "facts": facts or [_fact("Crawl sources", "None found")],
    }


def _present_list_recent_jobs(raw: dict[str, Any]) -> dict[str, Any]:
    jobs = raw.get("jobs") or []
    facts: list[dict[str, Any]] = []
    for j in jobs:
        facts.append(
            _fact(
                str(j.get("job_type") or "job"),
                {
                    "Status": j.get("status"),
                    "Error": j.get("error"),
                    "Queued": j.get("queued_at"),
                    "Finished": j.get("finished_at"),
                    "Id": j.get("id"),
                },
            )
        )
    return {
        "summary": "Recent background jobs",
        "facts": facts or [_fact("Jobs", "None found")],
    }


def _present_document_stats(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "summary": "Document counts",
        "facts": [
            _fact(FIELD_LABELS["uploaded_documents"], raw.get("uploaded_documents")),
            _fact(FIELD_LABELS["crawl_documents_count"], raw.get("crawl_documents_count")),
        ],
    }


def _present_describe_chatbot_config(raw: dict[str, Any]) -> dict[str, Any]:
    if not raw.get("configured"):
        return {"summary": "Chatbot model settings", "facts": [_fact("Configured", False)]}
    return {
        "summary": "Chatbot model settings",
        "facts": [
            _fact(FIELD_LABELS["model_provider"], raw.get("model_provider")),
            _fact(FIELD_LABELS["chat_model"], raw.get("chat_model")),
            _fact(FIELD_LABELS["api_key_masked"], raw.get("api_key_masked")),
            _fact(FIELD_LABELS["is_active"], raw.get("is_active")),
            _fact(FIELD_LABELS["store_history_enabled"], raw.get("store_history_enabled")),
        ],
    }


def _present_describe_search_config(raw: dict[str, Any]) -> dict[str, Any]:
    if not raw.get("configured"):
        return {"summary": "Search model settings", "facts": [_fact("Configured", False)]}
    return {
        "summary": "Search model settings",
        "facts": [
            _fact(FIELD_LABELS["model_provider"], raw.get("model_provider")),
            _fact(FIELD_LABELS["search_model"], raw.get("search_model")),
            _fact(FIELD_LABELS["api_key_masked"], raw.get("api_key_masked")),
            _fact(FIELD_LABELS["is_active"], raw.get("is_active")),
        ],
    }


def _present_product_links(raw: dict[str, Any]) -> dict[str, Any]:
    links = raw.get("links") or {}
    facts = [_fact(str(k).replace("_", " ").title(), v) for k, v in links.items()]
    return {
        "summary": "Official RAGSuite product links",
        "facts": facts,
        "note": raw.get("note"),
    }


TOOL_PRESENTERS: dict[str, PresenterFn] = {
    "top_search_queries": _present_top_search_queries,
    "top_chat_queries": _present_top_chat_queries,
    "overview_metrics": _present_overview_metrics,
    "system_health_snapshot": _present_system_health_snapshot,
    "list_crawl_sources": _present_list_crawl_sources,
    "list_recent_jobs": _present_list_recent_jobs,
    "document_stats": _present_document_stats,
    "describe_chatbot_config": _present_describe_chatbot_config,
    "describe_search_config": _present_describe_search_config,
    "product_links": _present_product_links,
}


def present_tool_result(name: str, raw: Any) -> dict[str, Any]:
    """Convert raw tool JSON into operator-facing summary + facts for the answerer."""
    if not isinstance(raw, dict):
        return {"summary": name, "facts": [_fact("Result", str(raw)[:2000])]}
    if raw.get("error"):
        return {"summary": name, "facts": [_fact("Error", raw.get("error"))]}
    presenter = TOOL_PRESENTERS.get(name)
    if not presenter:
        return {"summary": name, "facts": [_fact("Data", raw)]}
    try:
        return presenter(raw)
    except Exception as exc:
        logger.warning("AI Assistant presenter %s failed: %s", name, exc)
        return {"summary": name, "facts": [_fact("Data", "Unavailable")]}


TOOL_SPECS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "top_chat_queries",
            "description": "Return the most frequent end-user chatbot (widget chat) queries for this project.",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "description": "Max queries (default 5)"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "top_search_queries",
            "description": "Return the most frequent end-user search queries for this project (search history).",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "description": "Max queries (default 5)"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "overview_metrics",
            "description": (
                "Return project usage analytics (search/chat counts, thumbs, average response time). "
                "Not the System Health services screen."
            ),
            "parameters": {
                "type": "object",
                "properties": {"days": {"type": "integer", "description": "Lookback window in days (default 7)"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "system_health_snapshot",
            "description": (
                "Return infrastructure/service health for the System Health dashboard "
                "(overall status, health score, per-service status). "
                "Not project query/chat usage analytics."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_crawl_sources",
            "description": "List crawl/domain sources and their document counts for this project.",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_recent_jobs",
            "description": "List recent background jobs (crawl, ingest, connector sync) for this project.",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "document_stats",
            "description": "Return uploaded and crawled document counts for this project.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "describe_chatbot_config",
            "description": "Describe chatbot LLM configuration (provider/model; API key masked).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "describe_search_config",
            "description": "Describe search LLM configuration (provider/model; API key masked).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "product_links",
            "description": (
                "Return official RAGSuite product URLs (documentation, website, legal pages, contact). "
                "Use for documentation link, website, impressum, pricing, or support questions."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


def registered_tool_names() -> set[str]:
    """Tool names allowed by the live registry."""
    names: set[str] = set()
    for spec in TOOL_SPECS:
        fn = (spec.get("function") or {}) if isinstance(spec, dict) else {}
        name = fn.get("name")
        if isinstance(name, str) and name.strip():
            names.add(name.strip())
    return names


def forbidden_response_terms() -> set[str]:
    """Terms that should never appear in end-user answers."""
    terms = {
        "api",
        "endpoint",
        "database",
        "sql",
        "querylog",
        "backend",
        "function",
        "tool",
    }
    # Keep in sync with active registry without hardcoding tool names.
    terms.update(registered_tool_names())
    return terms


def tool_catalog_for_planner() -> list[dict[str, Any]]:
    """Dynamic catalog (name, description, parameters) for the intent planner prompt."""
    catalog: list[dict[str, Any]] = []
    for spec in TOOL_SPECS:
        fn = (spec.get("function") or {}) if isinstance(spec, dict) else {}
        name = fn.get("name")
        if not name:
            continue
        catalog.append(
            {
                "name": name,
                "description": fn.get("description") or "",
                "parameters": fn.get("parameters") or {"type": "object", "properties": {}},
            }
        )
    return catalog


TOOL_HANDLERS: dict[str, ToolFn] = {
    "top_search_queries": tool_top_search_queries,
    "top_chat_queries": tool_top_chat_queries,
    "overview_metrics": tool_overview_metrics,
    "system_health_snapshot": tool_system_health_snapshot,
    "list_crawl_sources": tool_list_crawl_sources,
    "list_recent_jobs": tool_list_recent_jobs,
    "document_stats": tool_document_stats,
    "describe_chatbot_config": tool_describe_chatbot_config,
    "describe_search_config": tool_describe_search_config,
    "product_links": tool_product_links,
}


def execute_tool(db: Session, project_id: UUID, name: str, arguments: Any) -> str:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return json.dumps({"error": f"Unknown tool: {name}"})
    args: dict[str, Any]
    if isinstance(arguments, str):
        try:
            args = json.loads(arguments) if arguments.strip() else {}
        except json.JSONDecodeError:
            args = {}
    elif isinstance(arguments, dict):
        args = arguments
    else:
        args = {}
    # Map "days" into overview helper which reads limit-style via days key
    if name == "overview_metrics" and "days" in args and "limit" not in args:
        args = {**args, "limit": args.get("days")}
    try:
        result = handler(db, project_id, args)
        return json.dumps(result, default=str)
    except Exception as exc:
        logger.exception("AI Assistant tool %s failed", name)
        return json.dumps({"error": str(exc)})


def heuristic_tools_for_message(message: str) -> list[str]:
    """Legacy keyword selector (tests / debug). Live path uses the intent planner instead.

    Does not dump default metrics on open questions.
    """
    text = (message or "").lower()
    names: list[str] = []
    if any(
        k in text
        for k in (
            "doc",
            "docs",
            "documentation",
            "website",
            "link",
            "impressum",
            "datenschutz",
            "pricing",
            "support",
            "contact",
            "sales@",
            "ragsuite.de",
        )
    ):
        names.append("product_links")
    if any(k in text for k in ("search history", "search queries", "search query")):
        names.append("top_search_queries")
    elif any(k in text for k in ("top", "popular", "frequent", "most asked", "queries", "questions")):
        names.append("top_chat_queries")
    if any(k in text for k in ("overview", "metric", "latency", "thumbs", "usage", "volume", "traffic")):
        names.append("overview_metrics")
    if any(k in text for k in ("crawl", "domain", "source", "website")):
        names.append("list_crawl_sources")
    if any(k in text for k in ("job", "sync", "stuck", "failed job", "background")):
        names.append("list_recent_jobs")
    if any(k in text for k in ("document", "upload", "file", "index")):
        names.append("document_stats")
    if any(k in text for k in ("chatbot model", "chat model", "chatbot config", "assistant model")):
        names.append("describe_chatbot_config")
    if any(k in text for k in ("search model", "search config")):
        names.append("describe_search_config")
    # No default dump — empty means "no tools from heuristics"
    seen: set[str] = set()
    ordered: list[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            ordered.append(n)
    return ordered
