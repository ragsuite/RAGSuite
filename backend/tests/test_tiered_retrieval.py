"""
Unit tests for the hybrid retrieval chain in Retriever.

Semantic and keyword retrieval now run in parallel and are fused with RRF.
tier_used integers retain backwards-compatible meaning:
  1 = hybrid pool (semantic side contributed at least one chunk)
  2 = keyword-only (semantic side empty or failed)
  3 = empty pool (both sides yielded nothing)

Scenarios covered:
  1. Happy path  — semantic high-confidence; keyword runs in parallel; fused result.
  2. API down    — semantic throws; keyword carries the result alone.
  3. Low confidence — semantic returns weak chunks; keyword adds signal; fused.
  4. Keyword pass — keyword retrieval finds relevant chunks when semantic is down.
  5. No docs     — both sides empty → Tier 3 (empty list returned).
  6. Keyword disabled — opt-out returns semantic result unchanged (no fusion).
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock

from app.services.rag.rag import (
    Retriever,
    ChromaVDB,
    EmbedData,
    TIER1_TOP1_SIM_FLOOR,
    TIER2_KEYWORD_SCORE_FLOOR,
    TIER2_MAX_FETCH_CHUNKS,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_retriever(vdb_mock=None, embedder_mock=None):
    """Return a Retriever wired with lightweight mocks."""
    if embedder_mock is None:
        embedder_mock = MagicMock(spec=EmbedData)
        embedder_mock.embed_model = MagicMock()
        embedder_mock.embed_model.get_text_embedding = MagicMock(return_value=[0.1] * 384)

    if vdb_mock is None:
        vdb_mock = MagicMock(spec=ChromaVDB)

    return Retriever(vdb=vdb_mock, embedder=embedder_mock, default_top_k=5)


def _high_conf_vdb_result():
    """Simulate a VDB result that passes confidence gate."""
    docs = [
        "The refund policy allows returns within 30 days with receipt.",
        "Customer support can be reached at support@example.com.",
        "All orders over $50 include free shipping.",
        "We accept Visa, MasterCard, and PayPal.",
        "Products can be exchanged within 14 days.",
    ]
    doc_ids = [f"doc_{i}" for i in range(len(docs))]
    metas = [{"document_id": f"doc_{i}", "url": f"https://example.com/{i}", "title": f"Page {i}"} for i in range(len(docs))]
    # Low distances (high similarity ~0.85–0.90)
    distances = [0.10, 0.12, 0.14, 0.15, 0.16]
    return docs, doc_ids, metas, distances


def _low_conf_vdb_result():
    """Simulate a VDB result that fails confidence gate (very low similarity)."""
    docs = ["Some vaguely related content.", "Another weakly matching chunk."]
    doc_ids = ["doc_0", "doc_1"]
    metas = [{"document_id": "doc_0"}, {"document_id": "doc_1"}]
    # High distances (low similarity ~0.05–0.10) → top1_sim < TIER1_TOP1_SIM_FLOOR
    distances = [0.93, 0.95]
    return docs, doc_ids, metas, distances


def _keyword_chroma_get_result(query_keywords=("refund", "policy")):
    """Simulate ChromaDB collection.get() for keyword retrieval."""
    docs = [
        f"The refund policy covers all products.",
        f"Our return and refund policy is customer-friendly.",
        "Unrelated content about shipping.",
    ]
    metas = [{"document_id": f"kw_doc_{i}"} for i in range(len(docs))]
    ids = [f"id_{i}" for i in range(len(docs))]
    return {"documents": docs, "metadatas": metas, "ids": ids}


# ---------------------------------------------------------------------------
# Static helper tests
# ---------------------------------------------------------------------------

class TestExtractKeywords:
    def test_filters_stop_words(self):
        kw = Retriever._extract_keywords("what is the refund policy for orders")
        assert "what" not in kw
        assert "the" not in kw
        assert "for" not in kw
        assert "refund" in kw
        assert "policy" in kw
        assert "orders" in kw

    def test_min_length_3(self):
        kw = Retriever._extract_keywords("do we have AI tools")
        assert "do" not in kw
        assert "we" not in kw
        assert "have" not in kw
        assert "tools" in kw

    def test_max_10_keywords(self):
        long_query = " ".join(f"keyword{i}" for i in range(20))
        kw = Retriever._extract_keywords(long_query)
        assert len(kw) <= 10

    def test_deduplication(self):
        kw = Retriever._extract_keywords("refund refund policy policy")
        assert kw.count("refund") == 1
        assert kw.count("policy") == 1


class TestScoreChunkKeywords:
    def test_full_match(self):
        score = Retriever._score_chunk_keywords("refund policy details here", ["refund", "policy"])
        assert score > 0.9

    def test_no_match(self):
        score = Retriever._score_chunk_keywords("shipping and delivery info", ["refund", "policy"])
        assert score == 0.0

    def test_partial_match(self):
        score = Retriever._score_chunk_keywords("our refund options are flexible", ["refund", "policy"])
        assert 0.0 < score < 1.0

    def test_empty_keywords(self):
        assert Retriever._score_chunk_keywords("anything", []) == 0.0

    def test_empty_chunk(self):
        assert Retriever._score_chunk_keywords("", ["refund"]) == 0.0


# ---------------------------------------------------------------------------
# Semantic confidence tests
# ---------------------------------------------------------------------------

class TestComputeSemanticConfidence:
    def setup_method(self):
        self.retriever = _make_retriever()

    def test_high_confidence_passes(self):
        docs, _, _, distances = _high_conf_vdb_result()
        conf = self.retriever.compute_semantic_confidence(docs, distances, "refund policy")
        assert conf["passes"] is True
        assert conf["reason"] == "ok"

    def test_low_similarity_fails(self):
        docs, _, _, distances = _low_conf_vdb_result()
        conf = self.retriever.compute_semantic_confidence(docs, distances, "refund policy")
        assert conf["passes"] is False
        assert conf["reason"] == "semantic_low_confidence"

    def test_empty_results_fail(self):
        conf = self.retriever.compute_semantic_confidence([], [], "anything")
        assert conf["passes"] is False

    def test_high_duplicate_ratio_fails(self):
        # Chunk must contain query keywords so lexical overlap passes,
        # letting the duplicate-ratio check become the failure reason.
        same_chunk = "Our refund policy applies to all orders and returns."
        docs = [same_chunk] * 5
        distances = [0.05] * 5  # high similarity
        conf = self.retriever.compute_semantic_confidence(
            docs, distances, "refund policy",
            dup_max=0.3,  # strict dup threshold
        )
        assert conf["passes"] is False
        assert conf["reason"] == "high_duplicate_ratio"

    def test_low_lexical_overlap_fails(self):
        docs = ["completely unrelated content about weather"] * 3
        distances = [0.05, 0.06, 0.07]  # high similarity scores
        conf = self.retriever.compute_semantic_confidence(
            docs, distances, "refund policy returns",
            lexical_floor=0.5,  # strict lexical requirement
        )
        assert conf["passes"] is False
        assert conf["reason"] == "low_lexical_overlap"


# ---------------------------------------------------------------------------
# Tier 1 → Tier 2 → Tier 3 flow tests
# ---------------------------------------------------------------------------

class TestTieredRetrieval:
    def setup_method(self):
        self.vdb_mock = MagicMock(spec=ChromaVDB)
        self.collection_mock = MagicMock()
        self.vdb_mock.collection = self.collection_mock
        self.vdb_mock.get_collection.return_value = self.collection_mock
        self.embedder_mock = MagicMock(spec=EmbedData)
        self.embedder_mock.embed_model = MagicMock()
        self.retriever = _make_retriever(self.vdb_mock, self.embedder_mock)

    # --- Scenario 1: Happy path ---
    def test_high_confidence_semantic_drives_hybrid_result(self):
        # Semantic returns strong matches; keyword runs in parallel but adds little.
        # Fused result is semantic-dominant, tier_used=1, no rerank by default.
        self.embedder_mock.embed_model.get_text_embedding.return_value = [0.1] * 384
        docs, doc_ids, metas, distances = _high_conf_vdb_result()
        self.vdb_mock.query.return_value = (docs, doc_ids, metas, distances)
        self.collection_mock.get.return_value = {"documents": [], "metadatas": [], "ids": []}

        result_docs, result_ids, result_metas, result_dists, result_meta = self.retriever.retrieve(
            "refund policy", user_id=1, project_id="proj-1"
        )

        # Top result is the strongest semantic match; semantic order is preserved
        # when keyword adds no contribution (RRF on a single ranked list is identity).
        assert result_docs[0] == docs[0]
        assert result_meta["tier_used"] == 1
        assert result_meta["semantic_count"] == len(docs)
        assert result_meta["confidence_score"] >= 0
        assert result_meta["reranked"] is False

    # --- Scenario 2: Embedding API down → Tier 2 activates ---
    def test_tier2_activates_on_embedding_error(self):
        self.embedder_mock.embed_model.get_text_embedding.side_effect = RuntimeError("API unreachable")
        self.collection_mock.get.return_value = _keyword_chroma_get_result()

        result_docs, result_ids, result_metas, result_dists, result_meta = self.retriever.retrieve(
            "refund policy", user_id=1, project_id="proj-1"
        )

        assert len(result_docs) > 0
        assert result_meta["tier_used"] == 2
        self.collection_mock.get.assert_called_once()

    # --- Scenario 3: Low confidence semantic + keyword hits → fused hybrid ---
    def test_low_confidence_semantic_fuses_with_keyword(self):
        # In hybrid mode the confidence gate no longer triggers fallback; semantic
        # and keyword both contribute and are fused with RRF.
        self.embedder_mock.embed_model.get_text_embedding.return_value = [0.1] * 384
        docs, doc_ids, metas, distances = _low_conf_vdb_result()
        self.vdb_mock.query.return_value = (docs, doc_ids, metas, distances)
        self.collection_mock.get.return_value = _keyword_chroma_get_result()

        result_docs, _, _, _, result_meta = self.retriever.retrieve(
            "refund policy", user_id=1, project_id="proj-1"
        )

        assert len(result_docs) > 0
        # Semantic contributed → tier_used reflects hybrid (1), not keyword-only (2).
        assert result_meta["tier_used"] == 1
        assert result_meta["semantic_count"] > 0
        assert result_meta["keyword_count"] > 0
        self.collection_mock.get.assert_called_once()

    # --- Scenario 4: Keyword retrieval returns valid results ---
    def test_tier2_keyword_returns_scored_results(self):
        self.embedder_mock.embed_model.get_text_embedding.side_effect = RuntimeError("down")
        self.collection_mock.get.return_value = _keyword_chroma_get_result()

        result_docs, result_ids, result_metas, result_dists, result_meta = self.retriever.retrieve(
            "refund policy", user_id=1, project_id="proj-1"
        )

        assert any("refund" in d.lower() or "policy" in d.lower() for d in result_docs)
        # pseudo-distances should be in [0, 1]
        assert all(0.0 <= d <= 1.0 for d in result_dists)
        assert result_meta["tier_used"] == 2

    # --- Scenario 5: No docs anywhere → Tier 3 (empty returned) ---
    def test_tier3_returns_empty_when_no_docs(self):
        self.embedder_mock.embed_model.get_text_embedding.side_effect = RuntimeError("down")
        self.collection_mock.get.return_value = {"documents": [], "metadatas": [], "ids": []}

        result_docs, result_ids, result_metas, result_dists, result_meta = self.retriever.retrieve(
            "refund policy", user_id=1, project_id="proj-1"
        )

        assert result_docs == []
        assert result_ids == []
        assert result_metas == []
        assert result_dists == []
        assert result_meta["tier_used"] == 3
        assert result_meta["confidence_score"] == 0

    # --- Scenario 6: Keyword fallback disabled → returns Tier 1 low-conf as-is ---
    def test_keyword_fallback_disabled_returns_tier1_result(self):
        self.embedder_mock.embed_model.get_text_embedding.return_value = [0.1] * 384
        docs, doc_ids, metas, distances = _low_conf_vdb_result()
        self.vdb_mock.query.return_value = (docs, doc_ids, metas, distances)

        result_docs, _, _, _, result_meta = self.retriever.retrieve(
            "refund policy",
            user_id=1,
            project_id="proj-1",
            enable_keyword_fallback=False,
        )

        # Returns Tier 1 result unchanged despite low confidence
        assert result_docs == docs
        assert result_meta["tier_used"] == 1
        self.collection_mock.get.assert_not_called()

    # --- Keyword score floor respected ---
    def test_tier2_returns_empty_when_all_chunks_below_score_floor(self):
        self.embedder_mock.embed_model.get_text_embedding.side_effect = RuntimeError("down")
        # Chunks that don't match any keyword
        self.collection_mock.get.return_value = {
            "documents": ["weather forecast is sunny", "shipping takes 3 days"],
            "metadatas": [{"document_id": "d1"}, {"document_id": "d2"}],
            "ids": ["id1", "id2"],
        }

        result_docs, _, _, _, result_meta = self.retriever.retrieve(
            "refund policy returns",
            user_id=1,
            project_id="proj-1",
        )

        # All chunks score 0 on "refund policy returns" → Tier 3
        assert result_docs == []
        assert result_meta["tier_used"] == 3

    # --- Timeout triggers Tier 2 ---
    def test_tier2_activates_on_embedding_timeout(self):
        original_run = Retriever._run_with_timeout

        call_count = {"n": 0}

        def mock_timeout(fn, timeout, *args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise TimeoutError("embedding timed out")
            return original_run(fn, timeout, *args, **kwargs)

        self.collection_mock.get.return_value = _keyword_chroma_get_result()

        with patch.object(Retriever, "_run_with_timeout", staticmethod(mock_timeout)):
            result_docs, _, _, _, result_meta = self.retriever.retrieve(
                "refund policy", user_id=1, project_id="proj-1"
            )

        assert len(result_docs) > 0
        assert result_meta["tier_used"] == 2
        self.collection_mock.get.assert_called_once()
