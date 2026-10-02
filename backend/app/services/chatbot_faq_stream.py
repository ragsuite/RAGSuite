"""Serve admin-configured FAQ answers on the chat endpoints without calling RAG.

The stream mirrors the chat SSE contract (`token` deltas, then a `done` payload) so the
widget renders it exactly like a generated answer, with no sources.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, Optional

from .faq_common import (
    FAQ_ANSWER_SOURCE,
    FAQ_STREAM_MAX_CHUNKS,
    chunk_faq_answer,
    faq_answer_for_history,
    iter_paced_tokens,
    sse_event,
    stamp_answer_source,
)

logger = logging.getLogger(__name__)

__all__ = [
    "FAQ_STREAM_MAX_CHUNKS",
    "FaqAnswerContext",
    "chunk_faq_answer",
    "faq_answer_response_data",
    "faq_retrieval_meta",
    "persist_faq_answer",
    "record_faq_answer_in_session",
    "stream_faq_answer",
]


@dataclass(frozen=True)
class FaqAnswerContext:
    answer: str
    faq_id: str
    user_message: str
    session_id: str
    session_scope: str
    user_id: Any
    project_uuid: Optional[uuid.UUID]
    api_key_id: Any = None
    session_ttl_kwargs: Dict[str, Any] = field(default_factory=dict)
    start_time: float = field(default_factory=time.time)
    assistant_message_id: uuid.UUID = field(default_factory=uuid.uuid4)


def faq_retrieval_meta(ctx: FaqAnswerContext) -> Dict[str, Any]:
    return {"answer_source": FAQ_ANSWER_SOURCE, "faq_id": ctx.faq_id}


def faq_answer_response_data(ctx: FaqAnswerContext) -> Dict[str, Any]:
    """Payload for the non-streaming `/chat/message` endpoint."""
    return {
        "answer": ctx.answer,
        "sources": [],
        "session_id": ctx.session_id,
        "message_id": str(ctx.assistant_message_id),
        "retrieval_meta": faq_retrieval_meta(ctx),
    }


def record_faq_answer_in_session(ctx: FaqAnswerContext) -> None:
    from .session_store import get_session_store

    get_session_store().append(
        ctx.session_id,
        ctx.session_scope,
        {
            "id": str(ctx.assistant_message_id),
            "type": "assistant",
            "content": faq_answer_for_history(ctx.answer),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        **ctx.session_ttl_kwargs,
    )


def persist_faq_answer(ctx: FaqAnswerContext) -> None:
    """Save the FAQ turn to chat history and query logs (same policy as other chat turns)."""
    from ..db import SessionLocal
    from ..models import ChatMessage, QueryLog
    from .chat_execution_snapshot import build_execution_snapshot
    from .history_storage import should_persist_chat

    if not ctx.project_uuid:
        return
    elapsed_ms = int((time.time() - ctx.start_time) * 1000)
    db = SessionLocal()
    try:
        if not should_persist_chat(db, ctx.project_uuid):
            return
        snapshot = build_execution_snapshot(
            answer=ctx.answer,
            session_id=ctx.session_id,
            assistant_message_id=ctx.assistant_message_id,
            chatbot_language=None,
            retrieval_meta=faq_retrieval_meta(ctx),
            token_usage={},
            raw_contexts=None,
            raw_contexts_metadatas=None,
            raw_chunk_similarity_pct=None,
            llm_config_dict=None,
            effective_rag_params={},
            embedding_provider=None,
            embedding_model=None,
            project_id=str(ctx.project_uuid),
            total_ms=elapsed_ms,
            is_default_greeting=False,
        )
        db.add(
            ChatMessage(
                id=uuid.uuid4(),
                user_id=ctx.user_id,
                project_id=ctx.project_uuid,
                session_id=ctx.session_id,
                message_id=ctx.assistant_message_id,
                user_message=ctx.user_message,
                assistant_response=ctx.answer,
                message_type="chat",
                sources=None,
                execution_snapshot=stamp_answer_source(snapshot, FAQ_ANSWER_SOURCE),
            )
        )
        db.commit()
        db.add(
            QueryLog(
                user_id=ctx.user_id,
                apikey_id=ctx.api_key_id or None,
                project_id=ctx.project_uuid,
                llm_provider=None,
                llm_model=None,
                query=ctx.user_message,
                mode="CHAT",
                result_count=1,
                p95_latency=elapsed_ms,
                prompt_tokens=None,
                completion_tokens=None,
                total_tokens=None,
                chat_message_id=ctx.assistant_message_id,
            )
        )
        db.commit()
    except Exception as exc:
        logger.error("FAQ answer DB save failed: %s", exc)
        db.rollback()
    finally:
        db.close()


async def stream_faq_answer(ctx: FaqAnswerContext) -> AsyncIterator[str]:
    """Yield the configured answer as paced SSE token deltas, then the done payload."""
    yield ": keepalive\n\n"
    try:
        async for chunk in iter_paced_tokens(ctx.answer):
            yield sse_event({"token": chunk, "done": False})
    except asyncio.CancelledError:
        return

    record_faq_answer_in_session(ctx)
    yield sse_event({
        "token": "",
        "done": True,
        "message_id": str(ctx.assistant_message_id),
        "session_id": ctx.session_id,
        "retrieval_meta": faq_retrieval_meta(ctx),
        "sources": [],
        "token_usage": {},
        "final_answer": ctx.answer,
        "answer_updated": False,
    })
    try:
        persist_faq_answer(ctx)
    except Exception as exc:
        logger.warning("FAQ answer persist failed after done: %s", exc)
