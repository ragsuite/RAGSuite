"""Deterministic rerank / fallback / evidence decisions."""
from app.services.rag.retrieval_policy import (
    evidence_sufficient,
    should_fallback,
    should_rerank,
    similarities_from_distances,
)


class TestShouldRerank:
    def test_never_overrides_admin_off(self):
        d = should_rerank(False, 30, intent="compare", has_constraints=True)
        assert not d.value and d.reason == "disabled"

    def test_small_pools_skip(self):
        assert should_rerank(True, 0).reason == "no_candidates"
        assert should_rerank(True, 3).reason == "low_candidates"

    def test_risky_queries_rerank(self):
        assert should_rerank(True, 10, intent="compare").reason == "high_risk_query"
        assert should_rerank(True, 10, has_constraints=True).value
        assert should_rerank(True, 10, entity_count=2).value

    def test_clear_top1_skips(self):
        d = should_rerank(True, 10, distances=[0.1, 0.35, 0.4], intent="general")
        assert not d.value and d.reason == "clear_top1"

    def test_close_scores_rerank(self):
        d = should_rerank(True, 10, distances=[0.40, 0.42, 0.45], intent="general")
        assert d.value and d.reason == "close_scores"

    def test_default_reranks(self):
        assert should_rerank(True, 10, intent="general").reason == "default"

    def test_similarities_ignore_none(self):
        assert similarities_from_distances([0.2, None, 0.5]) == [0.8, 0.5]


class TestShouldFallback:
    def test_only_once(self):
        d = should_fallback({}, retrieval_query="a", original_query="b", result_count=0, already_retried=True)
        assert not d.value

    def test_same_query_no_retry(self):
        assert not should_fallback({}, retrieval_query="x", original_query="x ", result_count=0).value

    def test_empty_pool_retries(self):
        d = should_fallback({}, retrieval_query="laptops", original_query="tell me about laptops", result_count=0)
        assert d.value and d.reason == "empty_pool"

    def test_low_top1_retries(self):
        meta = {"top1_similarity": 10}
        assert should_fallback(meta, retrieval_query="a b", original_query="c a b", result_count=4).value

    def test_confident_no_retry(self):
        meta = {"top1_similarity": 62}
        assert not should_fallback(meta, retrieval_query="a b", original_query="c a b", result_count=4).value


class TestEvidenceSufficient:
    def test_no_contexts(self):
        assert evidence_sufficient("refund policy", []).reason == "no_contexts"

    def test_english_lexical_hit_with_stem(self):
        d = evidence_sufficient("gaming laptops", ["The best gaming laptop deals"])
        assert d.sufficient and d.reason == "lexical"

    def test_english_no_support(self):
        d = evidence_sufficient("Who won the football world cup?", ["Lubricants for engines"])
        assert not d.sufficient

    def test_english_does_not_use_semantic_rescue(self):
        d = evidence_sufficient("Who won the football world cup?", ["Lubricants"], top_similarity=0.9)
        assert not d.sufficient

    def test_german_function_words_are_not_evidence(self):
        # "wie"/"der" appear in the passage but carry no meaning.
        d = evidence_sufficient("Wie hoch ist der Ölwechselpreis?", ["Wie der Name sagt, Kontakt"])
        assert not d.sufficient

    def test_german_content_hit(self):
        d = evidence_sufficient("Welche Schmierstoffe gibt es?", ["Unsere Schmierstoffe für Motoren"])
        assert d.sufficient and d.reason == "lexical"

    def test_non_english_honours_legacy_gate(self):
        d = evidence_sufficient("Wie teuer?", ["Preise ab 10 €"], legacy_supported=True)
        assert d.sufficient

    def test_non_english_semantic_rescue(self):
        d = evidence_sufficient("Quel est le prix du lubrifiant?", ["Engine oil costs 20 EUR"], top_similarity=0.7)
        assert d.sufficient and d.reason == "semantic"

    def test_stopword_only_query_uses_legacy(self):
        assert evidence_sufficient("what is this", ["anything"], legacy_supported=True).sufficient
        assert not evidence_sufficient("what is this", ["anything"], legacy_supported=False).sufficient

    def test_to_meta(self):
        meta = evidence_sufficient("gaming laptops", ["gaming laptop"]).to_meta()
        assert meta["sufficient"] is True and meta["matched_terms"]


def test_evidence_gate_never_refuses_when_legacy_supported_english():
    decision = evidence_sufficient(
        "What kind of products can I browse here?",
        ["Beauty and Grooming: Makeup, Skin care. Electronics: Laptops, Mobiles."],
        lang="en",
        legacy_supported=True,
    )
    assert decision.sufficient
