from unittest.mock import MagicMock, patch

import pytest

from app.services.chat_translate import (
    TranslationEmptyError,
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
async def test_translate_messages_requires_llm_config():
    with pytest.raises(ValueError, match="not configured"):
        await translate_messages_with_llm(
            llm_config=None,
            target_language="de",
            messages=[{"id": "m1", "role": "assistant", "content": "Hello"}],
        )
