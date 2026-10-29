"""Tests for execution snapshot CE fallback and metrics enrichment."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from app.services.chat_execution_snapshot import (
    build_execution_snapshot,
    runtime_vector_store_name,
)
from app.services.execution_snapshot_metrics import metrics_from_snapshot


def test_build_execution_snapshot_ce_fallback_populates_models_and_timing():
    snap = build_execution_snapshot(
        answer="Hello from RAGSuite",
        session_id="sess-1",
        assistant_message_id=uuid.uuid4(),
        chatbot_language="en",
        retrieval_meta={"confidence_score": 72, "retrieval_ms": 120},
        token_usage={"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
        raw_contexts=["chunk one"],
        raw_contexts_metadatas=[{"title": "Doc", "url": "https://example.com/doc"}],
        raw_chunk_similarity_pct=[88],
        llm_config_dict={"provider": "mistral", "chat_model": "mistral-small-latest"},
        effective_rag_params={"top_k": 5, "similarity_threshold": 0.2, "use_reranker": False},
        embedding_provider="mistral",
        embedding_model="mistral-embed",
        project_id=str(uuid.uuid4()),
        total_ms=1840,
    )
    assert snap is not None
    assert snap["timings_ms"]["total_ms"] == 1840
    assert snap["runtime_params"]["llm_model"] == "mistral-small-latest"
    assert snap["runtime_params"]["embedding_model"] == "mistral-embed"
    assert snap["confidence_score"] == 72


def test_metrics_from_snapshot_reads_nested_runtime_params():
    metrics = metrics_from_snapshot(
        {
            "confidence_score": 55,
            "timings_ms": {"total_ms": 900},
            "runtime_params": {
                "llm_provider": "mistral",
                "llm_model": "mistral-small-latest",
                "embedding_provider": "mistral",
                "embedding_model": "mistral-embed",
            },
        }
    )
    assert metrics["total_ms"] == 900
    assert metrics["llm_model"] == "mistral-small-latest"
    assert metrics["embedding_model"] == "mistral-embed"
    assert metrics["confidence_score"] == 55


def test_runtime_vector_store_elasticsearch_ignores_chroma_env(monkeypatch):
    monkeypatch.setenv("RAG_VECTOR_STORE_LABEL", "chroma")
    monkeypatch.setattr(
        "app.services.rag.vector_store.es_client.configured",
        lambda: True,
    )
    assert runtime_vector_store_name() == "elasticsearch"
    snap = build_execution_snapshot(
        answer="Live store label",
        session_id="sess-es",
        assistant_message_id=uuid.uuid4(),
    )
    assert snap is not None
    assert snap["runtime_params"]["vector_store"] == "elasticsearch"
    assert snap["runtime_params"]["vector_store"] != "chroma"


def test_runtime_vector_store_pgvector_when_elasticsearch_off(monkeypatch):
    monkeypatch.setenv("RAG_VECTOR_STORE_LABEL", "chroma")
    monkeypatch.setattr(
        "app.services.rag.vector_store.es_client.configured",
        lambda: False,
    )
    assert runtime_vector_store_name() == "pgvector"
    snap = build_execution_snapshot(
        answer="Fallback store label",
        session_id="sess-pg",
        assistant_message_id=uuid.uuid4(),
    )
    assert snap is not None
    assert snap["runtime_params"]["vector_store"] == "pgvector"
