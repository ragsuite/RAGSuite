"""Reply gate, setup host ranking, history labels, and search keyword rescore."""
from __future__ import annotations

from app.services.chat_reply_signals import asks_new_question, is_reply
from app.services.chat_topic_memory import PendingQuestion
from app.services.rag import host_preference as hp
from app.services.rag import page_kinds
from app.services.rag import query_signals
from app.services.rag.rag import history_turn_label, search_keyword_rescore
from app.services.rag.query_processing import ProcessedQuery


def _pq(text: str, *, entities=None, ambiguous=False) -> ProcessedQuery:
    return ProcessedQuery(
        original=text,
        processed=text,
        retrieval_query=text,
        entities=list(entities or []),
        is_ambiguous_ref=ambiguous,
    )


def test_asks_new_question_single_configure_term():
    msg = "how can I configure?"
    assert asks_new_question(msg, _pq(msg)) is True


def test_configure_is_not_reply_to_pending_clarify():
    msg = "how can I configure?"
    pending = PendingQuestion(
        kind="clarify",
        question="Would you like details on Ollama setup?",
        original_query="what are services?",
        answered=False,
    )
    assert is_reply(msg, pending, _pq(msg)) is False


def test_yes_and_ordinal_still_reply():
    pending = PendingQuestion(
        kind="followup",
        question="Would you like the Pop mascara details instead?",
        original_query="show lipsticks",
        answered=False,
    )
    assert is_reply("yes", pending, _pq("yes")) is True
    assert is_reply("the second one", pending, _pq("the second one")) is True


def test_wants_setup_configure():
    assert query_signals.wants_setup("how can I configure?") is True
    assert query_signals.wants_setup("how do I install RAGSuite?") is True
    assert query_signals.wants_setup("what are services?") is False


def test_host_prefer_keeps_clearly_closer_docs():
    # Apex listed first in fused order; docs is clearly more similar.
    entries = [
        {
            "id": "apex",
            "doc": "privacy configure Speicherung",
            "meta": {"url": "https://ragsuite.de/datenschutz", "crawl_source_id": "src-1"},
            "dist": 0.25,
        },
        {
            "id": "docs",
            "doc": "install via CLI",
            "meta": {"url": "https://docs.ragsuite.de/GettingStarted/Install", "crawl_source_id": "src-1"},
            "dist": 0.05,
        },
    ]
    ranked, info = hp.prefer_primary_host(entries, {"src-1": "ragsuite.de"}, margin=0.08)
    assert info["applied"] is True
    assert ranked[0]["id"] == "docs"
    assert ranked[1]["id"] == "apex"


def test_host_prefer_setup_skips_sibling_demotion():
    entries = [
        {
            "id": "docs",
            "doc": "ragsuite init",
            "meta": {"url": "https://docs.ragsuite.de/GettingStarted/What", "crawl_source_id": "src-1"},
            "dist": 0.2,
        },
        {
            "id": "apex",
            "doc": "home",
            "meta": {"url": "https://ragsuite.de/", "crawl_source_id": "src-1"},
            "dist": 0.1,
        },
    ]
    ranked, info = hp.prefer_primary_host(
        entries, {"src-1": "ragsuite.de"}, skip_sibling_demotion=True
    )
    assert info["applied"] is False
    assert info["reason"] == "setup_skip_sibling"
    assert ranked == entries


def test_setup_demotes_blog_articles():
    entries = [
        {
            "id": "blog",
            "doc": "DSGVO configure",
            "meta": {"url": "https://ragsuite.de/blog/dsgvo-checklist", "crawl_source_id": "src-1"},
            "dist": 0.1,
        },
        {
            "id": "docs",
            "doc": "CLI install",
            "meta": {"url": "https://docs.ragsuite.de/GettingStarted/Install", "crawl_source_id": "src-1"},
            "dist": 0.12,
        },
    ]
    ranked, info = page_kinds.demote_articles(entries)
    assert info["applied"] is True
    assert ranked[0]["id"] == "docs"
    assert ranked[1]["id"] == "blog"


def test_history_turn_label_accepts_role_or_type():
    assert history_turn_label({"role": "user", "content": "hi"}) == "User"
    assert history_turn_label({"type": "user", "content": "hi"}) == "User"
    assert history_turn_label({"role": "assistant", "content": "ok"}) == "Assistant"
    assert history_turn_label({"type": "assistant", "content": "ok"}) == "Assistant"


def test_search_keyword_rescore_single_token_does_not_beat_similarity():
    # One leftover token overlap vs clearly closer chunk with zero lexical hit.
    weak_lex = search_keyword_rescore(1, 0.40)
    strong_sim = search_keyword_rescore(0, 0.90)
    assert strong_sim > weak_lex
    # Cap: 5 overlaps scores like 3.
    assert search_keyword_rescore(5, 0.0) == search_keyword_rescore(3, 0.0)
    # Equal similarity: more overlap still ranks slightly higher.
    assert search_keyword_rescore(2, 0.5) > search_keyword_rescore(0, 0.5)
