"""Serve admin-configured search FAQ answers on the search endpoints without calling RAG.

Events mirror the search SSE contract (`token` deltas, then a `done` payload) so Search Test
and the embedded widget render the answer exactly like a generated one, with no sources.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, Optional

from sqlalchemy.orm import Session

from ..schemas import RagQuery
from .faq_common import FAQ_ANSWER_SOURCE, iter_paced_tokens, sse_event
from .search_faq import find_search_faq_answer

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SearchFaqContext:
    answer: str
    faq_id: str
    query: str
    session_id: str
    session_scope: str
    user_id: Optional[int]
    project_uuid: uuid.UUID
    api_key_id: Optional[uuid.UUID] = None
    search_language: Optional[str] = None
    start_time: float = field(default_factory=time.time)
    assistant_message_id: uuid.UUID = field(default_factory=uuid.uuid4)


def resolve_search_faq_context(
    db: Session,
    auth_result: dict,
    req: RagQuery,
) -> Optional[SearchFaqContext]:
    """Return the FAQ answer context for a clicked card, or None to run the normal RAG search.

    Skips the knowledge-base content gate (the answer is configured, not retrieved) but still
    rejects requests while search is deactivated.
    """
    if not (req.faq_id or "").strip():
        return None

    from .history_storage import build_session_scope
    from .search_run_context import (
        ensure_search_active,
        load_search_settings,
        resolve_search_project,
        resolve_search_session_id,
    )

    project = resolve_search_project(db, auth_result)
    settings = load_search_settings(db, project.user_id, project.project_uuid)
    match = find_search_faq_answer(settings, req.faq_id, req.query)
    if match is None:
        return None
    ensure_search_active(settings)

    language = getattr(settings, "search_language", None)
    return SearchFaqContext(
        answer=match["answer"],
        faq_id=match["id"],
        query=req.query,
        session_id=resolve_search_session_id(req, project.user_id),
        session_scope=build_session_scope(auth_result, project_id=project.project_uuid),
        user_id=project.user_id,
        project_uuid=project.project_uuid,
        api_key_id=project.api_key_id,
        search_language=str(language).strip() if language else None,
    )


def search_faq_retrieval_meta(ctx: SearchFaqContext) -> Dict[str, Any]:
    return {"answer_source": FAQ_ANSWER_SOURCE, "faq_id": ctx.faq_id}


def search_faq_response_data(ctx: SearchFaqContext) -> Dict[str, Any]:
    """Payload for the non-streaming `/search` endpoint."""
    return {
        "answer": ctx.answer,
        "sources": [],
        "message_id": str(ctx.assistant_message_id),
        "session_id": ctx.session_id,
        "retrieval_meta": search_faq_retrieval_meta(ctx),
    }


def persist_search_faq_answer(ctx: SearchFaqContext) -> None:
    from .search_persist import persist_search_exchange

    persist_search_exchange(
        user_id=ctx.user_id,
        project_uuid=ctx.project_uuid,
        session_id=ctx.session_id,
        message_id=ctx.assistant_message_id,
        query=ctx.query,
        answer=ctx.answer,
        sources=None,
        api_key_id=ctx.api_key_id,
        llm_config_dict=None,
        token_usage={},
        elapsed_ms=int((time.time() - ctx.start_time) * 1000),
        result_count=1,
        retrieval_meta=search_faq_retrieval_meta(ctx),
        search_language=ctx.search_language,
        session_scope=ctx.session_scope,
        answer_source=FAQ_ANSWER_SOURCE,
    )


async def stream_search_faq_answer(ctx: SearchFaqContext) -> AsyncIterator[str]:
    """Yield the configured answer as paced SSE token deltas, then the done payload."""
    yield ": keepalive\n\n"
    try:
        async for chunk in iter_paced_tokens(ctx.answer):
            yield sse_event({"token": chunk, "done": False})
    except asyncio.CancelledError:
        return

    yield sse_event({
        "token": "",
        "done": True,
        "message_id": str(ctx.assistant_message_id),
        "session_id": ctx.session_id,
        "retrieval_meta": search_faq_retrieval_meta(ctx),
        "sources": [],
        "token_usage": {},
        "final_answer": ctx.answer,
        "answer_updated": False,
    })
    try:
        persist_search_faq_answer(ctx)
    except Exception as exc:
        logger.warning("Search FAQ persist failed after done: %s", exc)
