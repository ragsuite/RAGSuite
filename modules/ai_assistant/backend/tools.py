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

SYSTEM_PROMPT = (
    "You are the RAGSuite project assistant for operators of this application. "
    "Answer ONLY using (1) tool results for this project and (2) the official product links "
    "injected in context / returned by the product_links tool. "
    "Be concrete and concise. Never invent URLs, domains, metrics, feature claims, or API keys. "
    "When the user asks for documentation, website, or legal pages, copy the exact URL from "
    "the product_links payload — do not invent or substitute another domain. "
    "Do not say you lack access to a link when it is present in that payload. "
    "If project tools return no data for an ops question, say so clearly and point the user to "
    "the documentation URL from product_links when helpful — do not guess. "
    "Never reveal full API keys."
)

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


def resolve_product_links() -> dict[str, str]:
    """Resolve product URLs from env overrides, else footer-aligned defaults."""
    links = dict(_PRODUCT_LINK_DEFAULTS)
    for key, env_name in _ENV_LINK_KEYS.items():
        raw = (os.environ.get(env_name) or "").strip()
        if raw:
            links[key] = raw
    return links


def sanitize_assistant_answer(text: str, links: dict[str, str] | None = None) -> str:
    """Replace known hallucinated docs hosts with the resolved documentation URL."""
    if not text:
        return text
    resolved = links or resolve_product_links()
    docs_url = (resolved.get("documentation") or _PRODUCT_LINK_DEFAULTS["documentation"]).rstrip("/") + "/"
    out = text
    for host in _HALLUCINATED_DOCS_HOSTS:
        out = re.sub(
            rf"https?://{re.escape(host)}[^\s\)\]\>\"']*",
            docs_url,
            out,
            flags=re.IGNORECASE,
        )
        out = re.sub(rf"\b{re.escape(host)}\b", docs_url, out, flags=re.IGNORECASE)
    return out


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


TOOL_SPECS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "top_chat_queries",
            "description": "Return the most frequent end-user chatbot queries for this project.",
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
            "description": "Return usage metrics: query counts, latency, thumbs-up rate for this project.",
            "parameters": {
                "type": "object",
                "properties": {"days": {"type": "integer", "description": "Lookback window in days (default 7)"}},
            },
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

TOOL_HANDLERS: dict[str, ToolFn] = {
    "top_chat_queries": tool_top_chat_queries,
    "overview_metrics": tool_overview_metrics,
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
    """Fallback tool selection when the model cannot emit native tool calls."""
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
    if any(k in text for k in ("top", "popular", "frequent", "most asked", "queries", "questions")):
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
    if not names:
        # Default useful context for open questions
        names = ["product_links", "overview_metrics", "top_chat_queries"]
    # Preserve order, unique
    seen: set[str] = set()
    ordered: list[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            ordered.append(n)
    return ordered
