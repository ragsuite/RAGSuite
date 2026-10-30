"""2-char ALL-CAPS acronyms stay visible for retrieval (CE vs EE)."""
from __future__ import annotations

from app.services.rag import query_keywords as qk
from app.services.rag.query_processing import process_query


def test_short_letter_acronyms_from_compare_query():
    assert qk.short_letter_acronyms("What CE vs EE?") == ["ce", "ee"]
    assert "ce" in qk.extract_keywords("What CE vs EE?")
    assert "ee" in qk.extract_keywords("What CE vs EE?")


def test_short_acronyms_not_from_all_caps_sentence():
    assert qk.short_letter_acronyms("WHAT IS THE PRICE OF THE DELL LAPTOP") == []


def test_ce_vs_ee_has_content_terms_and_is_not_ambiguous():
    pq = process_query("What CE vs EE?")
    assert "ce" in pq.content_terms
    assert "ee" in pq.content_terms
    assert pq.is_ambiguous_ref is False


def test_capitalized_codes_includes_two_char():
    assert "ce" in qk.capitalized_codes("Compare CE and EE editions")
    assert "ee" in qk.capitalized_codes("Compare CE and EE editions")
