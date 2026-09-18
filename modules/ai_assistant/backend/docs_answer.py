"""AI Assistant Sources-mode: answer from crawled docs via Search Test RAG path.

Read-only reuse of SearchSettings + RAGPipeline. Does not write search history
or touch chatbot / public search routes.
"""
from __future__ import annotations

import logging
from typing import Any, Iterator, Optional
from uuid import UUID

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models import AIAssistantSettings, ChatbotSettings, SearchSettings
from app.schemas import ResponseType
from app.services.rag.embedding_resolver import (
    read_project_search_settings,
    resolve_for_project,
)
from app.services.search_run_context import ensure_search_project_has_content
from app.utils.api_key import resolve_runtime_llm_api_key

from .preferences import answer_length_instruction, normalize_answer_length

logger = logging.getLogger(__name__)

_SHORT_RESPONSE_MAX_TOKENS = 500
_LONG_RESPONSE_MAX_TOKENS = 1000


def _search_settings_for_project(
    db: Session,
    *,
    project_id: UUID,
    user_id: Optional[int],
) -> Optional[SearchSettings]:
    row: Optional[SearchSettings] = None
    if user_id is not None:
        row = (
            db.query(SearchSettings)
            .filter(
                and_(
                    SearchSettings.user_id == user_id,
                    SearchSettings.project_id == project_id,
                )
            )
            .first()
        )
    if not row:
        row = read_project_search_settings(db, project_id)
    return row


def _build_search_llm_config(
    db: Session,
    *,
    project_id: UUID,
    user_id: Optional[int],
    search_settings: SearchSettings,
) -> dict[str, Any]:
    provider = search_settings.model_provider or ""
    provider_lower = provider.lower()
    provider_normalized = (
        "ollama" if "custom" in provider_lower or "ollama" in provider_lower else provider_lower
    )
    search_model = search_settings.search_model
    if not search_model and user_id is not None:
        chatbot_settings = (
            db.query(ChatbotSettings)
            .filter(
                and_(
                    ChatbotSettings.user_id == user_id,
                    ChatbotSettings.project_id == project_id,
                )
            )
            .first()
        )
        if chatbot_settings:
            search_model = chatbot_settings.chat_model
    final_model = search_model or "gpt-4o-mini"
    if final_model == "gpt-4" and provider_normalized == "openai":
        final_model = "gpt-4o-mini"
    return {
        "provider": provider_normalized,
        "chat_model": final_model,
        "api_key": resolve_runtime_llm_api_key(
            db,
            user_id=user_id,
            project_id=project_id,
            provider=provider_normalized,
            profile_type="search",
            settings_api_key=search_settings.api_key,
            settings_provider=search_settings.model_provider,
        ),
        "temperature": search_settings.search_temperature,
        "top_p": search_settings.search_top_p,
        "best_of": search_settings.search_best_of,
        "frequency_penalty": search_settings.search_frequency_penalty,
        "presence_penalty": search_settings.search_presence_penalty,
    }


def _format_and_tokens(
    search_settings: Optional[SearchSettings],
    *,
    assistant_settings: Optional[AIAssistantSettings] = None,
) -> tuple[str, int]:
    """
    Sources mode always uses markdown (AI Assistant chat renderer).

    Prefer assistant answer_length when set; otherwise keep short/long from Search response_type.
    """
    from .preferences import sources_max_tokens

    if assistant_settings is not None and getattr(assistant_settings, "answer_length", None):
        return "markdown", sources_max_tokens(assistant_settings.answer_length)

    response_type = ResponseType.LONG.value
    if search_settings and search_settings.search_response_config and isinstance(
        search_settings.search_response_config, dict
    ):
        response_type = (
            search_settings.search_response_config.get("response_type") or response_type
        )
    max_tokens = (
        _SHORT_RESPONSE_MAX_TOKENS
        if response_type == ResponseType.SHORT.value
        else _LONG_RESPONSE_MAX_TOKENS
    )
    return "markdown", max_tokens


def _absolutize_citation_image(image: str, page_url: str) -> str:
    raw = (image or "").strip()
    if not raw:
        return ""
    if raw.startswith(("http://", "https://", "data:")):
        return raw
    base = (page_url or "").strip()
    if not base.startswith(("http://", "https://")):
        return raw
    try:
        from urllib.parse import urljoin

        return urljoin(base, raw)
    except Exception:
        return raw


def _citation_items_from_retrieval_meta(meta: dict[str, Any], *, limit: int = 5) -> list[dict[str, str]]:
    """Compact title/url/image list from stream_query retrieval_ready metadata."""
    raw_metas = meta.get("raw_contexts_metadatas") or meta.get("metadatas") or []
    if not isinstance(raw_metas, list):
        return []
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for idx, raw in enumerate(raw_metas):
        if not isinstance(raw, dict):
            continue
        url = (
            str(raw.get("url") or raw.get("source_url") or raw.get("page_url") or "")
            .strip()
        )
        title = str(raw.get("title") or raw.get("source") or raw.get("file_name") or "").strip()
        if not url and not title:
            continue
        key = url or title
        if key in seen:
            continue
        seen.add(key)
        image = _absolutize_citation_image(
            str(raw.get("og_image") or raw.get("image") or ""),
            url,
        )
        item: dict[str, str] = {
            "title": title or f"Source {idx + 1}",
            "url": url,
        }
        if image:
            item["image"] = image
        items.append(item)
        if len(items) >= limit:
            break
    return items


def normalize_sources_answer_spacing(text: str) -> str:
    """
    Light spacing fix for Sources-mode answers (assistant-only).

    Turns jammed inline lists into Markdown-friendly line breaks without
    rewriting wording or translating.
    """
    import re

    if not text or not str(text).strip():
        return text
    t = str(text).replace("\r\n", "\n").replace("\r", "\n")
    # "Section: - item" → section then list on new lines
    t = re.sub(r":[ \t]*-[ \t]+", ":\n\n- ", t)
    # Jammed inline list markers " - next" → newline + bullet (not already at BOL)
    t = re.sub(r"(?<!\n)[ \t]+-[ \t]+", "\n- ", t)
    # Blank line before markdown AT headers when glued to prior text
    t = re.sub(r"([^\n])\n(#{1,6}[ \t]+)", r"\1\n\n\2", t)
    # Blank line after a paragraph before a section label that opens a list
    t = re.sub(
        r"([^\n])\n([^\n]{1,80}:\n\n- )",
        r"\1\n\n\2",
        t,
    )
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def run_docs_answer_turn(
    db: Session,
    *,
    project_id: UUID,
    user_id: Optional[int],
    user_message: str,
    history: Optional[list[dict[str, Any]]] = None,
    assistant_settings: Optional[AIAssistantSettings] = None,
) -> Iterator[dict[str, Any]]:
    """
    Yield assistant SSE-shaped events from Search-mode RAG (answer text only).

    Events: {"type":"token","content":...} | {"type":"done","content":...} | {"type":"error",...}
    """
    query = (user_message or "").strip()
    if not query:
        yield {"type": "error", "message": "Message is empty."}
        return

    try:
        from app.routes.rag import RAG_AVAILABLE, rag_pipeline
    except Exception:
        logger.exception("AI Assistant sources mode: failed to import RAG pipeline")
        yield {
            "type": "error",
            "message": "Document search is not available right now.",
        }
        return

    if not RAG_AVAILABLE or rag_pipeline is None:
        yield {
            "type": "error",
            "message": "Document search is not available right now.",
        }
        return

    search_settings = _search_settings_for_project(db, project_id=project_id, user_id=user_id)
    if search_settings is not None and search_settings.is_search_active is False:
        yield {
            "type": "error",
            "message": (
                "Search is currently deactivated. Enable Search in Search Configuration "
                "to answer from Sources and documents."
            ),
        }
        return

    if not search_settings or not (search_settings.search_model or search_settings.model_provider):
        yield {
            "type": "error",
            "message": (
                "Configure Search models in Search Configuration before using Sources mode."
            ),
        }
        return

    project_id_str = str(project_id)
    try:
        ensure_search_project_has_content(rag_pipeline.vdb, db, project_id_str, user_id)
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        yield {"type": "error", "message": str(detail)}
        return

    llm_config = _build_search_llm_config(
        db,
        project_id=project_id,
        user_id=user_id,
        search_settings=search_settings,
    )
    if not (llm_config.get("api_key") or "").strip() and (llm_config.get("provider") or "") != "ollama":
        yield {
            "type": "error",
            "message": "Search API key is not configured for this project.",
        }
        return

    format_type, max_tokens = _format_and_tokens(
        search_settings,
        assistant_settings=assistant_settings,
    )
    search_language = "en"
    if search_settings.search_language and str(search_settings.search_language).strip():
        search_language = str(search_settings.search_language).strip()
    elif assistant_settings and getattr(assistant_settings, "language", None):
        lang = str(assistant_settings.language or "").strip()
        if lang:
            search_language = lang

    top_k = search_settings.search_top_k if search_settings.search_top_k is not None else 5
    threshold = (
        search_settings.search_similarity_threshold
        if search_settings.search_similarity_threshold is not None
        else 0.2
    )
    use_reranker = (
        bool(search_settings.search_use_reranker)
        if search_settings.search_use_reranker is not None
        else False
    )

    emb_provider, emb_model, emb_api_key = resolve_for_project(
        db, project_id_str, source="search"
    )

    chat_history: list[dict[str, str]] = []
    if history:
        for item in history[-4:]:
            role = item.get("role")
            content = item.get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                chat_history.append({"role": role, "content": content.strip()[:4000]})

    system_prompt = None
    if search_settings.search_prompt:
        system_prompt = search_settings.search_prompt
    length_key = (
        normalize_answer_length(getattr(assistant_settings, "answer_length", None))
        if assistant_settings is not None
        else "balanced"
    )
    length_instruction = answer_length_instruction(length_key)
    if length_instruction:
        system_prompt = (
            f"{system_prompt.strip()}\n\n{length_instruction}"
            if system_prompt and str(system_prompt).strip()
            else length_instruction
        )

    show_citations = bool(
        assistant_settings and getattr(assistant_settings, "show_citations", False)
    )
    citations_emitted = False

    full_parts: list[str] = []
    try:
        for delta, meta in rag_pipeline.stream_query(
            user_query=query,
            top_k=int(top_k),
            max_tokens=int(max_tokens),
            user_id=user_id,
            project_id=project_id_str,
            llm_config=llm_config,
            system_prompt=system_prompt,
            language_code=search_language,
            similarity_threshold=float(threshold),
            use_reranker=use_reranker,
            chat_history=chat_history or None,
            mode="search",
            format_type=format_type,
            embedding_provider=emb_provider,
            embedding_model=emb_model,
            embedding_api_key=emb_api_key,
        ):
            if delta and meta is None:
                full_parts.append(delta)
                yield {"type": "token", "content": delta}
            elif meta is not None and meta.get("error"):
                yield {"type": "error", "message": str(meta.get("error"))}
                return
            elif (
                show_citations
                and not citations_emitted
                and isinstance(meta, dict)
                and meta.get("retrieval_ready")
            ):
                items = _citation_items_from_retrieval_meta(meta)
                if items:
                    citations_emitted = True
                    yield {"type": "sources", "items": items}
    except Exception as exc:
        logger.exception("AI Assistant sources-mode RAG failed")
        yield {"type": "error", "message": str(exc) or "Document search failed."}
        return

    final_text = "".join(full_parts).strip()
    if not final_text:
        final_text = (
            "I could not find an answer in the crawled Sources and documents for this project."
        )
    else:
        final_text = normalize_sources_answer_spacing(final_text)
    yield {"type": "done", "content": final_text}


__all__ = ["normalize_sources_answer_spacing", "run_docs_answer_turn"]
