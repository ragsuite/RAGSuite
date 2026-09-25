"""Unit tests for AI Voice Pilot speech text helper and catalog presence."""
from __future__ import annotations

import os
from pathlib import Path

from app.platform.ee_guard import KNOWN_ENTERPRISE_MODULE_IDS
from app.platform.module_bootstrap import ensure_ragsuite_modules_path


def _ee_modules() -> Path:
    return Path(os.environ.get("RAGSUITE_EE_ROOT") or "/Users/arun/RAGSUITE_EE") / "modules"


def _require_ee():
    ee_root = _ee_modules()
    if not ee_root.is_dir():
        import pytest

        pytest.skip("RAGSUITE_EE modules not available")
    ensure_ragsuite_modules_path(ee_root)
    return ee_root


def test_ai_voice_pilot_in_enterprise_catalog():
    assert "ai_voice_pilot" in KNOWN_ENTERPRISE_MODULE_IDS


def test_plain_text_for_speech_strips_markdown():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.turn_service import plain_text_for_speech

    raw = "## Hello\n\nThis is **bold** with a [link](https://example.com)."
    out = plain_text_for_speech(raw)
    assert "Hello" in out
    assert "bold" in out
    assert "link" in out
    assert "**" not in out
    assert "http" not in out

    html = "<p>T3Planet builds TYPO3 tools.</p><p>It also sells extensions.</p>"
    html_out = plain_text_for_speech(html)
    assert "T3Planet builds TYPO3 tools." in html_out
    assert "<p>" not in html_out
    assert "</p>" not in html_out


def test_sanitize_voice_settings_clamps_and_defaults():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend import tts_elevenlabs

    defaults = tts_elevenlabs.sanitize_voice_settings(None)
    assert defaults["stability"] == 0.45
    assert defaults["speed"] == 1.0

    clamped = tts_elevenlabs.sanitize_voice_settings(
        {
            "stability": 2.0,
            "similarity_boost": -1,
            "style": 0.5,
            "speed": 0.5,
            "use_speaker_boost": False,
        }
    )
    assert clamped["stability"] == 1.0
    assert clamped["similarity_boost"] == 0.0
    assert clamped["style"] == 0.5
    assert clamped["speed"] == 0.7
    assert clamped["use_speaker_boost"] is False


def test_voice_intent_casual_greeting_and_thanks():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.conversation_intent import (
        classify_voice_intent,
        resolve_casual_spoken_reply,
    )
    from ragsuite_modules.ai_voice_pilot.backend.turn_service import CLARIFY_SPOKEN

    assert classify_voice_intent("hello") == "casual_greeting"
    assert classify_voice_intent("Hi!") == "casual_greeting"
    assert classify_voice_intent("Hey, how are you?") == "casual_greeting"
    assert classify_voice_intent("thanks") == "casual_thanks"
    assert classify_voice_intent("okay") == "casual_ack"
    assert classify_voice_intent("got it") == "casual_ack"

    hello = resolve_casual_spoken_reply("hello")
    assert hello
    assert hello != CLARIFY_SPOKEN
    assert "clear question" not in hello.lower()

    thanks = resolve_casual_spoken_reply("thanks")
    assert thanks
    assert "welcome" in thanks.lower() or "help" in thanks.lower() or "anytime" in thanks.lower()


def test_voice_intent_knowledge_not_casual():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.conversation_intent import (
        classify_voice_intent,
        resolve_casual_spoken_reply,
    )

    assert classify_voice_intent("What is RAG?") == "knowledge"
    assert classify_voice_intent("How does authentication work?") == "knowledge"
    assert classify_voice_intent("Can you explain that again?") == "knowledge"
    assert classify_voice_intent("Tell me more about that") == "knowledge"
    assert classify_voice_intent("What about OAuth?") == "knowledge"
    assert resolve_casual_spoken_reply("What is RAG?") is None


def test_voice_intent_unclear_short_uses_natural_clarify():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.conversation_intent import (
        resolve_casual_spoken_reply,
    )
    from ragsuite_modules.ai_voice_pilot.backend.turn_service import (
        CLARIFY_SPOKEN,
        is_fragmentary_transcript,
        resolve_spoken_answer,
    )

    assert resolve_casual_spoken_reply("um") is None
    assert is_fragmentary_transcript("um")
    spoken = resolve_spoken_answer(transcript="um", answer="")
    assert spoken == CLARIFY_SPOKEN
    assert "didn't catch a clear question" not in spoken.lower()
    assert "little more" in spoken.lower()


def test_short_knowledge_question_is_not_fragmentary():
    """\"what is t3planet?\" is 3 words but must reach RAG, not CLARIFY_SPOKEN."""
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.conversation_intent import (
        is_knowledge_shaped_query,
    )
    from ragsuite_modules.ai_voice_pilot.backend.turn_service import (
        is_fragmentary_transcript,
    )

    assert is_knowledge_shaped_query("what is t3planet?")
    assert not is_fragmentary_transcript("what is t3planet?")
    assert not is_fragmentary_transcript("What is RAG?")
    assert is_fragmentary_transcript("um")
    assert is_fragmentary_transcript("yeah ok")


def test_resolve_spoken_answer_ooc_natural():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.turn_service import (
        OOC_SPOKEN,
        resolve_spoken_answer,
    )

    out = resolve_spoken_answer(
        transcript="What is the cosmic waffle protocol?",
        answer="query_out_of_context: out of the context",
    )
    assert out == OOC_SPOKEN


def test_custom_catalog_has_at_least_30_voices():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.providers.custom_catalog import (
        filter_custom_voices,
        list_custom_voices,
    )

    voices = list_custom_voices()
    assert len(voices) >= 30
    assert all(v["id"].startswith("custom-") for v in voices)
    assert all(v["provider"] == "custom" for v in voices)
    assert all(v.get("engine_voice") for v in voices)

    aarav = filter_custom_voices(search="Aarav")
    assert len(aarav) >= 1
    assert aarav[0]["name"] == "Aarav"

    hindi_female = filter_custom_voices(language="Hindi", gender="female")
    assert any(v["name"] == "Aarti" for v in hindi_female)

    male = filter_custom_voices(gender="male")
    female = filter_custom_voices(gender="female")
    assert len(male) >= 1
    assert len(female) >= 1
    assert all(v["gender"] == "male" for v in male)


def test_custom_provider_list_isolated_from_elevenlabs():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.providers.custom_provider import (
        CustomVoiceProvider,
    )
    from ragsuite_modules.ai_voice_pilot.backend.providers.elevenlabs_provider import (
        ElevenLabsVoiceProvider,
    )

    custom = CustomVoiceProvider()
    el = ElevenLabsVoiceProvider()
    assert custom.provider_id == "custom"
    assert el.provider_id == "elevenlabs"
    listed = custom.list_voices()
    assert len(listed) >= 30
    assert all(v.get("provider") == "custom" for v in listed)
    # Custom module must not import elevenlabs client
    import ragsuite_modules.ai_voice_pilot.backend.providers.custom_tts as ct
    import ragsuite_modules.ai_voice_pilot.backend.providers.custom_catalog as cc

    assert "tts_elevenlabs" not in ct.__dict__
    assert "tts_elevenlabs" not in cc.__dict__


def test_normalize_provider():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.providers import normalize_provider

    assert normalize_provider("custom") == "custom"
    assert normalize_provider("CUSTOM") == "custom"
    assert normalize_provider(None) == "elevenlabs"
    assert normalize_provider("elevenlabs") == "elevenlabs"


def test_spoken_system_prompt_is_concise_policy():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.turn_service import SPOKEN_SYSTEM_PROMPT

    lower = SPOKEN_SYSTEM_PROMPT.lower()
    assert "one to three sentences" in lower
    assert "marketing" in lower
    assert "paragraphs" not in lower
    assert "bullet lists" in lower or "numbered lists" in lower


def test_pop_speakable_chunks_sentence_only_no_soft_break():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.turn_service import pop_speakable_chunks

    # Comma / mid-phrase must not flush before a sentence end.
    mid = (
        "T3Planet is a comprehensive one-stop platform for TYPO3 solutions, "
        "templates, extensions, and SaaS tools all in one place"
    )
    chunks, rem, done = pop_speakable_chunks(mid, first_chunk_done=False)
    assert chunks == []
    assert rem == mid or rem.strip() == mid.strip()
    assert done is False

    # Full sentence flushes.
    with_end = mid + ". They also sell extensions."
    chunks, rem, done = pop_speakable_chunks(with_end, first_chunk_done=False)
    assert len(chunks) >= 1
    assert chunks[0].endswith(".")
    assert "They also sell extensions." in (rem + " " + " ".join(chunks))
    assert done is True

    # After first chunk, remaining complete sentences flush together.
    buffer = "First sentence. Second sentence. Trailing"
    chunks, rem, done = pop_speakable_chunks(buffer, first_chunk_done=True)
    assert chunks == ["First sentence.", "Second sentence."]
    assert rem == "Trailing"
    assert done is True


def test_voice_config_to_custom_tts_maps_el_shape():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.providers.custom_tts import (
        voice_config_to_custom_tts,
    )

    mapped = voice_config_to_custom_tts(
        {
            "stability": 0.45,
            "similarity_boost": 0.75,
            "style": 0.5,
            "speed": 1.1,
            "use_speaker_boost": True,
        }
    )
    assert mapped["rate"] == 1.1
    assert abs(mapped["pitch"] - 1.25) < 0.001
    assert mapped["volume"] == 1.0

    legacy = voice_config_to_custom_tts({"rate": 1.2, "pitch": 0.9, "volume": 0.8})
    assert legacy["rate"] == 1.2
    assert legacy["pitch"] == 0.9
    assert legacy["volume"] == 0.8

    quiet = voice_config_to_custom_tts(
        {
            "stability": 0.5,
            "similarity_boost": 0.5,
            "style": 0.0,
            "speed": 1.0,
            "use_speaker_boost": False,
        }
    )
    assert quiet["volume"] == 0.7
