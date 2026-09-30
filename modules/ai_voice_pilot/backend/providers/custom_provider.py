"""Custom voice provider — catalog + edge-tts. Never imports ElevenLabs."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from . import custom_catalog, custom_tts


class CustomVoiceProvider:
    provider_id = "custom"

    def list_voices(self, **_kwargs: Any) -> List[Dict[str, Any]]:
        voices = custom_catalog.list_custom_voices()
        # API shape compatible with VoicePilotVoiceOut (+ extra fields)
        out: List[Dict[str, Any]] = []
        for v in voices:
            engine = str(v.get("engine_voice") or "").strip()
            # Always resolve from the bundled map (do not rely on stale catalog cache alone).
            preview_url = (
                custom_catalog.preview_url_for_engine(engine)
                or (str(v.get("preview_url") or "").strip() or None)
            )
            out.append(
                {
                    "voice_id": v["id"],
                    "name": v["name"],
                    "preview_url": preview_url,
                    "labels": {
                        "language": v.get("language") or "",
                        "language_code": v.get("language_code") or "",
                        "gender": v.get("gender") or "neutral",
                        "description": v.get("description") or "",
                        "age": v.get("age") or "Adult",
                    },
                    "provider": "custom",
                    "language": v.get("language"),
                    "language_code": v.get("language_code"),
                    "gender": v.get("gender"),
                    "description": v.get("description"),
                    "age": v.get("age") or "Adult",
                    "tags": list(v.get("tags") or []),
                }
            )
        return out

    def synthesize(
        self,
        *,
        text: str,
        voice_id: str,
        voice_settings: Optional[Dict[str, Any]] = None,
        **_kwargs: Any,
    ) -> bytes:
        return custom_tts.synthesize_custom_speech(
            text=text,
            voice_id=voice_id,
            voice_settings=voice_settings,
        )
