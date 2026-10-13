"""Deterministic, risk-gated answer verification (max one regeneration)."""
from unittest.mock import MagicMock

from app.services.rag import answer_verification as av
from app.services.rag.query_processing import process_query
from app.services.rag.rag import RAG

CTX = "Laptop A costs ₹54,990 and has 16 GB RAM. Laptop B costs ₹45,990. Released 2024."


class TestShouldVerify:
    def test_low_risk_skipped(self):
        assert av.should_verify(process_query("What is TYPO3?"), {"confidence_score": 80}) is None

    def test_risky_intents(self):
        assert av.should_verify(process_query("laptops under ₹50,000"), {}) == "intent:filter"
        assert av.should_verify(process_query("iPhone vs Pixel"), {}) == "intent:compare"

    def test_hard_source_and_low_confidence(self):
        pq = process_query("What is TYPO3?")
        assert av.should_verify(pq, {"hard_source_ids": ["x"]}) == "hard_source"
        assert av.should_verify(pq, {"confidence_score": 20}) == "low_confidence"

    def test_disabled(self, monkeypatch):
        monkeypatch.setenv("RAG_ANSWER_VERIFY", "0")
        assert av.should_verify(process_query("laptops under ₹50,000"), {}) is None


class TestVerifyAnswer:
    def test_supported_prices_pass(self):
        r = av.verify_answer("Laptop B is ₹45,990, Laptop A is ₹54,990.", [CTX])
        assert r.passed

    def test_price_difference_allowed(self):
        assert av.verify_answer("Laptop B is ₹9,000 cheaper.", [CTX]).passed

    def test_question_numbers_allowed(self):
        r = av.verify_answer("Laptop B is under ₹50,000.", [CTX], query="laptops under ₹50,000")
        assert r.passed

    def test_hallucinated_price_fails(self):
        r = av.verify_answer("Laptop C costs ₹39,999.", [CTX])
        assert not r.passed and r.reason == "unsupported_price" and r.unsupported_prices == ["39999"]

    def test_many_unsupported_numbers_fail(self):
        r = av.verify_answer("It has 32 GB, 1200 nits, 144 Hz and 99 Wh.", [CTX])
        assert not r.passed and r.reason == "unsupported_numbers"

    def test_small_numbers_and_codes_ignored(self):
        assert av.verify_answer("1. RTX4050 model with 4.5 stars", [CTX]).passed

    def test_html_answer(self):
        assert av.verify_answer("<p>Price: <mark>₹45,990</mark></p>", [CTX]).passed

    def test_empty(self):
        assert av.verify_answer("  ", [CTX]).reason == "empty_answer"

    def test_cross_source_citation(self):
        r = av.verify_answer(
            "Laptop B is ₹45,990.",
            [CTX],
            hard_source_ids=["src1"],
            cited_metadatas=[{"document_id": "other"}],
        )
        assert not r.passed and r.reason == "cross_source_citation"


def test_redact_unsupported_sentences():
    answer = "Laptop B is ₹45,990. Laptop C is ₹39,999. Both have good reviews."
    r = av.verify_answer(answer, [CTX])
    assert av.redact_unsupported(answer, r) == "Laptop B is ₹45,990. Both have good reviews."


def test_redact_refuses_when_most_text_would_go():
    answer = "Laptop C is ₹39,999."
    assert av.redact_unsupported(answer, av.verify_answer(answer, [CTX])) is None


def _rag():
    rag = RAG.__new__(RAG)
    return rag


def test_rag_verify_regenerates_once():
    pq = process_query("laptops under ₹50,000")
    meta = {}
    regen = MagicMock(return_value=("Laptop B costs ₹45,990.", [1]))
    out, indices, replaced = _rag()._verify_answer(
        "Laptop C costs ₹39,999.", [1],
        pq=pq, retrieval_meta=meta, user_query=pq.original,
        combined_context=CTX, passage_metadatas=[{}], regenerate=regen,
    )
    regen.assert_called_once()
    assert out == "Laptop B costs ₹45,990." and replaced
    assert meta["verification"]["regenerated"] and meta["verification"]["passed"]


def test_rag_verify_skips_low_risk():
    pq = process_query("What is TYPO3?")
    meta = {"confidence_score": 90}
    regen = MagicMock()
    out, _i, replaced = _rag()._verify_answer(
        "TYPO3 is a CMS from 1998.", None,
        pq=pq, retrieval_meta=meta, user_query=pq.original,
        combined_context="TYPO3 CMS", passage_metadatas=None, regenerate=regen,
    )
    regen.assert_not_called()
    assert not replaced and meta["verification"]["checked"] is False


def test_rag_verify_stream_redacts_without_regeneration():
    pq = process_query("price of laptop B?")
    meta = {}
    out, _i, replaced = _rag()._verify_answer(
        "Laptop B is ₹45,990. Laptop C is ₹39,999. Both ship free.", None,
        pq=pq, retrieval_meta=meta, user_query=pq.original,
        combined_context=CTX, passage_metadatas=None,
    )
    assert replaced and "39,999" not in out
    assert meta["verification"]["redacted"] is True
