"""AI Assistant HTTP routes (CE module)."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Iterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    AIAssistantMessage,
    AIAssistantSession,
    AIAssistantSettings,
    ModelConfigProfile,
    Project,
    User,
)
from app.platform.auth import get_current_user_required, require_project_permission
from app.platform.widget_capabilities import collect_public_widget_capabilities
from app.services.rag.language_config import build_language_instruction
from app.utils.api_key import (
    build_provider_api_key_masks,
    is_masked_api_key,
    mask_api_key,
    normalize_provider_for_connection_test,
    resolve_stored_provider_api_key,
)

from .agent import run_assistant_turn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai-assistant", tags=["AI Assistant"])

AI_ASSISTANT_PROFILE_TYPE = "ai_assistant"

# Chatbot Configuration language dropdown codes (excl. legacy-only extras).
_ALLOWED_ASSISTANT_LANGUAGES = frozenset(
    {"en", "en-gb", "hi", "es", "fr", "de", "ar", "pt", "zh"}
)


def _normalize_assistant_language(value: Optional[str]) -> str:
    raw = (value or "").strip().lower().replace("_", "-")
    if raw in _ALLOWED_ASSISTANT_LANGUAGES:
        return raw
    if not raw:
        return "en"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported language code: {value}",
    )


class AiAssistantSettingsOut(BaseModel):
    configured: bool
    model_provider: str = "openai"
    chat_model: Optional[str] = None
    api_key_masked: Optional[str] = None
    has_api_key: bool = False
    provider_api_keys: dict[str, str] = Field(default_factory=dict)
    base_url: Optional[str] = None
    temperature: Optional[str] = None
    max_tokens: Optional[int] = None
    language: str = "en"


class AiAssistantSettingsUpdate(BaseModel):
    model_provider: Optional[str] = None
    chat_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    temperature: Optional[str] = None
    max_tokens: Optional[int] = None
    language: Optional[str] = None


class SessionCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)


class SessionUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class SessionOut(BaseModel):
    id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MessageOut(BaseModel):
    id: str
    role: str
    content: Optional[str] = None
    tool_name: Optional[str] = None
    created_at: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)


class TestConnectionRequest(BaseModel):
    model_provider: Optional[str] = None
    chat_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class TestConnectionOut(BaseModel):
    ok: bool
    message: str


def _settings_out(
    row: Optional[AIAssistantSettings],
    *,
    db: Session,
    user_id: int,
    project_id: uuid.UUID,
) -> AiAssistantSettingsOut:
    if not row:
        return AiAssistantSettingsOut(configured=False, language="en")
    provider = normalize_provider_for_connection_test(row.model_provider) or "openai"
    provider_api_keys = build_provider_api_key_masks(
        db,
        user_id=user_id,
        project_id=project_id,
        profile_type=AI_ASSISTANT_PROFILE_TYPE,
        active_provider=provider,
        active_api_key=row.api_key,
    )
    masked = provider_api_keys.get(provider) or mask_api_key(row.api_key)
    language = (row.language or "en").strip().lower() or "en"
    if language not in _ALLOWED_ASSISTANT_LANGUAGES:
        language = "en"
    return AiAssistantSettingsOut(
        configured=True,
        model_provider=row.model_provider or "openai",
        chat_model=row.chat_model,
        api_key_masked=masked,
        has_api_key=bool(masked),
        provider_api_keys=provider_api_keys,
        base_url=row.base_url,
        temperature=row.temperature,
        max_tokens=row.max_tokens,
        language=language,
    )


def _upsert_ai_assistant_profile(db: Session, user_id: int, settings: AIAssistantSettings) -> None:
    """Persist per-provider key for AI Assistant (isolated from chat/search profiles)."""
    provider = (settings.model_provider or "openai").lower()
    provider_key = normalize_provider_for_connection_test(provider)
    model_name = (settings.chat_model or "").strip() or "default"
    try:
        existing = (
            db.query(ModelConfigProfile)
            .filter(
                and_(
                    ModelConfigProfile.user_id == user_id,
                    ModelConfigProfile.project_id == settings.project_id,
                    ModelConfigProfile.provider == provider,
                    ModelConfigProfile.model_name == model_name,
                    ModelConfigProfile.profile_type == AI_ASSISTANT_PROFILE_TYPE,
                )
            )
            .first()
        )
        if existing:
            existing.api_key = settings.api_key
        else:
            db.add(
                ModelConfigProfile(
                    user_id=user_id,
                    project_id=settings.project_id,
                    provider=provider,
                    model_name=model_name,
                    profile_type=AI_ASSISTANT_PROFILE_TYPE,
                    api_key=settings.api_key,
                    embedding_model=None,
                    compare_enabled=False,
                    extra_params=None,
                )
            )

        if provider_key and provider_key != "ollama" and settings.api_key:
            profiles = (
                db.query(ModelConfigProfile)
                .filter(
                    and_(
                        ModelConfigProfile.user_id == user_id,
                        ModelConfigProfile.project_id == settings.project_id,
                        ModelConfigProfile.profile_type == AI_ASSISTANT_PROFILE_TYPE,
                    )
                )
                .all()
            )
            for profile in profiles:
                if normalize_provider_for_connection_test(profile.provider) != provider_key:
                    continue
                if profile.model_name == model_name:
                    continue
                profile.api_key = settings.api_key
    except Exception as exc:
        logger.warning("Failed to upsert AI Assistant ModelConfigProfile: %s", exc)


def _resolve_assistant_api_key(
    db: Session,
    *,
    user_id: int,
    project_id: uuid.UUID,
    provider: str,
    settings_api_key: Optional[str],
    settings_provider: Optional[str],
) -> Optional[str]:
    return resolve_stored_provider_api_key(
        db,
        user_id=user_id,
        project_id=project_id,
        provider=provider,
        profile_type=AI_ASSISTANT_PROFILE_TYPE,
        settings_api_key=settings_api_key,
        settings_provider=settings_provider,
    )


def _session_out(row: AIAssistantSession) -> SessionOut:
    return SessionOut(
        id=str(row.id),
        title=row.title,
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


def _message_out(row: AIAssistantMessage) -> MessageOut:
    return MessageOut(
        id=str(row.id),
        role=row.role,
        content=row.content,
        tool_name=row.tool_name,
        created_at=row.created_at.isoformat() if row.created_at else None,
    )


def _get_session_for_user(
    db: Session,
    *,
    session_id: uuid.UUID,
    project: Project,
    user: User,
) -> AIAssistantSession:
    row = (
        db.query(AIAssistantSession)
        .filter(
            AIAssistantSession.id == session_id,
            AIAssistantSession.project_id == project.id,
            AIAssistantSession.user_id == user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return row


@router.get("/capabilities")
def get_capabilities(
    _user: User = Depends(get_current_user_required),
    _project: Project = Depends(require_project_permission("ai_assistant:use")),
):
    caps = set(collect_public_widget_capabilities() or [])
    return {
        "voice": "voice.stt" in caps or "voice.tts" in caps,
        "voice_stt": "voice.stt" in caps,
        "voice_tts": "voice.tts" in caps,
    }


@router.get("/settings", response_model=AiAssistantSettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:use")),
):
    row = db.query(AIAssistantSettings).filter(AIAssistantSettings.project_id == project.id).first()
    return _settings_out(row, db=db, user_id=user.id, project_id=project.id)


@router.put("/settings", response_model=AiAssistantSettingsOut)
def put_settings(
    body: AiAssistantSettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:settings")),
):
    row = db.query(AIAssistantSettings).filter(AIAssistantSettings.project_id == project.id).first()
    if not row:
        row = AIAssistantSettings(id=uuid.uuid4(), project_id=project.id, model_provider="openai")
        db.add(row)

    prev_provider = normalize_provider_for_connection_test(row.model_provider) or "openai"

    if body.model_provider is not None:
        row.model_provider = body.model_provider.strip().lower() or "openai"
    if body.chat_model is not None:
        row.chat_model = body.chat_model.strip() or None
    if body.base_url is not None:
        row.base_url = body.base_url.strip() or None
    if body.temperature is not None:
        row.temperature = body.temperature.strip() or None
    if body.max_tokens is not None:
        row.max_tokens = body.max_tokens
    if body.language is not None:
        row.language = _normalize_assistant_language(body.language)

    next_provider = normalize_provider_for_connection_test(row.model_provider) or "openai"
    provider_changed = next_provider != prev_provider

    plaintext_key: Optional[str] = None
    if body.api_key is not None:
        key = body.api_key.strip()
        if key and not is_masked_api_key(key):
            plaintext_key = key

    if plaintext_key:
        row.api_key = plaintext_key
        _upsert_ai_assistant_profile(db, user.id, row)
    elif provider_changed:
        # Load this provider's stored key (or clear) — never keep previous provider's secret.
        resolved = _resolve_assistant_api_key(
            db,
            user_id=user.id,
            project_id=project.id,
            provider=next_provider,
            settings_api_key=None,
            settings_provider=None,
        )
        row.api_key = resolved
    elif next_provider != "ollama" and not row.api_key:
        resolved = _resolve_assistant_api_key(
            db,
            user_id=user.id,
            project_id=project.id,
            provider=next_provider,
            settings_api_key=row.api_key,
            settings_provider=next_provider,
        )
        if resolved:
            row.api_key = resolved

    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _settings_out(row, db=db, user_id=user.id, project_id=project.id)


@router.post("/settings/test", response_model=TestConnectionOut)
def test_settings_connection(
    body: TestConnectionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:settings")),
):
    """Probe the AI Assistant provider using this module's settings only (never chatbot/search keys)."""
    from app.services.llmconn import LLMFactory

    row = db.query(AIAssistantSettings).filter(AIAssistantSettings.project_id == project.id).first()
    provider = normalize_provider_for_connection_test(
        (body.model_provider or (row.model_provider if row else None) or "openai")
    )
    chat_model = (body.chat_model or (row.chat_model if row else None) or "").strip()
    if not chat_model:
        return TestConnectionOut(ok=False, message="Chat model is required.")

    api_key = (body.api_key or "").strip()
    if not api_key or is_masked_api_key(api_key):
        api_key = (
            _resolve_assistant_api_key(
                db,
                user_id=user.id,
                project_id=project.id,
                provider=provider,
                settings_api_key=row.api_key if row else None,
                settings_provider=row.model_provider if row else None,
            )
            or ""
        )
    if provider != "ollama" and not api_key:
        return TestConnectionOut(ok=False, message="API key is required for this provider.")

    try:
        llm = LLMFactory.get_llm(
            provider=provider,
            model_name=chat_model,
            api_key=api_key or "ollama",
            allow_ollama_fallback=False,
            request_timeout=15.0,
        )
        reply = str(llm.complete("Reply with Yes."))
        return TestConnectionOut(ok=True, message=f"Connected. Model replied: {reply[:120]}")
    except Exception as exc:
        return TestConnectionOut(ok=False, message=str(exc)[:400])


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:use")),
    limit: int = Query(50, ge=1, le=200),
):
    rows = (
        db.query(AIAssistantSession)
        .filter(AIAssistantSession.project_id == project.id, AIAssistantSession.user_id == user.id)
        .order_by(AIAssistantSession.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [_session_out(r) for r in rows]


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:use")),
):
    title = (body.title or "New chat").strip() or "New chat"
    row = AIAssistantSession(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        title=title[:255],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _session_out(row)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def rename_session(
    session_id: uuid.UUID,
    body: SessionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:use")),
):
    row = _get_session_for_user(db, session_id=session_id, project=project, user=user)
    row.title = body.title.strip()[:255]
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _session_out(row)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:use")),
):
    row = _get_session_for_user(db, session_id=session_id, project=project, user=user)
    db.delete(row)
    db.commit()
    return None


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
def list_messages(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:use")),
):
    row = _get_session_for_user(db, session_id=session_id, project=project, user=user)
    messages = (
        db.query(AIAssistantMessage)
        .filter(AIAssistantMessage.session_id == row.id)
        .order_by(AIAssistantMessage.created_at.asc())
        .all()
    )
    return [_message_out(m) for m in messages if m.role in ("user", "assistant")]


@router.post("/sessions/{session_id}/chat")
def chat(
    session_id: uuid.UUID,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
    project: Project = Depends(require_project_permission("ai_assistant:use")),
):
    session = _get_session_for_user(db, session_id=session_id, project=project, user=user)
    settings = db.query(AIAssistantSettings).filter(AIAssistantSettings.project_id == project.id).first()
    if not settings or not settings.chat_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configure AI Assistant model settings before chatting.",
        )

    provider = normalize_provider_for_connection_test(settings.model_provider) or "openai"
    resolved = _resolve_assistant_api_key(
        db,
        user_id=user.id,
        project_id=project.id,
        provider=provider,
        settings_api_key=settings.api_key,
        settings_provider=settings.model_provider,
    )
    if resolved and resolved != settings.api_key:
        settings.api_key = resolved
        db.flush()

    user_msg = AIAssistantMessage(
        id=uuid.uuid4(),
        session_id=session.id,
        role="user",
        content=body.message.strip(),
    )
    db.add(user_msg)

    prior = (
        db.query(AIAssistantMessage)
        .filter(
            AIAssistantMessage.session_id == session.id,
            AIAssistantMessage.role.in_(("user", "assistant")),
            AIAssistantMessage.id != user_msg.id,
        )
        .order_by(AIAssistantMessage.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content or ""} for m in prior]

    if session.title in ("New chat", "New Chat") or not session.title:
        session.title = body.message.strip()[:80] or "New chat"
    session.updated_at = datetime.now(timezone.utc)
    db.commit()

    def event_stream() -> Iterator[bytes]:
        final_content = ""
        saw_done = False
        try:
            for event in run_assistant_turn(
                db,
                project_id=project.id,
                settings=settings,
                history=history,
                user_message=body.message.strip(),
            ):
                if event.get("type") == "tool":
                    tool_row = AIAssistantMessage(
                        id=uuid.uuid4(),
                        session_id=session.id,
                        role="tool",
                        content=json.dumps(event.get("result"), default=str)[:8000],
                        tool_name=event.get("name"),
                    )
                    db.add(tool_row)
                    db.flush()
                elif event.get("type") == "done":
                    final_content = event.get("content") or final_content
                    saw_done = True
                elif event.get("type") == "token" and not saw_done:
                    final_content += event.get("content") or ""
                elif event.get("type") == "error":
                    payload = json.dumps(event, ensure_ascii=False)
                    yield f"data: {payload}\n\n".encode("utf-8")
                    return
                payload = json.dumps(event, ensure_ascii=False)
                yield f"data: {payload}\n\n".encode("utf-8")

            assistant_msg = AIAssistantMessage(
                id=uuid.uuid4(),
                session_id=session.id,
                role="assistant",
                content=final_content,
            )
            db.add(assistant_msg)
            session.updated_at = datetime.now(timezone.utc)
            db.commit()
            yield f"data: {json.dumps({'type': 'message_id', 'id': str(assistant_msg.id)})}\n\n".encode("utf-8")
        except Exception as exc:
            logger.exception("AI Assistant stream failed")
            db.rollback()
            err = json.dumps({"type": "error", "message": str(exc)})
            yield f"data: {err}\n\n".encode("utf-8")

    return StreamingResponse(event_stream(), media_type="text/event-stream")
