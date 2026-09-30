"""ElevenLabs provider adapter — thin wrap; does not change tts_elevenlabs behavior."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .. import tts_elevenlabs


class ElevenLabsVoiceProvider:
    provider_id = "elevenlabs"

    def list_voices(self, *, api_key: str, **_kwargs: Any) -> List[Dict[str, Any]]:
        voices = tts_elevenlabs.list_voices(api_key)
        out: List[Dict[str, Any]] = []
        for v in voices:
            item = dict(v)
            item["provider"] = "elevenlabs"
            out.append(item)
        return out

    def synthesize(
        self,
        *,
        text: str,
        voice_id: str,
        voice_settings: Optional[Dict[str, Any]] = None,
        api_key: str = "",
        preferred_model_id: Optional[str] = None,
        **_kwargs: Any,
    ) -> bytes:
        audio, _used_model = tts_elevenlabs.synthesize_speech(
            api_key,
            text=text,
            voice_id=voice_id,
            voice_settings=voice_settings,
            preferred_model_id=preferred_model_id,
        )
        return audio

    def synthesize_with_model(
        self,
        *,
        text: str,
        voice_id: str,
        voice_settings: Optional[Dict[str, Any]] = None,
        api_key: str = "",
        preferred_model_id: Optional[str] = None,
        **_kwargs: Any,
    ) -> tuple[bytes, str]:
        """Like synthesize, but also returns the ElevenLabs model_id used."""
        return tts_elevenlabs.synthesize_speech(
            api_key,
            text=text,
            voice_id=voice_id,
            voice_settings=voice_settings,
            preferred_model_id=preferred_model_id,
        )
