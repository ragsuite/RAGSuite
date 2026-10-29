"""Persist Voice Pilot RAG turns as History Chatbot sessions."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional
from uuid import UUID

logger = logging.getLogger(__name__)


def persist_voice_pilot_chat_turn(
    *,
    project_id: UUID,
    user_id: Optional[int],
    session_id: Optional[str],
    user_message: str,
    assistant_response: str,
    llm_config_dict: Optional[Dict[str, Any]] = None,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
    chatbot_language: Optional[str] = None,
    retrieval_meta: Optional[Dict[str, Any]] = None,
    token_usage: Optional[Dict[str, Any]] = None,
    raw_contexts: Any = None,
    raw_contexts_metadatas: Any = None,
    raw_chunk_similarity_pct: Any = None,
    stage_timings_ms: Optional[Dict[str, Any]] = None,
    total_ms: int = 0,
    effective_rag_params: Optional[Dict[str, Any]] = None,
) -> bool:
    """Write a ``message_type=chat`` row when store-history is on.

    Greeting / follow-up / end canned lines never call this — they use TTS only.
    Returns True when a ChatMessage was committed.
    """
    sid = (session_id or "").strip()
    question = (user_message or "").strip()
    answer = (assistant_response or "").strip()
    if not sid or not question or not answer:
        return False

    from app.db import SessionLocal
    from app.models import ChatMessage
    from app.services.chat_execution_snapshot import build_execution_snapshot
    from app.services.history_storage import should_persist_chat

    db = SessionLocal()
    try:
        if not should_persist_chat(db, project_id):
            return False
        assistant_message_id = uuid.uuid4()
        snap = build_execution_snapshot(
            answer=answer,
            session_id=sid,
            assistant_message_id=assistant_message_id,
            chatbot_language=chatbot_language,
            retrieval_meta=retrieval_meta if isinstance(retrieval_meta, dict) else {},
            token_usage=token_usage if isinstance(token_usage, dict) else {},
            raw_contexts=raw_contexts,
            raw_contexts_metadatas=raw_contexts_metadatas,
            raw_chunk_similarity_pct=raw_chunk_similarity_pct,
            llm_config_dict=llm_config_dict,
            effective_rag_params=effective_rag_params
            or {"top_k": 5, "use_reranker": False},
            embedding_provider=embedding_provider,
            embedding_model=embedding_model,
            project_id=str(project_id),
            total_ms=int(total_ms or 0),
            stage_timings_ms=stage_timings_ms,
            is_default_greeting=False,
        )
        db.add(
            ChatMessage(
                id=uuid.uuid4(),
                user_id=user_id,
                project_id=project_id,
                session_id=sid,
                message_id=assistant_message_id,
                user_message=question,
                assistant_response=answer,
                message_type="chat",
                sources=None,
                execution_snapshot=snap,
            )
        )
        db.commit()
        return True
    except Exception:
        logger.warning("Voice Pilot chat persist failed", exc_info=True)
        db.rollback()
        return False
    finally:
        db.close()
