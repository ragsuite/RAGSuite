"""Custom TTS via edge-tts (Microsoft neural voices). No ElevenLabs imports."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from .custom_catalog import resolve_engine_voice

logger = logging.getLogger(__name__)


class CustomTtsError(Exception):
    def __init__(self, message: str, *, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


DEFAULT_CUSTOM_SETTINGS = {
    "rate": 1.0,
    "pitch": 1.0,
    "volume": 1.0,
}


def sanitize_custom_settings(raw: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
    base = dict(DEFAULT_CUSTOM_SETTINGS)
    if not isinstance(raw, dict):
        return base

    def _f(key: str, lo: float, hi: float) -> None:
        if key not in raw:
            return
        try:
            base[key] = max(lo, min(hi, float(raw[key])))
        except (TypeError, ValueError):
            pass

    _f("rate", 0.5, 2.0)
    _f("pitch", 0.5, 2.0)
    _f("volume", 0.0, 1.0)
    return base


def voice_config_to_custom_tts(raw: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
    """Map ElevenLabs-shaped voice_settings (Custom UI parity) → edge-tts prosody.

    Custom stores the same field names as ElevenLabs (separate provider bucket).
    edge-tts only understands rate/pitch/volume, so:
      - speed → rate
      - style → pitch offset
      - use_speaker_boost → volume
      - stability / similarity_boost retained in storage only (no direct engine knobs)
    """
    if not isinstance(raw, dict):
        return dict(DEFAULT_CUSTOM_SETTINGS)

    # Legacy Custom-native shape (rate/pitch/volume) — keep working if still stored.
    if "rate" in raw or "pitch" in raw or "volume" in raw:
        if "stability" not in raw and "similarity_boost" not in raw and "speed" not in raw:
            return sanitize_custom_settings(raw)

    try:
        speed = float(raw.get("speed", 1.0))
    except (TypeError, ValueError):
        speed = 1.0
    try:
        style = float(raw.get("style", 0.0))
    except (TypeError, ValueError):
        style = 0.0
    boost = raw.get("use_speaker_boost", True)
    if not isinstance(boost, bool):
        boost = bool(boost)

    rate = max(0.5, min(2.0, speed))
    # Style exaggeration → slight pitch lift (0 → 1.0, 1 → 1.5)
    pitch = max(0.5, min(2.0, 1.0 + max(0.0, min(1.0, style)) * 0.5))
    volume = 1.0 if boost else 0.7
    return {"rate": rate, "pitch": pitch, "volume": volume}


def _rate_to_edge(rate: float) -> str:
    # edge-tts expects e.g. "+0%" or "-20%"
    pct = int(round((rate - 1.0) * 100))
    if pct == 0:
        return "+0%"
    return f"{pct:+d}%"


def _pitch_to_edge(pitch: float) -> str:
    hz = int(round((pitch - 1.0) * 50))
    if hz == 0:
        return "+0Hz"
    return f"{hz:+d}Hz"


def _volume_to_edge(volume: float) -> str:
    pct = int(round((volume - 1.0) * 100))
    if pct == 0:
        return "+0%"
    return f"{pct:+d}%"


async def _synthesize_async(
    *,
    text: str,
    engine_voice: str,
    settings: Dict[str, float],
) -> bytes:
    try:
        import edge_tts
    except ImportError as exc:
        raise CustomTtsError(
            "Custom voice engine is not installed on the server",
            status_code=503,
        ) from exc

    spoken = (text or "").strip()
    if not spoken:
        raise CustomTtsError("Text is empty", status_code=400)

    communicate = edge_tts.Communicate(
        spoken,
        engine_voice,
        rate=_rate_to_edge(settings["rate"]),
        pitch=_pitch_to_edge(settings["pitch"]),
        volume=_volume_to_edge(settings["volume"]),
    )
    chunks: list[bytes] = []
    try:
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                data = chunk.get("data")
                if data:
                    chunks.append(data)
    except Exception as exc:
        logger.warning("Custom TTS failed for %s: %s", engine_voice, exc)
        raise CustomTtsError(
            "Could not generate Custom voice audio. Try again shortly.",
            status_code=502,
        ) from exc

    if not chunks:
        raise CustomTtsError("Custom voice returned empty audio", status_code=502)
    return b"".join(chunks)


def synthesize_custom_speech(
    *,
    text: str,
    voice_id: str,
    voice_settings: Optional[Dict[str, Any]] = None,
) -> bytes:
    engine = resolve_engine_voice(voice_id)
    if not engine:
        raise CustomTtsError("Unknown Custom voice", status_code=400)
    settings = voice_config_to_custom_tts(voice_settings)

    def _run() -> bytes:
        return asyncio.run(
            _synthesize_async(text=text, engine_voice=engine, settings=settings)
        )

    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(_run).result(timeout=60)
        return _run()
    except CustomTtsError:
        raise
    except Exception as exc:
        logger.error("Custom TTS unexpected error: %s", exc, exc_info=True)
        raise CustomTtsError(
            "Could not generate Custom voice audio. Try again shortly.",
            status_code=502,
        ) from exc
