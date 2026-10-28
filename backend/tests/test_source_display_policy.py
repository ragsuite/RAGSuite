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


def test_location_refusal_omits_sources():
    assert should_omit_sources_for_answer("I don't have the location for NITSAN.")
    assert should_omit_sources_for_answer("I don't have its location.")
    long_search = (
        "I don't have the location of NITSAN.\n\n"
        "NITSAN is described as an AI consulting, development, and automation partner, "
        "but specific location details are not provided in the available information.\n\n"
        "For any further inquiries about NITSAN's services or offerings, please let me know!"
    )
    assert should_omit_sources_for_answer(long_search)
    assert not should_omit_sources_for_answer(
        "NITSAN specializes in AI consulting, development, and automation."
    )


def test_where_is_entity_is_geographic_but_website_is_not():
    assert user_query_asks_geographic_location("where is nitsan?")
    assert user_query_asks_geographic_location("Where is NITSAN?")
    assert user_query_asks_geographic_location("wo ist NITSAN?")
    assert user_query_asks_geographic_location("where nisan is located in indian?")
    assert not user_query_asks_geographic_location("where is the nitsan website?")
    assert not user_query_asks_geographic_location("What is Mohn?")
    brand_only = "NITSAN is an AI consulting, development, and automation partner."
    assert not chunk_passes_source_relevance(
        brand_only,
        {"url": "https://nitsan.ai/", "title": "NITSAN AI"},
        user_query="where is nitsan?",
    )
    with_place = "NITSAN – a TYPO3 Agency in Bhavnagar, India."
    assert chunk_passes_source_relevance(
        with_place,
        {"url": "https://t3planet.de/about", "title": "About"},
        user_query="where is nitsan?",
    )
