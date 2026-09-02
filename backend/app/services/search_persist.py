"""Background persistence for search exchanges (history + analytics)."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def persist_search_exchange(
    *,
    user_id: Optional[int],
    project_uuid: Optional[uuid.UUID],
    session_id: str,
    message_id: uuid.UUID,
    query: str,
    answer: str,
    sources: Optional[List[Dict[str, Any]]],
    api_key_id: Optional[uuid.UUID],
    llm_config_dict: Optional[Dict[str, Any]],
    token_usage: Optional[Dict[str, Any]],
    elapsed_ms: int,
    result_count: Optional[int] = None,
    retrieval_meta: Optional[Dict[str, Any]] = None,
    raw_contexts: Any = None,
    raw_contexts_metadatas: Any = None,
    raw_chunk_similarity_pct: Any = None,
    stage_timings_ms: Optional[Dict[str, Any]] = None,
    effective_rag_params: Optional[Dict[str, Any]] = None,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
    search_language: Optional[str] = None,
    explicit_status: Optional[str] = None,
    session_scope: Optional[str] = None,
) -> None:
    from ..db import SessionLocal
    from ..models import ChatMessage, QueryLog
    from ..services.history_storage import search_session_ttl, should_persist_search
    from ..services.session_store import append_search_turn

    db = SessionLocal()
    try:
        if not project_uuid:
            return

        if not should_persist_search(db, project_uuid):
            if session_scope:
                append_search_turn(
                    session_id,
                    session_scope,
                    query,
                    answer or "",
                    search_session_ttl(db, project_uuid),
                )
            return

        sources_to_save = sources or []
        execution_snapshot = None
        try:
            from ..services.chat_execution_snapshot import build_execution_snapshot

            execution_snapshot = build_execution_snapshot(
                answer=answer or "",
                session_id=session_id,
                assistant_message_id=message_id,
                chatbot_language=search_language,
                retrieval_meta=retrieval_meta,
                token_usage=token_usage,
                raw_contexts=raw_contexts,
                raw_contexts_metadatas=raw_contexts_metadatas,
                raw_chunk_similarity_pct=raw_chunk_similarity_pct,
                llm_config_dict=llm_config_dict,
                effective_rag_params=effective_rag_params or {},
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
                project_id=str(project_uuid),
                total_ms=elapsed_ms,
                stage_timings_ms=stage_timings_ms,
                explicit_status=explicit_status,
            )
        except Exception as exc:
            logger.warning("Failed to build search execution snapshot: %s", exc)

        db.add(
            ChatMessage(
                id=uuid.uuid4(),
                user_id=user_id,
                project_id=project_uuid,
                session_id=session_id,
                message_id=message_id,
                user_message=query,
                assistant_response=answer,
                message_type="search",
                sources=sources_to_save,
                execution_snapshot=execution_snapshot,
            )
        )
        db.commit()

        active_provider = (llm_config_dict or {}).get("provider")
        active_model = (llm_config_dict or {}).get("chat_model")
        usage = token_usage or {}
        db.add(
            QueryLog(
                user_id=user_id,
                apikey_id=api_key_id if api_key_id else None,
                project_id=project_uuid,
                llm_provider=active_provider,
                llm_model=active_model,
                query=query,
                mode="SEARCH",
                result_count=result_count if result_count is not None else len(sources or []),
                p95_latency=elapsed_ms,
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                total_tokens=usage.get("total_tokens"),
                chat_message_id=message_id,
            )
        )
        db.commit()
    except Exception as exc:
        logger.error("Failed to persist search exchange: %s", exc)
        db.rollback()
    finally:
        db.close()
