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
    assert normalize_request_language("") is None
    assert normalize_request_language("nope") is None


def test_resolve_language_preference_prefers_request():
    assert resolve_language_preference("en", "hi") == "en"
    assert resolve_language_preference(None, "hi") == "hi"
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
    text = build_language_instruction("hi")
    assert "rewrite the answer fully into Hindi" in text
    assert "CONVERSATION HISTORY" in text


def test_build_language_instruction_empty_when_missing():
    assert build_language_instruction(None) == ""
    assert build_language_instruction("") == ""
    assert build_language_instruction("   ") == ""
