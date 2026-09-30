"""Voice Pilot settings persistence (provider-aware)."""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional, Union

from sqlalchemy.orm import Session

from app.models import VoicePilotSettings
from app.utils.api_key import is_masked_api_key, mask_api_key

from . import tts_elevenlabs
from .providers import normalize_provider
from .providers.custom_tts import (
    DEFAULT_CUSTOM_SETTINGS,
    sanitize_custom_settings,
    voice_config_to_custom_tts,
)
from .schemas import (
    VoicePilotCustomVoiceConfig,
    VoicePilotSettingsOut,
    VoicePilotSettingsUpdate,
    VoicePilotVoiceConfig,
)

DEFAULT_PREVIEW_TEXT = "Hello from AI Voice Pilot, how may I help you!!"
PREVIEW_TEXT_MAX_LEN = 5000

_EMPTY_BUCKET = {
    "selected_voice_id": None,
    "selected_voice_name": None,
    "voice_configurations": {},
}


def _preview_text_for_out(raw: Any) -> str:
    """Return stored preview text; default only when the key was never set."""
    if raw is None:
        return DEFAULT_PREVIEW_TEXT
    return str(raw)[:PREVIEW_TEXT_MAX_LEN]


def _preview_text_for_store(raw: Any) -> str:
    """Persist user text as typed (truncated). Empty string is allowed."""
    return str(raw if raw is not None else "")[:PREVIEW_TEXT_MAX_LEN]


def get_or_create_settings(db: Session, project_id: uuid.UUID) -> VoicePilotSettings:
    row = (
        db.query(VoicePilotSettings)
        .filter(VoicePilotSettings.project_id == project_id)
        .first()
    )
    if row:
        _ensure_provider_state(row)
        return row
    row = VoicePilotSettings(id=uuid.uuid4(), project_id=project_id)
    row.voice_provider = "elevenlabs"
    row.provider_voice_state = {
        "elevenlabs": dict(_EMPTY_BUCKET),
        "custom": dict(_EMPTY_BUCKET),
    }
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _ensure_provider_state(row: VoicePilotSettings) -> None:
    """Backfill provider_voice_state from legacy columns when missing."""
    state = getattr(row, "provider_voice_state", None)
    if isinstance(state, dict) and ("elevenlabs" in state or "custom" in state):
        return
    row.provider_voice_state = {
        "elevenlabs": {
            "selected_voice_id": row.selected_voice_id,
            "selected_voice_name": row.selected_voice_name,
            "voice_configurations": getattr(row, "voice_configurations", None) or {},
        },
        "custom": dict(_EMPTY_BUCKET),
    }
    if not getattr(row, "voice_provider", None):
        row.voice_provider = "elevenlabs"


def _bucket(row: VoicePilotSettings, provider: str) -> Dict[str, Any]:
    _ensure_provider_state(row)
    state = dict(row.provider_voice_state or {})
    key = normalize_provider(provider)
    bucket = state.get(key)
    if not isinstance(bucket, dict):
        bucket = dict(_EMPTY_BUCKET)
        state[key] = bucket
        row.provider_voice_state = state
    return bucket


def _set_bucket(row: VoicePilotSettings, provider: str, bucket: Dict[str, Any]) -> None:
    state = dict(row.provider_voice_state or {})
    state[normalize_provider(provider)] = bucket
    # ensure both keys exist
    if "elevenlabs" not in state:
        state["elevenlabs"] = dict(_EMPTY_BUCKET)
    if "custom" not in state:
        state["custom"] = dict(_EMPTY_BUCKET)
    row.provider_voice_state = state


def _normalize_el_config_map(raw: Any) -> Dict[str, VoicePilotVoiceConfig]:
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, VoicePilotVoiceConfig] = {}
    for key, value in raw.items():
        voice_id = str(key or "").strip()
        if not voice_id or not isinstance(value, dict):
            continue
        try:
            out[voice_id] = VoicePilotVoiceConfig.model_validate(value)
        except Exception:
            continue
    return out


def _legacy_custom_to_el_shape(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Convert stored rate/pitch/volume Custom config → ElevenLabs-shaped UI fields."""
    sanitized = sanitize_custom_settings(raw)
    rate = float(sanitized["rate"])
    pitch = float(sanitized["pitch"])
    volume = float(sanitized["volume"])
    # Inverse of voice_config_to_custom_tts mapping (best-effort).
    speed = max(0.7, min(1.2, rate))
    style = max(0.0, min(1.0, (pitch - 1.0) / 0.5)) if pitch >= 1.0 else 0.0
    return {
        "stability": 0.45,
        "similarity_boost": 0.75,
        "style": style,
        "speed": speed,
        "use_speaker_boost": volume >= 0.85,
    }


def _normalize_custom_config_map(raw: Any) -> Dict[str, VoicePilotVoiceConfig]:
    """Custom bucket stores ElevenLabs-shaped configs (UI parity); map legacy rate/pitch/volume."""
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, VoicePilotVoiceConfig] = {}
    for key, value in raw.items():
        voice_id = str(key or "").strip()
        if not voice_id or not isinstance(value, dict):
            continue
        try:
            if "stability" in value or "similarity_boost" in value or "speed" in value:
                out[voice_id] = VoicePilotVoiceConfig.model_validate(
                    tts_elevenlabs.sanitize_voice_settings(value)
                )
            elif "rate" in value or "pitch" in value or "volume" in value:
                out[voice_id] = VoicePilotVoiceConfig.model_validate(
                    _legacy_custom_to_el_shape(value)
                )
            else:
                out[voice_id] = VoicePilotVoiceConfig.model_validate(
                    tts_elevenlabs.sanitize_voice_settings(value)
                )
        except Exception:
            continue
    return out


def active_provider(row: VoicePilotSettings) -> str:
    return normalize_provider(getattr(row, "voice_provider", None))


def settings_to_out(row: VoicePilotSettings) -> VoicePilotSettingsOut:
    _ensure_provider_state(row)
    provider = active_provider(row)
    bucket = _bucket(row, provider)
    key = row.elevenlabs_api_key

    configs_raw = bucket.get("voice_configurations") or {}
    if provider == "custom":
        configs: Dict[str, Union[VoicePilotVoiceConfig, VoicePilotCustomVoiceConfig]] = {
            k: v for k, v in _normalize_custom_config_map(configs_raw).items()
        }
    else:
        # Prefer bucket; fall back to legacy column for EL.
        if not configs_raw and getattr(row, "voice_configurations", None):
            configs_raw = row.voice_configurations
        configs = {k: v for k, v in _normalize_el_config_map(configs_raw).items()}

    sel_id = bucket.get("selected_voice_id")
    sel_name = bucket.get("selected_voice_name")
    if provider == "elevenlabs" and not sel_id:
        sel_id = row.selected_voice_id
        sel_name = row.selected_voice_name

    return VoicePilotSettingsOut(
        enabled=bool(row.enabled),
        has_api_key=bool(key and str(key).strip()),
        api_key_masked=mask_api_key(key) if key else None,
        voice_provider=provider,  # type: ignore[arg-type]
        selected_voice_id=sel_id,
        selected_voice_name=sel_name,
        stt_locale=row.stt_locale or "en-US",
        auto_listen_after_reply=bool(row.auto_listen_after_reply),
        preview_text=_preview_text_for_out(bucket.get("preview_text")),
        voice_configurations=configs,
    )


def apply_settings_update(
    db: Session,
    row: VoicePilotSettings,
    payload: VoicePilotSettingsUpdate,
) -> VoicePilotSettings:
    _ensure_provider_state(row)

    if payload.elevenlabs_api_key is not None:
        incoming = payload.elevenlabs_api_key.strip() if payload.elevenlabs_api_key else ""
        if incoming and not is_masked_api_key(incoming):
            row.elevenlabs_api_key = incoming
        elif incoming == "":
            row.elevenlabs_api_key = None

    if payload.voice_provider is not None:
        row.voice_provider = normalize_provider(payload.voice_provider)

    provider = active_provider(row)
    bucket = dict(_bucket(row, provider))

    if payload.selected_voice_id is not None:
        bucket["selected_voice_id"] = payload.selected_voice_id.strip() or None
        if provider == "elevenlabs":
            row.selected_voice_id = bucket["selected_voice_id"]
    if payload.selected_voice_name is not None:
        bucket["selected_voice_name"] = payload.selected_voice_name.strip() or None
        if provider == "elevenlabs":
            row.selected_voice_name = bucket["selected_voice_name"]

    if payload.stt_locale is not None:
        locale = payload.stt_locale.strip() or "en-US"
        row.stt_locale = locale[:32]
    if payload.auto_listen_after_reply is not None:
        row.auto_listen_after_reply = bool(payload.auto_listen_after_reply)
    if payload.enabled is not None:
        row.enabled = bool(payload.enabled)

    if payload.preview_text is not None:
        bucket["preview_text"] = _preview_text_for_store(payload.preview_text)

    if payload.voice_configurations is not None:
        if provider == "custom":
            current = _normalize_custom_config_map(bucket.get("voice_configurations"))
            for voice_id, cfg in payload.voice_configurations.items():
                vid = (voice_id or "").strip()
                if not vid:
                    continue
                if cfg is None:
                    current.pop(vid, None)
                elif isinstance(cfg, VoicePilotVoiceConfig):
                    current[vid] = cfg
                elif isinstance(cfg, dict):
                    if "stability" in cfg or "similarity_boost" in cfg or "speed" in cfg:
                        current[vid] = VoicePilotVoiceConfig.model_validate(
                            tts_elevenlabs.sanitize_voice_settings(cfg)
                        )
                    elif "rate" in cfg or "pitch" in cfg:
                        current[vid] = VoicePilotVoiceConfig.model_validate(
                            _legacy_custom_to_el_shape(cfg)
                        )
                    else:
                        current[vid] = VoicePilotVoiceConfig.model_validate(
                            tts_elevenlabs.sanitize_voice_settings(cfg)
                        )
                elif isinstance(cfg, VoicePilotCustomVoiceConfig):
                    current[vid] = VoicePilotVoiceConfig.model_validate(
                        _legacy_custom_to_el_shape(cfg.model_dump())
                    )
            bucket["voice_configurations"] = {k: v.model_dump() for k, v in current.items()}
        else:
            current_el = _normalize_el_config_map(bucket.get("voice_configurations"))
            if not current_el and getattr(row, "voice_configurations", None):
                current_el = _normalize_el_config_map(row.voice_configurations)
            for voice_id, cfg in payload.voice_configurations.items():
                vid = (voice_id or "").strip()
                if not vid:
                    continue
                if cfg is None:
                    current_el.pop(vid, None)
                elif isinstance(cfg, VoicePilotVoiceConfig):
                    current_el[vid] = cfg
                elif isinstance(cfg, dict) and "stability" in cfg:
                    current_el[vid] = VoicePilotVoiceConfig.model_validate(cfg)
            dumped = {k: v.model_dump() for k, v in current_el.items()}
            bucket["voice_configurations"] = dumped
            row.voice_configurations = dumped

    _set_bucket(row, provider, bucket)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def resolve_api_key(row: VoicePilotSettings, incoming: Optional[str] = None) -> Optional[str]:
    candidate = (incoming or "").strip()
    if candidate and not is_masked_api_key(candidate):
        return candidate
    stored = (row.elevenlabs_api_key or "").strip()
    return stored or None


def resolve_selected_voice(row: VoicePilotSettings, provider: Optional[str] = None) -> tuple[str, str]:
    """Return (voice_id, voice_name) for the given or active provider."""
    _ensure_provider_state(row)
    prov = normalize_provider(provider or active_provider(row))
    bucket = _bucket(row, prov)
    vid = (bucket.get("selected_voice_id") or "").strip()
    name = (bucket.get("selected_voice_name") or "").strip()
    if prov == "elevenlabs" and not vid:
        vid = (row.selected_voice_id or "").strip()
        name = (row.selected_voice_name or "").strip()
    return vid, name


def resolve_voice_settings(
    row: VoicePilotSettings,
    voice_id: str,
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Merge per-voice applied config for the active/requested provider."""
    prov = normalize_provider(provider or active_provider(row))
    vid = (voice_id or "").strip()
    bucket = _bucket(row, prov)
    configs_raw = bucket.get("voice_configurations") or {}

    if prov == "custom":
        defaults = dict(DEFAULT_CUSTOM_SETTINGS)
        if not vid:
            return defaults
        configs = _normalize_custom_config_map(configs_raw)
        cfg = configs.get(vid)
        if not cfg:
            return defaults
        # Map EL-shaped Custom UI config → edge-tts rate/pitch/volume.
        return voice_config_to_custom_tts(cfg.model_dump())

    defaults = dict(tts_elevenlabs.DEFAULT_VOICE_SETTINGS)
    if not vid:
        return defaults
    if not configs_raw and getattr(row, "voice_configurations", None):
        configs_raw = row.voice_configurations
    configs_el = _normalize_el_config_map(configs_raw)
    cfg_el = configs_el.get(vid)
    if not cfg_el:
        return defaults
    return tts_elevenlabs.sanitize_voice_settings(cfg_el.model_dump())
