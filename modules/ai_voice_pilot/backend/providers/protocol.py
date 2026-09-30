"""Provider-independent voice TTS protocol for AI Voice Pilot."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@runtime_checkable
class VoiceTtsProvider(Protocol):
    provider_id: str

    def list_voices(self, **kwargs: Any) -> List[Dict[str, Any]]:
        """Return normalized voice dicts for the API layer."""
        ...

    def synthesize(
        self,
        *,
        text: str,
        voice_id: str,
        voice_settings: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> bytes:
        """Return audio/mpeg bytes."""
        ...
