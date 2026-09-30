"""Voice provider registry for AI Voice Pilot."""
from __future__ import annotations

from typing import Literal

from .custom_provider import CustomVoiceProvider
from .elevenlabs_provider import ElevenLabsVoiceProvider

VoiceProviderId = Literal["elevenlabs", "custom"]

_ELEVEN = ElevenLabsVoiceProvider()
_CUSTOM = CustomVoiceProvider()


def normalize_provider(value: str | None) -> VoiceProviderId:
    raw = (value or "").strip().lower()
    if raw == "custom":
        return "custom"
    return "elevenlabs"


def get_provider(provider: str | None) -> ElevenLabsVoiceProvider | CustomVoiceProvider:
    if normalize_provider(provider) == "custom":
        return _CUSTOM
    return _ELEVEN
