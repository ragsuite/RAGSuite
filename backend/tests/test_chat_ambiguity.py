"""Tests for chat referent ambiguity detection and clarification behavior."""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from app.routes.rag import (
    _build_ambiguity_clarification,
    _contextualize_query,
    _extract_salient_entities,
    _has_multiple_referent_candidates,
    _llm_marked_ambiguous,
    _message_has_ambiguous_reference,
    _message_has_plural_collective_reference,
    _message_names_explicit_entity,
)


# --- Referential language detection ---


@pytest.mark.parametrize(
    "message,expected",
    [
        ("Who is responsible for it?", True),
        ("What is its purpose?", True),
        ("Tell me about them.", True),
        ("What is this?", True),
        ("What is the report about?", False),
        ("What is the Endlagersuche?", False),
        ("What is Endlagersuche?", False),
        ("Compare Phase 2 and Phase 3.", False),
        ("What is Morsleben?", False),
        ("Hello there", False),
        ("Who is responsible for Endlagersuche?", False),
        # Same-utterance antecedent: "it" binds to "online voting system" in-message.
        (
            "is online voting system futuristics? also explain about how it can be use?",
            False,
        ),
        (
            "Is the online voting system secure and how can it be used?",
            False,
        ),
    ],
)
def test_message_has_ambiguous_reference(message, expected):
    assert _message_has_ambiguous_reference(message) is expected


@pytest.mark.parametrize(
    "message,expected",
    [
        ("What is the Endlagersuche?", True),
        ("What is Endlagersuche?", True),
        ("Who is responsible for Konrad?", True),
        ("What does it do?", False),
    ],
)
def test_message_names_explicit_entity(message, expected):
    assert _message_names_explicit_entity(message) is expected


# --- Salient entity extraction ---


def test_extract_salient_entities_two_topics():
    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is a former repository site."},
        {"type": "user", "content": "What is Endlagersuche?"},
        {"type": "assistant", "content": "Endlagersuche is the search for a final repository."},
    ]
    entities = _extract_salient_entities(history)
    assert "Morsleben" in entities
    assert "Endlagersuche" in entities
    assert _has_multiple_referent_candidates(history) is True


def test_extract_salient_entities_single_topic():
    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is located in Saxony-Anhalt."},
        {"type": "user", "content": "How large is it?"},
    ]
    entities = _extract_salient_entities(history)
    assert "Morsleben" in entities
    assert _has_multiple_referent_candidates(history) is False


def test_extract_salient_entities_multiple_people():
    history = [
        {"type": "user", "content": "Who is Dr. Schmidt?"},
        {"type": "assistant", "content": "Dr. Schmidt leads the geology team."},
        {"type": "user", "content": "And what about Minister Weber?"},
        {"type": "assistant", "content": "Minister Weber oversees federal policy."},
    ]
    entities = _extract_salient_entities(history)
    assert "Schmidt" in " ".join(entities) or "Dr" in " ".join(entities)
    assert _has_multiple_referent_candidates(history) is True


def test_extract_salient_entities_multiple_locations():
    history = [
        {"type": "user", "content": "Compare Berlin and Hamburg."},
        {"type": "assistant", "content": "Berlin is the capital; Hamburg is a port city."},
    ]
    assert _has_multiple_referent_candidates(history) is True


# --- LLM ambiguous marker parsing ---


@pytest.mark.parametrize(
    "text,expected",
    [
        ("AMBIGUOUS", True),
        ("ambiguous.", True),
        ("AMBIGUOUS\n", True),
        ("What is Morsleben's purpose?", False),
        ("", False),
    ],
)
def test_llm_marked_ambiguous(text, expected):
    assert _llm_marked_ambiguous(text) is expected


# --- Clarification copy ---


def test_build_ambiguity_clarification_standard_copy():
    text = _build_ambiguity_clarification("Who is responsible for it?", [])
    assert "Could you clarify who or what you're referring to?" in text
    assert "right answer" in text


# --- Contextualize query integration ---


def test_contextualize_query_skips_without_referential_language():
    history = [{"type": "user", "content": "Tell me about Morsleben."}]
    query, ambiguous = asyncio.run(
        _contextualize_query("What is Endlagersuche?", history, None)
    )
    assert query == "What is Endlagersuche?"
    assert ambiguous is False


def test_explicit_entity_with_multi_topic_history_not_ambiguous():
    """Regression: naming Endlagersuche must answer even when Morsleben was discussed earlier."""
    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is a former repository site."},
        {"type": "user", "content": "What is Endlagersuche?"},
        {"type": "assistant", "content": "Endlagersuche is the search for a final repository."},
    ]
    assert _has_multiple_referent_candidates(history) is True
    with patch("app.routes.rag.LLMFactory") as mock_factory:
        query, ambiguous = asyncio.run(
            _contextualize_query("What is the Endlagersuche?", history, {"provider": "openai"})
        )
    mock_factory.get_llm.assert_not_called()
    assert ambiguous is False
    assert query == "What is the Endlagersuche?"


def test_morsleben_endlagersuche_it_triggers_clarification_path():
    """Regression: two user-introduced topics + 'it' must not guess a referent."""
    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is a former repository site."},
        {"type": "user", "content": "What is Endlagersuche?"},
        {"type": "assistant", "content": "Endlagersuche is the search for a final repository."},
    ]
    clarification = _build_ambiguity_clarification("Who is responsible for it?", history)
    with patch("app.routes.rag.LLMFactory") as mock_factory:
        _, ambiguous = asyncio.run(
            _contextualize_query("Who is responsible for it?", history, {"provider": "openai"})
        )
    mock_factory.get_llm.assert_not_called()
    assert ambiguous is True
    assert "Could you clarify who or what you're referring to?" in clarification


def test_contextualize_query_precheck_ambiguous_without_llm():
    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is a site in Germany."},
        {"type": "user", "content": "What is Endlagersuche?"},
        {"type": "assistant", "content": "Endlagersuche is the repository search process."},
    ]
    with patch("app.routes.rag.LLMFactory") as mock_factory:
        query, ambiguous = asyncio.run(
            _contextualize_query("Who is responsible for it?", history, {"provider": "openai"})
        )
    mock_factory.get_llm.assert_not_called()
    assert ambiguous is True
    assert query == "Who is responsible for it?"


def test_contextualize_query_resolves_single_entity_via_llm():
    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is a former repository."},
    ]
    mock_llm = MagicMock()
    mock_llm.complete.return_value = MagicMock(
        text="Who is responsible for the Morsleben repository?"
    )
    with patch("app.routes.rag.LLMFactory.get_llm", return_value=mock_llm):
        query, ambiguous = asyncio.run(
            _contextualize_query(
                "Who is responsible for it?",
                history,
                {"provider": "openai", "chat_model": "gpt-4", "api_key": "k"},
            )
        )
    assert ambiguous is False
    assert "Morsleben" in query
    mock_llm.complete.assert_called_once()


def test_contextualize_query_llm_returns_ambiguous():
    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is a site."},
    ]
    mock_llm = MagicMock()
    mock_llm.complete.return_value = MagicMock(text="AMBIGUOUS")
    with patch("app.routes.rag.LLMFactory.get_llm", return_value=mock_llm):
        query, ambiguous = asyncio.run(
            _contextualize_query(
                "What is its purpose?",
                history,
                {"provider": "openai", "chat_model": "gpt-4", "api_key": "k"},
            )
        )
    assert ambiguous is True
    assert query == "What is its purpose?"


def test_plural_collective_reference_detection():
    assert _message_has_plural_collective_reference("Who operates them?") is True
    assert _message_has_plural_collective_reference("What do both do?") is True
    assert _message_has_plural_collective_reference("Tell me about these.") is True
    assert _message_has_plural_collective_reference("What about those?") is True
    assert _message_has_plural_collective_reference("Who operates it?") is False
    assert _message_has_plural_collective_reference("What is its purpose?") is False


def test_plural_collective_bypasses_precheck_and_calls_llm():
    """'them' with two user topics must go to LLM for collective rewrite, not clarify."""
    history = [
        {"type": "user", "content": "What is Konrad?"},
        {"type": "assistant", "content": "Konrad is a repository."},
        {"type": "user", "content": "What is Morsleben?"},
        {"type": "assistant", "content": "Morsleben is a former repository."},
    ]
    mock_llm = MagicMock()
    mock_llm.complete.return_value = MagicMock(
        text="Who operates Konrad and Morsleben?"
    )
    with patch("app.routes.rag.LLMFactory.get_llm", return_value=mock_llm):
        query, ambiguous = asyncio.run(
            _contextualize_query(
                "Who operates them?",
                history,
                {"provider": "openai", "chat_model": "gpt-4", "api_key": "k"},
            )
        )
    assert ambiguous is False
    assert "Konrad" in query and "Morsleben" in query
    mock_llm.complete.assert_called_once()


def test_singular_it_with_two_topics_still_clarifies():
    """Singular 'it' with two user topics must still ask for clarification."""
    history = [
        {"type": "user", "content": "What is Konrad?"},
        {"type": "assistant", "content": "Konrad is a repository."},
        {"type": "user", "content": "What is Morsleben?"},
        {"type": "assistant", "content": "Morsleben is a former repository."},
    ]
    with patch("app.routes.rag.LLMFactory") as mock_factory:
        _, ambiguous = asyncio.run(
            _contextualize_query(
                "Who operates it?",
                history,
                {"provider": "openai"},
            )
        )
    mock_factory.get_llm.assert_not_called()
    assert ambiguous is True


def test_contextualize_query_llm_timeout_falls_back_to_original():
    history = [{"type": "user", "content": "Tell me about Morsleben."}]
    mock_llm = MagicMock()
    with patch("app.routes.rag.LLMFactory.get_llm", return_value=mock_llm):
        with patch(
            "app.routes.rag.asyncio.wait_for",
            side_effect=asyncio.TimeoutError(),
        ):
            query, ambiguous = asyncio.run(
                _contextualize_query(
                    "What is its purpose?",
                    history,
                    {"provider": "openai"},
                )
            )
    assert query == "What is its purpose?"
    assert ambiguous is False


def test_online_voting_after_nitsan_is_not_grafted():
    """Regression: new topical question must not become 'NITSAN's online voting…'."""
    from app.routes.rag import (
        _history_for_chat_answer,
        _is_conversational_followup,
        _is_topic_shift,
        _message_has_same_utterance_antecedent,
    )

    history = [
        {"type": "user", "content": "What is NITSAN Technologies?"},
        {
            "type": "assistant",
            "content": (
                "NITSAN Technologies specializes in TYPO3-based solutions, "
                "workflow optimization, and secure digital systems."
            ),
        },
    ]
    msg = "is online voting system futuristics? also explain about how it can be use?"
    assert _message_has_same_utterance_antecedent(msg) is True
    assert _message_has_ambiguous_reference(msg) is False
    assert _is_topic_shift(msg, history) is True
    assert _is_conversational_followup(msg, history) is False
    assert _history_for_chat_answer(msg, history) is None

    with patch("app.routes.rag.LLMFactory") as mock_factory:
        query, ambiguous = asyncio.run(
            _contextualize_query(msg, history, {"provider": "openai"})
        )
    mock_factory.get_llm.assert_not_called()
    assert ambiguous is False
    assert query == msg
    assert "NITSAN" not in query
    assert "TYPO3" not in query


def test_true_followup_still_uses_history():
    from app.routes.rag import _history_for_chat_answer, _is_topic_shift

    history = [
        {"type": "user", "content": "Tell me about Morsleben."},
        {"type": "assistant", "content": "Morsleben is a former repository site."},
    ]
    assert _is_topic_shift("How large is it?", history) is False
    assert _history_for_chat_answer("How large is it?", history) == history
    assert _message_has_ambiguous_reference("How large is it?") is True
