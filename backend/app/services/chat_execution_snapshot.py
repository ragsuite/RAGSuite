"""Build execution_snapshot JSON for chat/search history and feedback moderation.

Delegates to EE ``query_tracing`` when installed; otherwise uses the CE fallback
so response time and model names are always persisted.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from app.services.rag.embedder_factory import collection_name_for
from app.services.rag.singleton import CROSS_ENCODER_MODEL

SNAPSHOT_SCHEMA_VERSION = 2
MAX_SOURCES_TRACE = 20
MAX_CHUNK_PREVIEW_CHARS = 500


def build_execution_snapshot(*args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
    try:
        from ragsuite_modules.query_tracing.backend.snapshot import (  # type: ignore
            build_execution_snapshot as _build,
        )
    except ImportError:
        return _build_ce_snapshot(**kwargs)
    result = _build(*args, **kwargs)
    return result if isinstance(result, dict) else _build_ce_snapshot(**kwargs)


def _resolved_effective_temperature(llm_config_dict: Optional[Dict[str, Any]]) -> float:
    cfg = llm_config_dict or {}
    raw = cfg.get("temperature")
    if raw is not None and str(raw).strip() != "":
        try:
            v = float(raw)
            if 0.0 <= v <= 2.0:
                return round(v, 4)
        except (TypeError, ValueError):
            pass
    provider = str(cfg.get("provider") or "").lower()
    if "gemini" in provider or "google" in provider:
        return 1.0
    if "openai" in provider or "mistral" in provider:
        return 1.0
    return 0.8


def _clip(s: Optional[str], n: int) -> str:
    if not s:
        return ""
    t = str(s)
    return t if len(t) <= n else t[: n - 1] + "…"


def _timing_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def _resolve_timings_ms(
    *,
    total_ms: Optional[int],
    retrieval_meta: Optional[Dict[str, Any]] = None,
    stage_timings_ms: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    rm = retrieval_meta if isinstance(retrieval_meta, dict) else {}
    st = stage_timings_ms if isinstance(stage_timings_ms, dict) else {}

    def pick(key: str) -> Optional[int]:
        if key in st and st[key] is not None:
            return _timing_int(st[key])
        if key in rm and rm[key] is not None:
            return _timing_int(rm[key])
        return None

    resolved_total = _timing_int(total_ms)
    if resolved_total is None:
        resolved_total = _timing_int(st.get("total_ms"))

    return {
        "total_ms": resolved_total,
        "retrieval_ms": pick("retrieval_ms"),
        "reranking_ms": pick("reranking_ms"),
        "llm_generation_ms": pick("llm_generation_ms"),
        "streaming_ms": pick("streaming_ms"),
        "contextualize_ms": pick("contextualize_ms"),
        "source_build_ms": pick("source_build_ms"),
        "finalize_ms": pick("finalize_ms"),
        "settings_load_ms": pick("settings_load_ms"),
    }


def _infer_answer_status(
    *,
    answer: str,
    explicit_status: Optional[str] = None,
    is_default_greeting: bool = False,
) -> str:
    if explicit_status:
        return explicit_status
    if is_default_greeting:
        return "greeting_default"
    a = (answer or "").strip()
    if a.startswith("Error:"):
        return "error"
    if "out of the context of the provided documents" in a.lower():
        return "out_of_context"
    if "QUERY_OUT_OF_CONTEXT" in a:
        return "out_of_context"
    if "cannot share sensitive personal or financial details" in a.lower():
        return "privacy_block"
    return "success"


def _build_sources_trace(
    raw_contexts: Any,
    raw_contexts_metadatas: Any,
    raw_chunk_similarity_pct: Any,
    *,
    retrieval_meta: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not raw_contexts:
        ctx_list: List[Any] = []
    elif isinstance(raw_contexts, list):
        ctx_list = raw_contexts
    else:
        ctx_list = list(raw_contexts)

    if not raw_contexts_metadatas:
        meta_list: List[Any] = []
    elif isinstance(raw_contexts_metadatas, list):
        meta_list = raw_contexts_metadatas
    else:
        meta_list = list(raw_contexts_metadatas)

    sims: List[Any] = []
    if isinstance(raw_chunk_similarity_pct, list):
        sims = raw_chunk_similarity_pct

    reranked_glob = bool((retrieval_meta or {}).get("reranked")) if isinstance(retrieval_meta, dict) else False

    out: List[Dict[str, Any]] = []
    n = min(len(ctx_list), MAX_SOURCES_TRACE)
    for idx in range(n):
        ctx = ctx_list[idx]
        meta = meta_list[idx] if idx < len(meta_list) else {}
        if not isinstance(meta, dict):
            meta = {}
        sim = sims[idx] if idx < len(sims) else None
        source_file = str(meta.get("source_file") or "")
        ext = ""
        if "." in source_file:
            ext = source_file.rsplit(".", 1)[-1].lower()[:12]
        if meta.get("url") and not ext:
            ext = "url"
        preview = _clip(str(ctx or ""), MAX_CHUNK_PREVIEW_CHARS)
        out.append(
            {
                "index": idx,
                "document_id": meta.get("document_id"),
                "title": (meta.get("title") or "")[:512] or None,
                "url": (meta.get("url") or "")[:2048] or None,
                "source_file": source_file[:1024] or None,
                "source_type": ext or None,
                "chunk_id": meta.get("chunk_id") or meta.get("id"),
                "similarity_pct": int(sim) if sim is not None else None,
                "page_number": meta.get("page") or meta.get("page_number"),
                "metadata": {
                    k: meta.get(k)
                    for k in ("source_id", "document_id", "title", "url")
                    if meta.get(k) is not None
                },
                "text_preview": preview,
                "reranked": reranked_glob,
            }
        )
    return out


def _build_ce_snapshot(
    *,
    answer: str = "",
    session_id: str = "",
    assistant_message_id: Any = None,
    chatbot_language: Optional[str] = None,
    retrieval_meta: Any = None,
    token_usage: Any = None,
    raw_contexts: Any = None,
    raw_contexts_metadatas: Any = None,
    raw_chunk_similarity_pct: Any = None,
    llm_config_dict: Optional[Dict[str, Any]] = None,
    effective_rag_params: Optional[Dict[str, Any]] = None,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
    project_id: Optional[str] = None,
    total_ms: int = 0,
    stage_timings_ms: Optional[Dict[str, Any]] = None,
    explicit_status: Optional[str] = None,
    is_default_greeting: bool = False,
    future_scores: Optional[Dict[str, Any]] = None,
    **_ignored: Any,
) -> Dict[str, Any]:
    rm = retrieval_meta if isinstance(retrieval_meta, dict) else {}
    tu = token_usage if isinstance(token_usage, dict) else {}
    rag = effective_rag_params if isinstance(effective_rag_params, dict) else {}

    hybrid = bool(rm.get("semantic_count", 0) and rm.get("keyword_count", 0))

    coll = None
    if project_id and embedding_provider and embedding_model:
        try:
            coll = collection_name_for(project_id, embedding_provider, embedding_model)
        except Exception:
            coll = None

    status = _infer_answer_status(
        answer=answer,
        explicit_status=explicit_status,
        is_default_greeting=is_default_greeting,
    )

    resolved_temp = None if is_default_greeting else _resolved_effective_temperature(llm_config_dict)

    runtime = {
        "temperature": resolved_temp,
        "top_k": rag.get("top_k"),
        "similarity_threshold": rag.get("similarity_threshold"),
        "max_tokens": rag.get("max_tokens"),
        "use_reranker": rag.get("use_reranker"),
        "reranker_model_name": CROSS_ENCODER_MODEL if rag.get("use_reranker") else None,
        "embedding_provider": embedding_provider,
        "embedding_model": embedding_model,
        "llm_provider": (llm_config_dict or {}).get("provider"),
        "llm_model": (llm_config_dict or {}).get("chat_model"),
        "hybrid_search": hybrid,
        "vector_store": os.environ.get("RAG_VECTOR_STORE_LABEL", "chroma"),
        "collection_name": coll,
        "chatbot_language": chatbot_language,
    }

    timings_ms = _resolve_timings_ms(
        total_ms=total_ms,
        retrieval_meta=rm,
        stage_timings_ms=stage_timings_ms,
    )

    trace = _build_sources_trace(
        raw_contexts,
        raw_contexts_metadatas,
        raw_chunk_similarity_pct,
        retrieval_meta=rm,
    )

    conf = rm.get("confidence_score")
    try:
        conf_i = int(conf) if conf is not None else None
    except (TypeError, ValueError):
        conf_i = None

    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "status": status,
        "session_id": session_id,
        "assistant_message_id": str(assistant_message_id) if assistant_message_id else None,
        "runtime_params": runtime,
        "retrieval_meta": rm,
        "token_usage": {
            "prompt_tokens": tu.get("prompt_tokens"),
            "completion_tokens": tu.get("completion_tokens"),
            "total_tokens": tu.get("total_tokens"),
        },
        "timings_ms": timings_ms,
        "confidence_score": conf_i,
        "sources_trace": trace,
        "quality": {
            "hallucination_risk": None,
            "answer_quality_status": None,
            **(future_scores or {}),
        },
    }
