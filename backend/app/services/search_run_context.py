"""Shared search request resolution for /search and /search/stream."""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..models import ChatbotSettings, Project, SearchSettings, User
from ..schemas import RagQuery, ResponseType

logger = logging.getLogger(__name__)

LoadHistoryFn = Callable[..., List[Dict[str, str]]]


@dataclass
class SearchRunContext:
    auth_type: str
    user_id: Optional[int]
    api_key_id: Optional[uuid.UUID]
    project_id: str
    project_uuid: uuid.UUID
    llm_config_dict: Optional[Dict[str, Any]]
    system_prompt: Optional[str]
    search_language: Optional[str]
    search_format_type: str
    max_tokens: int
    search_top_k: int
    search_similarity_threshold: float
    search_use_reranker: bool
    search_session_id: str
    recent_search_history: List[Dict[str, str]]
    embedding_provider: Optional[str]
    embedding_model: Optional[str]
    embedding_api_key: Optional[str]


def ensure_search_project_has_content(
    vdb: Any,
    db: Session,
    project_id: str,
    user_id: Optional[int],
) -> None:
    """Block search early when the project has no retrievable embedded content (same gate as chat)."""
    from ..services.knowledge_base_status import (
        no_embedded_content_detail,
        project_has_retrievable_content,
    )

    if project_has_retrievable_content(vdb, db, project_id, user_id, source="search"):
        return
    raise HTTPException(
        status_code=503,
        detail=no_embedded_content_detail(db, project_id, source="search"),
    )


def merge_search_rag_params(
    req: RagQuery,
    search_settings: Optional[SearchSettings],
    *,
    auth_type: str,
) -> Tuple[int, float, bool]:
    """Resolve topK / threshold / reranker from DB when widget or use_saved_rag_params."""
    use_saved = bool(req.use_saved_rag_params or auth_type == "widget")
    if use_saved and search_settings:
        top_k = (
            search_settings.search_top_k
            if search_settings.search_top_k is not None
            else req.topK
        )
        threshold = (
            search_settings.search_similarity_threshold
            if search_settings.search_similarity_threshold is not None
            else req.similarityThreshold
        )
        reranker = (
            search_settings.search_use_reranker
            if search_settings.search_use_reranker is not None
            else req.useReranker
        )
        logger.debug(
            "Using saved SearchSettings RAG params: top_k=%s threshold=%s reranker=%s",
            top_k,
            threshold,
            reranker,
        )
        return top_k, threshold, reranker
    return req.topK, req.similarityThreshold, req.useReranker


_SHORT_RESPONSE_MAX_TOKENS = 500
_LONG_RESPONSE_MAX_TOKENS = 1000


def _default_max_tokens_for_response_type(response_type: Optional[str]) -> int:
    if response_type == ResponseType.SHORT.value:
        return _SHORT_RESPONSE_MAX_TOKENS
    return _LONG_RESPONSE_MAX_TOKENS


def _effective_max_tokens(
    req: RagQuery,
    search_settings: Optional[SearchSettings],
    response_type: Optional[str],
    *,
    auth_type: str,
) -> int:
    use_saved = bool(req.use_saved_rag_params or auth_type == "widget")
    req_tokens = req.maxTokens
    is_short = response_type == ResponseType.SHORT.value

    if req_tokens is not None and req_tokens > 0 and not use_saved:
        if is_short and req_tokens < 200:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"maxTokens for SHORT response must be at least 200. "
                    f"You provided {req_tokens}. Please increase maxTokens to at least 200."
                ),
            )
        if is_short:
            return min(req_tokens, _SHORT_RESPONSE_MAX_TOKENS)
        return req_tokens

    if use_saved and search_settings and search_settings.search_max_tokens:
        saved = search_settings.search_max_tokens
        if saved > 0:
            if is_short:
                return min(saved, _SHORT_RESPONSE_MAX_TOKENS)
            return saved

    return _default_max_tokens_for_response_type(response_type)


def resolve_search_run_context(
    db: Session,
    auth_result: dict,
    req: RagQuery,
    *,
    rag_pipeline: Any,
    load_history_fn: LoadHistoryFn,
) -> SearchRunContext:
    auth_type = auth_result.get("type")
    api_key_id: Optional[uuid.UUID] = None
    api_key = None
    active_project = None
    project_id: Optional[str] = None
    project_uuid: Optional[uuid.UUID] = None
    user_id: Optional[int] = None

    if auth_type == "widget":
        widget_project_id = auth_result.get("project_id")
        if widget_project_id:
            try:
                project_uuid = (
                    widget_project_id
                    if isinstance(widget_project_id, uuid.UUID)
                    else uuid.UUID(str(widget_project_id))
                )
            except ValueError:
                project_uuid = None
        if project_uuid:
            project = db.query(Project).filter(Project.id == project_uuid).first()
            if project:
                user_id = project.owner_id
                active_project = project
            else:
                raise HTTPException(status_code=404, detail="Project not found")
        else:
            raise HTTPException(status_code=400, detail="Invalid project ID")
    else:
        if auth_type == "api_key":
            api_key = auth_result["api_key"]
            api_key_id = api_key.id
            if getattr(api_key, "created_by_id", None) is not None:
                user_id = api_key.created_by_id
        elif auth_type == "user":
            user = auth_result["user"]
            user_id = user.id

        if auth_type == "user" and user_id:
            from ..auth import ensure_user_active_project
            from ..routes.onboarding import _ob_get

            onboarding_data = _ob_get(user_id)
            if "data_source" in onboarding_data:
                temp_project_id = onboarding_data["data_source"].get("temp_project_id")
                if temp_project_id:
                    temp_project = db.query(Project).filter(
                        and_(
                            Project.id == uuid.UUID(temp_project_id),
                            Project.owner_id == user_id,
                        )
                    ).first()
                    if temp_project:
                        project_id = str(temp_project.id)
                        project_uuid = temp_project.id
                        active_project = temp_project

            if not active_project:
                user_row = db.query(User).filter(User.id == user_id).first()
                if user_row:
                    active_project = ensure_user_active_project(db, user_row)

            if active_project:
                project_id = str(active_project.id)
                project_uuid = active_project.id

    if active_project:
        project_id = str(active_project.id)
        project_uuid = active_project.id
    elif auth_type == "api_key" and api_key and getattr(api_key, "project_id", None):
        project_id = str(api_key.project_id)
        project_uuid = api_key.project_id

    if not project_id or not project_uuid:
        raise HTTPException(
            status_code=503,
            detail="No active project found. Please create or activate a project first.",
        )

    ensure_search_project_has_content(rag_pipeline.vdb, db, project_id, user_id)

    llm_config_dict: Optional[Dict[str, Any]] = None
    search_settings: Optional[SearchSettings] = None
    if user_id:
        search_settings = db.query(SearchSettings).filter(
            and_(
                SearchSettings.user_id == user_id,
                SearchSettings.project_id == project_uuid,
            )
        ).first()
        if search_settings:
            provider = search_settings.model_provider or ""
            provider_lower = provider.lower()
            provider_normalized = (
                "ollama" if "custom" in provider_lower or "ollama" in provider_lower else provider_lower
            )
            search_model = search_settings.search_model
            if not search_model:
                chatbot_settings = db.query(ChatbotSettings).filter(
                    and_(
                        ChatbotSettings.user_id == user_id,
                        ChatbotSettings.project_id == project_uuid,
                    )
                ).first()
                if chatbot_settings:
                    search_model = chatbot_settings.chat_model
            final_model = search_model or "gpt-4o-mini"
            if final_model == "gpt-4" and provider_normalized == "openai":
                final_model = "gpt-4o-mini"
            llm_config_dict = {
                "provider": provider_normalized,
                "chat_model": final_model,
                "api_key": search_settings.api_key,
                "temperature": search_settings.search_temperature,
                "top_p": search_settings.search_top_p,
                "best_of": search_settings.search_best_of,
                "frequency_penalty": search_settings.search_frequency_penalty,
                "presence_penalty": search_settings.search_presence_penalty,
            }

    if not search_settings and user_id:
        search_settings = db.query(SearchSettings).filter(
            and_(
                SearchSettings.user_id == user_id,
                SearchSettings.project_id == project_uuid,
            )
        ).first()

    system_prompt: Optional[str] = None
    response_type: Optional[str] = None
    search_language: Optional[str] = None
    if search_settings:
        if search_settings.is_search_active is False:
            raise HTTPException(
                status_code=403,
                detail="Search is currently deactivated. Please enable the activation button to use search features.",
            )
        if search_settings.search_prompt:
            system_prompt = search_settings.search_prompt
        if search_settings.search_language:
            search_language = search_settings.search_language
        if search_settings.search_response_config and isinstance(
            search_settings.search_response_config, dict
        ):
            response_type = search_settings.search_response_config.get("response_type")
    else:
        response_type = ResponseType.LONG.value
        search_language = "en"

    use_saved_response_type = bool(req.use_saved_rag_params or auth_type == "widget")
    if not use_saved_response_type and req.response_type is not None:
        response_type = req.response_type.value

    max_tokens = _effective_max_tokens(
        req, search_settings, response_type, auth_type=auth_type or ""
    )

    if response_type == ResponseType.LONG.value:
        search_format_type = "html_long"
    elif response_type == ResponseType.SHORT.value:
        search_format_type = "html_short"
    else:
        response_type = ResponseType.LONG.value
        search_format_type = "html_long"

    search_top_k, search_similarity_threshold, search_use_reranker = merge_search_rag_params(
        req, search_settings, auth_type=auth_type or ""
    )

    today = datetime.now(timezone.utc).date()
    date_str = today.strftime("%Y-%m-%d")
    if req.session_id:
        search_session_id = req.session_id
    elif user_id:
        search_session_id = f"search_{user_id}_{date_str}"
    else:
        search_session_id = f"search_{date_str}"

    recent_search_history: List[Dict[str, str]] = []
    history_turns = load_history_fn(
        db,
        session_id=search_session_id,
        project_id=project_uuid,
        message_type="search",
        include_hidden_from_widget=True,
        max_messages=20,
    )
    if history_turns:
        recent_search_history = history_turns[-6:]

    from ..services.rag.embedding_resolver import resolve_for_project as resolve_emb_for_project

    emb_provider, emb_model, emb_api_key = resolve_emb_for_project(
        db, project_id, source="search"
    )

    return SearchRunContext(
        auth_type=auth_type,
        user_id=user_id,
        api_key_id=api_key_id,
        project_id=project_id,
        project_uuid=project_uuid,
        llm_config_dict=llm_config_dict,
        system_prompt=system_prompt,
        search_language=search_language,
        search_format_type=search_format_type,
        max_tokens=max_tokens,
        search_top_k=search_top_k,
        search_similarity_threshold=search_similarity_threshold,
        search_use_reranker=search_use_reranker,
        search_session_id=search_session_id,
        recent_search_history=recent_search_history,
        embedding_provider=emb_provider,
        embedding_model=emb_model,
        embedding_api_key=emb_api_key,
    )
