"""Resolve chatbot widget Voice Pilot provider/voice from ChatbotSettings."""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ChatbotSettings, Project

from .settings_service import (
    DEFAULT_PREVIEW_TEXT,
    get_or_create_settings,
    resolve_selected_voice,
)


def resolve_chatbot_voice_pilot_provider(
    db: Session,
    *,
    project_id: UUID,
    settings_user_id: int,
) -> Tuple[str, ChatbotSettings]:
    """Return (provider, chatbot_settings) or raise 404 when toggle off / missing."""
    row = (
        db.query(ChatbotSettings)
        .filter(
            ChatbotSettings.user_id == settings_user_id,
            ChatbotSettings.project_id == project_id,
        )
        .first()
    )
    if not row or not bool(getattr(row, "widget_voice_pilot_enabled", False)):
        raise HTTPException(status_code=404, detail="Voice Pilot is not enabled for this chatbot")
    provider = (
        "custom"
        if getattr(row, "widget_voice_pilot_provider", None) == "custom"
        else "elevenlabs"
    )
    return provider, row


def _preview_for_provider(vp, provider: str) -> str:
    state = getattr(vp, "provider_voice_state", None) or {}
    bucket = state.get(provider) if isinstance(state, dict) else None
    if isinstance(bucket, dict) and bucket.get("preview_text") is not None:
        text = str(bucket.get("preview_text") or "")[:5000]
        return text or DEFAULT_PREVIEW_TEXT
    return DEFAULT_PREVIEW_TEXT


def build_widget_bootstrap(
    db: Session,
    *,
    project: Project,
    settings_user_id: int,
) -> Dict[str, Any]:
    """Public-safe bootstrap payload (no API keys)."""
    project_id = project.id if isinstance(project.id, UUID) else UUID(str(project.id))
    provider, _ = resolve_chatbot_voice_pilot_provider(
        db, project_id=project_id, settings_user_id=settings_user_id
    )
    vp = get_or_create_settings(db, project_id)
    voice_id, voice_name = resolve_selected_voice(vp, provider)
    return {
        "enabled": True,
        "provider": provider,
        "voice_id": voice_id or None,
        "voice_name": voice_name or None,
        "preview_text": _preview_for_provider(vp, provider),
        "stt_locale": vp.stt_locale or "en-US",
        "has_api_key": bool(vp.elevenlabs_api_key and str(vp.elevenlabs_api_key).strip())
        if provider == "elevenlabs"
        else True,
    }


def resolve_widget_turn_voice(
    db: Session,
    *,
    project_id: UUID,
    settings_user_id: int,
) -> Tuple[str, str, Optional[str]]:
    """Return (provider, voice_id, voice_name) forced from chatbot config."""
    provider, _ = resolve_chatbot_voice_pilot_provider(
        db, project_id=project_id, settings_user_id=settings_user_id
    )
    vp = get_or_create_settings(db, project_id)
    voice_id, voice_name = resolve_selected_voice(vp, provider)
    if not voice_id:
        raise HTTPException(status_code=400, detail="Select a voice in Voice Pilot settings first")
    return provider, voice_id, voice_name or None
