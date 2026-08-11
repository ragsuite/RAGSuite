"""Tests for shared source display policy."""
from app.services.source_display_policy import (
    chunk_passes_source_relevance,
    extract_custom_ooc_reply,
    should_omit_sources_for_answer,
    user_query_asks_geographic_location,
)


def test_should_omit_sources_for_custom_fallback_phrase():
    answer = (
        "I couldn't find this information in the available knowledge base. "
        "Please contact the RagSuite team for further assistance."
    )
    assert should_omit_sources_for_answer(answer) is True


def test_should_omit_sources_when_answer_matches_prompt_extract():
    prompt = (
        "When nothing is relevant, respond with:\n"
        "'No matching documents were found for this query.'"
    )
    answer = "No matching documents were found for this query."
    assert should_omit_sources_for_answer(answer, system_prompt=prompt) is True


def test_should_not_omit_sources_for_substantive_answer():
    answer = "The BMW M5 produces 625hp based on the uploaded brochure."
    assert should_omit_sources_for_answer(answer) is False


def test_extract_custom_ooc_reply_multiline():
    prompt = (
        "Only when no relevant information is found, respond with:\n\n"
        "'I could not find this information in the knowledge base.'"
    )
    assert extract_custom_ooc_reply(prompt) == "I could not find this information in the knowledge base."


def test_location_query_requires_place_evidence_in_sources():
    q = "where NITSAN located?"
    assert user_query_asks_geographic_location(q)
    brand_only = "At NITSAN, she works as a TYPO3 developer and loves open source."
    assert not chunk_passes_source_relevance(
        brand_only,
        {"url": "https://nitsantech.de/en/blog/gdpr", "title": "GDPR"},
        user_query=q,
    )
    with_place = (
        "At 24, he co-founded NITSAN – a TYPO3 Agency in Bhavnagar, India."
    )
    assert chunk_passes_source_relevance(
        with_place,
        {"url": "https://t3planet.de/about", "title": "About"},
        user_query=q,
    )
