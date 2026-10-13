import pytest

from app.services.rag.language_config import (
    build_language_instruction,
    normalize_request_language,
    resolve_language_name,
    resolve_language_preference,
)


def test_normalize_request_language():
    assert normalize_request_language("en-us") == "en"
    assert normalize_request_language("pt-br") == "pt"
    assert normalize_request_language("de") == "de"
    assert normalize_request_language("hi") == "en"
    assert normalize_request_language("hi-IN") == "en"
    assert normalize_request_language("") is None
    assert normalize_request_language("nope") is None


def test_resolve_language_preference_prefers_request():
    assert resolve_language_preference("en", "de") == "en"
    assert resolve_language_preference(None, "hi") == "en"
    assert resolve_language_preference("", "de") == "de"
    assert resolve_language_preference(None, None) is None


def test_resolve_language_name_maps_ui_codes():
    assert resolve_language_name("en") == "English"
    assert resolve_language_name("en-gb") == "English (UK)"
    assert resolve_language_name("de") == "German"
    assert resolve_language_name("pt") == "Portuguese (Brazil)"
    assert resolve_language_name("zh") == "Chinese (Simplified)"


def test_resolve_language_name_normalizes_underscores():
    assert resolve_language_name("en_GB") == "English (UK)"


def test_build_language_instruction_includes_english():
    text = build_language_instruction("en")
    assert "MUST write your entire answer in English" in text
    assert "Do not switch languages" in text
    assert "rewrite the answer fully into English" in text
    assert "translate document content into English" in text
    assert "Do not include foreign-language words in brackets" in text


def test_build_language_instruction_english_gb_same_translate_rule():
    text = build_language_instruction("en-gb")
    assert "translate document content into English" in text
    assert "English (UK)" in text


def test_build_language_instruction_for_german():
    text = build_language_instruction("de")
    assert "German" in text
    assert "MUST write your entire answer" in text
    assert "rewrite the answer fully into German" in text
    assert "never copy prior-turn wording" in text


def test_build_language_instruction_rewrites_history_language():
    text = build_language_instruction("es")
    assert "rewrite the answer fully into Spanish" in text
    assert "CONVERSATION HISTORY" in text


def test_build_language_instruction_empty_when_missing():
    assert build_language_instruction(None) == ""
    assert build_language_instruction("") == ""
    assert build_language_instruction("   ") == ""


@pytest.mark.parametrize("code, name", [("en", "English"), ("en-gb", "English (UK)"), ("de", "German"), ("fr", "French")])
def test_fixed_instruction_ignores_the_question_language(code, name):
    text = build_language_instruction(code, fixed=True)
    assert f"Write your entire answer in {name}, regardless of the language of the user's question" in text
    assert f"Translate all document content into {name}" in text
    assert "article numbers, units, prices and URLs exactly as in DOCUMENTS" in text
    assert "same language as the user's question" not in text
    assert "original language" not in text


def test_fixed_instruction_english_has_no_bracketed_foreign_words_rule_only_for_english():
    assert "foreign-language words in brackets" in build_language_instruction("en", fixed=True)
    assert "foreign-language words in brackets" not in build_language_instruction("de", fixed=True)
    assert build_language_instruction(None, fixed=True) == ""


def test_default_instruction_is_unchanged_for_search_and_assistant():
    assert "same language as the user's question" in build_language_instruction("en")
    assert "Short quotes from DOCUMENTS may stay in their original language" in build_language_instruction("de")


def test_chat_prompt_uses_fixed_language_and_search_keeps_default():
    from app.services.rag.rag import RAG

    rag = RAG.__new__(RAG)
    kwargs = dict(top_k=5, generate_topk=False, cite_passages=True, language_code="en")
    question = "Wie viele 24-V-Sensoren sind im EK-H1?"
    chat = rag._build_prompt(question, "[S1]\n3 Stück 24 V - Sensoren", mode="chat", **kwargs)
    search = rag._build_prompt(question, "[S1]\n3 Stück 24 V - Sensoren", mode="search", **kwargs)
    tail = chat[chat.rindex("DOCUMENTS:"):]
    assert "regardless of the language of the user's question" in tail.split("Q:")[0]
    assert chat.endswith(f"Q: {question}\nAnswer language: English.\nA:")
    assert "same language as the user's question" not in chat
    assert "same language as the user's question" in search
    plain = rag._build_prompt(question, "[S1]\nx", mode="chat", top_k=5, generate_topk=False, cite_passages=True)
    assert plain.endswith(f"Q: {question}\nA:")
    assert "Answer language:" not in search


def test_search_prompt_with_fixed_language_answers_in_the_configured_language():
    from app.services.rag.rag import RAG

    rag = RAG.__new__(RAG)
    question = "Welche Artikelnummer hat der Ersatzteilkoffer EK-H1?"
    search = rag._build_prompt(
        question, "[S1]\nArt.-Nr. 99.90.09.99", top_k=5, generate_topk=False, cite_passages=True,
        language_code="en", mode="search", format_type="html_long", fixed_language=True,
    )
    assert "regardless of the language of the user's question" in search
    assert "same language as the user's question" not in search
    assert f"Question: {question}\nAnswer language: English.\n" in search
    unset = rag._build_prompt(
        question, "[S1]\nx", top_k=5, generate_topk=False, cite_passages=True,
        mode="search", format_type="html_long", fixed_language=True,
    )
    assert "Answer language:" not in unset
