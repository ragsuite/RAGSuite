"""AI Voice Pilot HTTP routes — provider-aware TTS."""
from __future__ import annotations

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user_required, get_project_id_or_user, resolve_embed_project_context
from app.db import get_db
from app.models import Project, User
from app.platform.auth import require_project_permission

from . import tts_elevenlabs
from .providers import get_provider, normalize_provider
from .providers.custom_tts import CustomTtsError
from .schemas import (
    VoicePilotSettingsOut,
    VoicePilotSettingsUpdate,
    VoicePilotTestKeyRequest,
    VoicePilotTestKeyResponse,
    VoicePilotTtsRequest,
    VoicePilotTurnRequest,
    VoicePilotTurnResponse,
    VoicePilotVoiceOut,
    VoicePilotWidgetBootstrapOut,
    VoicePilotWidgetTtsRequest,
)
from .settings_service import (
    active_provider,
    apply_settings_update,
    get_or_create_settings,
    resolve_api_key,
    resolve_selected_voice,
    resolve_voice_settings,
    settings_to_out,
)
from .stream_turn_service import voice_pilot_turn_stream_response
from .turn_service import run_voice_pilot_turn
from .widget_context import (
    build_widget_bootstrap,
    resolve_widget_turn_voice,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/voice-pilot", tags=["AI Voice Pilot"])


def _http_from_eleven(exc: tts_elevenlabs.ElevenLabsError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


def _http_from_custom(exc: CustomTtsError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


def _resolve_widget_auth(auth: dict, db: Session, project_id: Optional[UUID] = None) -> tuple[Project, int]:
    """Widget embed or dashboard user with project access."""
    if auth.get("type") in ("widget", "api_key"):
        return resolve_embed_project_context(auth, db, query_project_id=project_id)
    if auth.get("type") == "user":
        user_id = int(auth["user_id"])
        pid = project_id or auth.get("project_id")
        if not pid:
            raise HTTPException(status_code=400, detail="project_id is required")
        project_uuid = pid if isinstance(pid, UUID) else UUID(str(pid))
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        # Settings rows are keyed by owner
        return project, int(project.owner_id)
    raise HTTPException(status_code=403, detail="Authentication required")



@router.get("/settings", response_model=VoicePilotSettingsOut)
async def get_settings(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:use")),
):
    row = get_or_create_settings(db, project.id)
    return settings_to_out(row)


@router.put("/settings", response_model=VoicePilotSettingsOut)
async def put_settings(
    payload: VoicePilotSettingsUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:settings")),
):
    row = get_or_create_settings(db, project.id)
    row = apply_settings_update(db, row, payload)
    return settings_to_out(row)


@router.post("/settings/test-key", response_model=VoicePilotTestKeyResponse)
async def test_settings_key(
    payload: VoicePilotTestKeyRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:settings")),
):
    row = get_or_create_settings(db, project.id)
    api_key = resolve_api_key(row, payload.elevenlabs_api_key)
    if not api_key:
        raise HTTPException(status_code=400, detail="ElevenLabs API key is required")
    try:
        tts_elevenlabs.validate_api_key(api_key)
    except tts_elevenlabs.ElevenLabsError as exc:
        raise _http_from_eleven(exc) from exc
    return VoicePilotTestKeyResponse(ok=True, message="ElevenLabs API key is valid")


@router.get("/voices", response_model=List[VoicePilotVoiceOut])
async def list_voices(
    provider: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:use")),
):
    row = get_or_create_settings(db, project.id)
    prov = normalize_provider(provider or active_provider(row))
    impl = get_provider(prov)

    if prov == "custom":
        voices = impl.list_voices()
        return [VoicePilotVoiceOut(**v) for v in voices]

    api_key = resolve_api_key(row)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Add an ElevenLabs API key in Voice Pilot settings first",
        )
    try:
        voices = impl.list_voices(api_key=api_key)
    except tts_elevenlabs.ElevenLabsError as exc:
        raise _http_from_eleven(exc) from exc
    return [VoicePilotVoiceOut(**v) for v in voices]


async def _tts_audio(
    *,
    db: Session,
    project: Project,
    payload: VoicePilotTtsRequest,
) -> Response:
    row = get_or_create_settings(db, project.id)
    prov = normalize_provider(payload.provider or active_provider(row))
    voice_id, _ = resolve_selected_voice(row, prov)
    if payload.voice_id:
        voice_id = payload.voice_id.strip()
    if not voice_id:
        raise HTTPException(status_code=400, detail="Select a voice before speaking")

    voice_settings = resolve_voice_settings(row, voice_id, provider=prov)
    impl = get_provider(prov)

    if prov == "custom":
        try:
            audio = impl.synthesize(
                text=payload.text,
                voice_id=voice_id,
                voice_settings=voice_settings,
            )
        except CustomTtsError as exc:
            raise _http_from_custom(exc) from exc
        return Response(content=audio, media_type="audio/mpeg")

    api_key = resolve_api_key(row)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Add an ElevenLabs API key in Voice Pilot settings first",
        )
    try:
        audio = impl.synthesize(
            text=payload.text,
            voice_id=voice_id,
            voice_settings=voice_settings,
            api_key=api_key,
        )
    except tts_elevenlabs.ElevenLabsError as exc:
        raise _http_from_eleven(exc) from exc
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/tts/preview")
async def tts_preview(
    payload: VoicePilotTtsRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:use")),
):
    return await _tts_audio(db=db, project=project, payload=payload)


@router.post("/tts/speak")
async def tts_speak(
    payload: VoicePilotTtsRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:use")),
):
    return await _tts_audio(db=db, project=project, payload=payload)


@router.post("/turn", response_model=VoicePilotTurnResponse)
async def voice_turn(
    payload: VoicePilotTurnRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:use")),
):
    answer = await run_voice_pilot_turn(
        db=db,
        project_id=project.id if isinstance(project.id, UUID) else UUID(str(project.id)),
        user_id=int(user.id),
        text=payload.text,
        chat_history=[m.model_dump() for m in (payload.chat_history or [])] or None,
    )
    return VoicePilotTurnResponse(answer=answer, session_id=payload.session_id)


@router.post("/turn/stream")
async def voice_turn_stream(
    payload: VoicePilotTurnRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("voice_pilot:use")),
):
    """SSE: sentence audio chunks while RAG answer streams (human-like speak)."""
    project_id = project.id if isinstance(project.id, UUID) else UUID(str(project.id))
    return StreamingResponse(
        voice_pilot_turn_stream_response(
            db=db,
            project_id=project_id,
            user_id=int(user.id),
            text=payload.text,
            voice_id=payload.voice_id,
            chat_history=[m.model_dump() for m in (payload.chat_history or [])] or None,
            provider=payload.provider,
        ),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/widget/bootstrap", response_model=VoicePilotWidgetBootstrapOut)
async def widget_voice_pilot_bootstrap(
    project_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """Embed or dashboard auth bootstrap for chatbot Voice Pilot tab (no secrets)."""
    project, settings_user_id = _resolve_widget_auth(auth, db, project_id)
    payload = build_widget_bootstrap(
        db, project=project, settings_user_id=settings_user_id
    )
    return VoicePilotWidgetBootstrapOut(**payload)


@router.post("/widget/tts")
async def widget_voice_pilot_tts(
    payload: VoicePilotWidgetTtsRequest,
    project_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """Embed or dashboard TTS using chatbot-configured provider + selected voice."""
    project, settings_user_id = _resolve_widget_auth(auth, db, project_id)
    project_id = project.id if isinstance(project.id, UUID) else UUID(str(project.id))
    provider, voice_id, _ = resolve_widget_turn_voice(
        db, project_id=project_id, settings_user_id=settings_user_id
    )
    row = get_or_create_settings(db, project_id)
    voice_settings = resolve_voice_settings(row, voice_id, provider=provider)
    impl = get_provider(provider)
    if provider == "custom":
        try:
            audio = impl.synthesize(
                text=payload.text,
                voice_id=voice_id,
                voice_settings=voice_settings,
            )
        except CustomTtsError as exc:
            raise _http_from_custom(exc) from exc
        return Response(content=audio, media_type="audio/mpeg")

    api_key = resolve_api_key(row)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Add an ElevenLabs API key in Voice Pilot settings first",
        )
    try:
        audio = impl.synthesize(
            text=payload.text,
            voice_id=voice_id,
            voice_settings=voice_settings,
            api_key=api_key,
        )
    except tts_elevenlabs.ElevenLabsError as exc:
        raise _http_from_eleven(exc) from exc
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/widget/turn/stream")
async def widget_voice_pilot_turn_stream(
    payload: VoicePilotTurnRequest,
    project_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """Embed or dashboard streaming turn; provider/voice forced from chatbot config."""
    project, settings_user_id = _resolve_widget_auth(auth, db, project_id)
    project_id = project.id if isinstance(project.id, UUID) else UUID(str(project.id))
    provider, voice_id, _ = resolve_widget_turn_voice(
        db, project_id=project_id, settings_user_id=settings_user_id
    )
    return StreamingResponse(
        voice_pilot_turn_stream_response(
            db=db,
            project_id=project_id,
            user_id=int(settings_user_id),
            text=payload.text,
            voice_id=voice_id,
            chat_history=[m.model_dump() for m in (payload.chat_history or [])] or None,
            provider=provider,
        ),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
