"""Pydantic schemas for AI Voice Pilot."""
from __future__ import annotations

from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

VoiceProviderId = Literal["elevenlabs", "custom"]


class VoicePilotVoiceConfig(BaseModel):
    """Per-voice ElevenLabs voice_settings (field names match API)."""

    stability: float = Field(0.45, ge=0.0, le=1.0)
    similarity_boost: float = Field(0.75, ge=0.0, le=1.0)
    style: float = Field(0.0, ge=0.0, le=1.0)
    speed: float = Field(1.0, ge=0.7, le=1.2)
    use_speaker_boost: bool = True


class VoicePilotCustomVoiceConfig(BaseModel):
    """Per-voice Custom TTS settings (edge-tts)."""

    rate: float = Field(1.0, ge=0.5, le=2.0)
    pitch: float = Field(1.0, ge=0.5, le=2.0)
    volume: float = Field(1.0, ge=0.0, le=1.0)


class VoicePilotSettingsOut(BaseModel):
    enabled: bool = True
    has_api_key: bool = False
    api_key_masked: Optional[str] = None
    voice_provider: VoiceProviderId = "elevenlabs"
    selected_voice_id: Optional[str] = None
    selected_voice_name: Optional[str] = None
    stt_locale: str = "en-US"
    auto_listen_after_reply: bool = False
    preview_text: str = "Hello from AI Voice Pilot, how may I help you!!"
    voice_configurations: Dict[str, Union[VoicePilotVoiceConfig, VoicePilotCustomVoiceConfig]] = (
        Field(default_factory=dict)
    )


class VoicePilotSettingsUpdate(BaseModel):
    elevenlabs_api_key: Optional[str] = None
    voice_provider: Optional[VoiceProviderId] = None
    selected_voice_id: Optional[str] = None
    selected_voice_name: Optional[str] = None
    stt_locale: Optional[str] = None
    auto_listen_after_reply: Optional[bool] = None
    enabled: Optional[bool] = None
    preview_text: Optional[str] = Field(None, max_length=5000)
    # Merge map for the *active* provider bucket; null clears that voice.
    voice_configurations: Optional[
        Dict[str, Optional[Union[VoicePilotVoiceConfig, VoicePilotCustomVoiceConfig]]]
    ] = None


class VoicePilotTestKeyRequest(BaseModel):
    elevenlabs_api_key: Optional[str] = None


class VoicePilotTestKeyResponse(BaseModel):
    ok: bool
    message: str


class VoicePilotVoiceOut(BaseModel):
    voice_id: str
    name: str
    preview_url: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    provider: Optional[str] = None
    language: Optional[str] = None
    language_code: Optional[str] = None
    gender: Optional[str] = None
    description: Optional[str] = None
    age: Optional[str] = None
    tags: Optional[List[str]] = None


class VoicePilotTtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: Optional[str] = None
    provider: Optional[VoiceProviderId] = None


class VoicePilotChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class VoicePilotTurnRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    chat_history: Optional[List[VoicePilotChatMessage]] = None
    provider: Optional[VoiceProviderId] = None
    voice_id: Optional[str] = None


class VoicePilotTurnResponse(BaseModel):
    answer: str
    session_id: Optional[str] = None


class VoicePilotWidgetBootstrapOut(BaseModel):
    """Public widget bootstrap — no secrets."""

    enabled: bool = True
    provider: VoiceProviderId = "elevenlabs"
    voice_id: Optional[str] = None
    voice_name: Optional[str] = None
    preview_text: str = "Hello from AI Voice Pilot, how may I help you!!"
    stt_locale: str = "en-US"
    has_api_key: bool = False


class VoicePilotWidgetTtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
