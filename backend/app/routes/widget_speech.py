"""Widget TTS/ASR proxy — uses the project's configured provider models, never the browser key."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_project_id_or_user
from app.db import get_db
from app.services.extra_model_runtime import (
    resolve_extra_model,
    synthesize_speech,
    transcribe_audio,
    widget_model_provider,
)

router = APIRouter(prefix="/api/v1/widget/speech", tags=["Widget Speech"])


class TtsIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)
    surface: str = Field("chat", pattern="^(chat|search)$")
    voice: Optional[str] = Field(None, max_length=64)


def _project_id(auth: Dict[str, Any]) -> Any:
    auth_type = auth.get("type")
    if auth_type == "widget":
        return auth.get("project_id")
    if auth_type == "api_key":
        api_key = auth.get("api_key")
        return getattr(api_key, "project_id", None)
    project = auth.get("project")
    if project is not None:
        return getattr(project, "id", None)
    return auth.get("project_id")


@router.get("/config")
def speech_config(
    surface: str = "chat",
    project_id: Optional[str] = None,
    db: Session = Depends(get_db),
    auth: Dict[str, Any] = Depends(get_project_id_or_user),
):
    project_id = _project_id(auth) or project_id
    if not project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project is required")
    provider = widget_model_provider(db, project_id, surface if surface in {"chat", "search"} else "chat")
    asr = resolve_extra_model(db, project_id, "asr", provider)
    tts = resolve_extra_model(db, project_id, "tts", provider)
    return {
        "success": True,
        "data": {
            "asr": {"enabled": asr is not None, "model": asr.model if asr else None},
            "tts": {"enabled": tts is not None, "model": tts.model if tts else None},
        },
    }


@router.post("/tts")
def speech_tts(
    payload: TtsIn,
    db: Session = Depends(get_db),
    auth: Dict[str, Any] = Depends(get_project_id_or_user),
):
    from fastapi.responses import Response

    project_id = _project_id(auth)
    if not project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project is required")
    provider = widget_model_provider(db, project_id, payload.surface)
    ref = resolve_extra_model(db, project_id, "tts", provider)
    if ref is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No TTS model configured")
    audio = synthesize_speech(ref, payload.text, voice=payload.voice or "alloy")
    if not audio:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="TTS provider failed")
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/stt")
async def speech_stt(
    surface: str = Form("chat"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    auth: Dict[str, Any] = Depends(get_project_id_or_user),
):
    project_id = _project_id(auth)
    if not project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project is required")
    provider = widget_model_provider(db, project_id, surface if surface in {"chat", "search"} else "chat")
    ref = resolve_extra_model(db, project_id, "asr", provider)
    if ref is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No ASR model configured")
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio is required")
    text = transcribe_audio(ref, audio, filename=file.filename or "speech.webm")
    if not text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="ASR provider failed")
    return {"success": True, "data": {"text": text}}
