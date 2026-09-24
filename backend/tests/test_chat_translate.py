from unittest.mock import MagicMock, patch

import pytest

from app.services.chat_translate import (
    TranslationEmptyError,
    _split_content,
    build_translate_prompt,
    parse_translation_map,
    translate_messages_with_llm,
)


def test_parse_translation_map_accepts_numeric_keys():
    raw = '{"1": "Hallo", "2": "Welt"}'
    assert parse_translation_map(raw, ["m1", "m2"]) == {"m1": "Hallo", "m2": "Welt"}


def test_parse_translation_map_accepts_direct_ids():
    raw = '{"m1": "Hello", "m2": "World"}'
    assert parse_translation_map(raw, ["m1", "m2"]) == {"m1": "Hello", "m2": "World"}


def test_parse_translation_map_strips_fence_and_ignores_unknown_ids():
    raw = '```json\n{"1": "Hallo", "extra": "x"}\n```'
    assert parse_translation_map(raw, ["m1"]) == {"m1": "Hallo"}


def test_parse_translation_map_empty_on_invalid():
    assert parse_translation_map("not json", ["m1"]) == {}


def test_parse_translation_map_accepts_role_text_objects():
    raw = (
        '{"1": {"role": "user", "text": "T3Planet क्या है?"}, '
        '"2": {"role": "assistant", "text": "**T3Planet** एक प्लेटफ़ॉर्म है।"}}'
    )
    assert parse_translation_map(raw, ["m1", "m2"]) == {
        "m1": "T3Planet क्या है?",
        "m2": "**T3Planet** एक प्लेटफ़ॉर्म है।",
    }


def test_parse_translation_map_keeps_finished_pairs_when_json_is_cut_off():
    raw = """```json
{
  "1": "What is T3Planet?",
  "2": "T3Planet is a marketplace",
  "3": "this value was cut off mid
"""
    parsed = parse_translation_map(raw, ["m1", "m2", "m3"])
    assert parsed == {
        "m1": "What is T3Planet?",
        "m2": "T3Planet is a marketplace",
    }


def test_parse_translation_map_repairs_raw_newlines_inside_strings():
    raw = """```json
{"1": {"role": "user", "text": "Hello"}, "2": {"role": "assistant", "text": "Line one

- Line two"}}
```"""
    parsed = parse_translation_map(raw, ["u1", "a1"])
    assert parsed["u1"] == "Hello"
    assert "Line one" in parsed["a1"]
    assert "Line two" in parsed["a1"]


def test_build_translate_prompt_uses_numeric_keys():
    prompt = build_translate_prompt("de", [{"id": "a1", "role": "assistant", "content": "Hello"}])
    assert "German" in prompt
    assert '"1"' in prompt
    assert '{"1": "translated text"' in prompt
    assert '"role": "assistant"' in prompt


def test_build_translate_prompt_role_aware_markdown_rules():
    prompt = build_translate_prompt(
        "hi",
        [
            {"id": "u1", "role": "user", "content": "Who owns +91 9727020020?"},
            {"id": "a1", "role": "assistant", "content": "See **docs**."},
        ],
    )
    assert "Do NOT add Markdown" in prompt
    assert "Do NOT invent new decorative" in prompt
    assert "plain text only" in prompt
    assert '"role": "user"' in prompt
    assert '"role": "assistant"' in prompt
    assert '"text":' in prompt
    assert '{"1": "translated text"' in prompt


@pytest.mark.asyncio
async def test_translate_messages_raises_on_empty_parse():
    llm = MagicMock()
    llm.complete.return_value = MagicMock(text="sorry I cannot")
    with patch("app.services.chat_translate.LLMFactory.get_llm", return_value=llm):
        with pytest.raises(TranslationEmptyError):
            await translate_messages_with_llm(
                llm_config={"provider": "openai", "chat_model": "gpt-4o-mini", "api_key": "x"},
                target_language="de",
                messages=[{"id": "m1", "role": "assistant", "content": "Hello"}],
            )


@pytest.mark.asyncio
async def test_translate_messages_maps_numeric_keys_to_ids():
    llm = MagicMock()
    llm.complete.return_value = MagicMock(text='{"1": "Hallo"}')
    with patch("app.services.chat_translate.LLMFactory.get_llm", return_value=llm):
        out = await translate_messages_with_llm(
            llm_config={"provider": "openai", "chat_model": "gpt-4o-mini", "api_key": "x"},
            target_language="de",
            messages=[{"id": "m1", "role": "assistant", "content": "Hello"}],
        )
    assert out == {"m1": "Hallo"}


@pytest.mark.asyncio
async def test_translate_messages_splits_calls_and_raises_output_limit():
    llm = MagicMock()
    llm.complete.side_effect = [
        MagicMock(text='{"1": "One", "2": "Two"}'),
        MagicMock(text='{"1": "Three"}'),
    ]
    with patch("app.services.chat_translate.LLMFactory.get_llm", return_value=llm):
        out = await translate_messages_with_llm(
            llm_config={"provider": "mistral", "chat_model": "mistral-small", "api_key": "x"},
            target_language="en",
            messages=[
                {"id": "a", "role": "user", "content": "A"},
                {"id": "b", "role": "assistant", "content": "B"},
                {"id": "c", "role": "user", "content": "C"},
            ],
        )
    assert out == {"a": "One", "b": "Two", "c": "Three"}
    assert llm.complete.call_count == 2
    assert llm.complete.call_args.kwargs.get("max_tokens", 0) >= 1024


def test_split_content_rejoins_to_the_original_text():
    text = ("Paragraph one.\n\n" * 800) + "Tail."
    parts = _split_content(text, limit=8000)
    assert len(parts) > 1
    assert "".join(parts) == text


@pytest.mark.asyncio
async def test_translate_messages_splits_a_long_answer_and_joins_it():
    llm = MagicMock()
    llm.complete.side_effect = [
        MagicMock(text='{"1": "PART-A"}'),
        MagicMock(text='{"1": "PART-B"}'),
    ]
    long_answer = "x" * 9000
    with patch("app.services.chat_translate.LLMFactory.get_llm", return_value=llm):
        out = await translate_messages_with_llm(
            llm_config={"provider": "mistral", "chat_model": "mistral-small", "api_key": "x"},
            target_language="de",
            messages=[{"id": "a1", "role": "assistant", "content": long_answer}],
        )
    assert llm.complete.call_count == 2
    assert out["a1"] == "PART-APART-B"
    assert len(long_answer) > 8000


@pytest.mark.asyncio
async def test_translate_messages_requires_llm_config():
    with pytest.raises(ValueError, match="not configured"):
        await translate_messages_with_llm(
            llm_config=None,
            target_language="de",
            messages=[{"id": "m1", "role": "assistant", "content": "Hello"}],
        )
