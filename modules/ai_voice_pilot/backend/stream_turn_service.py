"""Streaming Voice Pilot turn: RAG token stream → sentence TTS → SSE events."""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Dict, Iterator, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from . import tts_elevenlabs
from .conversation_intent import resolve_casual_spoken_reply
from .providers import get_provider, normalize_provider
from .providers.custom_tts import CustomTtsError
from .settings_service import (
    active_provider,
    get_or_create_settings,
    resolve_api_key,
    resolve_selected_voice,
    resolve_voice_settings,
)
from .turn_service import (
    CLARIFY_SPOKEN,
    OOC_SPOKEN,
    is_fragmentary_transcript,
    load_turn_context,
    plain_text_for_speech,
    pop_speakable_chunks,
    resolve_spoken_answer,
)

logger = logging.getLogger(__name__)


def _sse(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _synthesize_b64_for_provider(
    *,
    provider: str,
    api_key: Optional[str],
    voice_id: str,
    text: str,
    voice_settings: Optional[Dict[str, Any]] = None,
    preferred_model_id: Optional[str] = None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (audio_b64, error_detail, model_id_used). Soft-fails so stream text can continue."""
    spoken = tts_elevenlabs.normalize_text_for_speech(text)
    if not spoken:
        return None, None, None
    impl = get_provider(provider)
    used_model: Optional[str] = None
    try:
        if provider == "custom":
            audio = impl.synthesize(
                text=spoken,
                voice_id=voice_id,
                voice_settings=voice_settings,
            )
        else:
            if not api_key:
                return None, "Add an ElevenLabs API key in Voice Pilot settings first", None
            if hasattr(impl, "synthesize_with_model"):
                audio, used_model = impl.synthesize_with_model(
                    text=spoken,
                    voice_id=voice_id,
                    voice_settings=voice_settings,
                    api_key=api_key,
                    preferred_model_id=preferred_model_id,
                )
            else:
                audio = impl.synthesize(
                    text=spoken,
                    voice_id=voice_id,
                    voice_settings=voice_settings,
                    api_key=api_key,
                    preferred_model_id=preferred_model_id,
                )
    except CustomTtsError as exc:
        logger.warning("Voice Pilot Custom stream TTS failed: %s", exc)
        return None, str(exc), None
    except tts_elevenlabs.ElevenLabsError as exc:
        logger.warning("Voice Pilot ElevenLabs stream TTS failed: %s", exc)
        return None, str(exc), None
    except Exception as exc:
        logger.warning("Voice Pilot stream TTS failed: %s", exc)
        return None, str(exc), None
    if not audio:
        return None, "Text-to-speech returned empty audio", None
    return base64.b64encode(audio).decode("ascii"), None, used_model


def iter_voice_pilot_turn_stream(
    *,
    db: Session,
    project_id: UUID,
    user_id: int,
    text: str,
    voice_id: Optional[str] = None,
    chat_history: Optional[list] = None,
    provider: Optional[str] = None,
) -> Iterator[str]:
    """
    Yield SSE lines:
      - sentence: {type, text, audio_b64?}
      - tts_warning: {type, message}  (once; does not abort answer text)
      - done: {type, answer}
      - error: {type, message}
    """
    from app.routes.rag import RAG_AVAILABLE, rag_pipeline

    query = (text or "").strip()
    if not query:
        yield _sse({"type": "error", "message": "Speech transcript is empty"})
        return

    row = get_or_create_settings(db, project_id)
    prov = normalize_provider(provider or active_provider(row))
    api_key = resolve_api_key(row) if prov == "elevenlabs" else None

    if prov == "elevenlabs" and not api_key:
        yield _sse(
            {
                "type": "error",
                "message": "Add an ElevenLabs API key in Voice Pilot settings first",
            }
        )
        return

    selected_id, _ = resolve_selected_voice(row, prov)
    resolved_voice = (voice_id or selected_id or "").strip()
    if not resolved_voice:
        yield _sse({"type": "error", "message": "Select a voice before speaking"})
        return

    voice_settings = resolve_voice_settings(row, resolved_voice, provider=prov)
    tts_warned = False
    # Lock ElevenLabs model for the whole turn so sentence chunks stay consistent.
    locked_model_id: Optional[str] = None

    def _speak(text_to_speak: str) -> Dict[str, Any]:
        nonlocal tts_warned, locked_model_id
        audio_b64, tts_err, used_model = _synthesize_b64_for_provider(
            provider=prov,
            api_key=api_key,
            voice_id=resolved_voice,
            text=text_to_speak,
            voice_settings=voice_settings,
            preferred_model_id=locked_model_id,
        )
        if used_model and not locked_model_id:
            locked_model_id = used_model
        evt: Dict[str, Any] = {"type": "sentence", "text": text_to_speak}
        if audio_b64:
            evt["audio_b64"] = audio_b64
        elif tts_err and not tts_warned:
            tts_warned = True
            evt["_tts_warning"] = tts_err
        return evt

    def _yield_sentence(evt: Dict[str, Any]) -> Iterator[str]:
        warn = evt.pop("_tts_warning", None)
        yield _sse(evt)
        if warn:
            yield _sse({"type": "tts_warning", "message": str(warn)})

    casual = resolve_casual_spoken_reply(query)
    if casual:
        yield from _yield_sentence(_speak(casual))
        yield _sse({"type": "done", "answer": casual})
        return

    if is_fragmentary_transcript(query):
        yield from _yield_sentence(_speak(CLARIFY_SPOKEN))
        yield _sse({"type": "done", "answer": CLARIFY_SPOKEN})
        return

    if not RAG_AVAILABLE or not rag_pipeline:
        yield _sse(
            {
                "type": "error",
                "message": "Knowledge engine is unavailable. Check server logs and try again.",
            }
        )
        return

    ctx = load_turn_context(db, project_id)
    buffer = ""
    full_parts: list[str] = []
    first_chunk_done = False

    history_payload = None
    if isinstance(chat_history, list) and chat_history:
        history_payload = []
        for item in chat_history[-8:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                history_payload.append({"role": role, "content": content[:4000]})

    try:
        stream = rag_pipeline.stream_query(
            user_query=query,
            top_k=5,
            user_id=user_id,
            project_id=ctx["project_id_str"],
            llm_config=ctx["llm_config"],
            system_prompt=ctx["system_prompt"],
            language_code=ctx["language"],
            mode="chat",
            format_type="html_short",
            embedding_provider=ctx["emb_provider"],
            embedding_model=ctx["emb_model"],
            embedding_api_key=ctx["emb_api_key"],
            chat_history=history_payload,
        )

        for delta, meta in stream:
            if meta is not None and meta.get("error"):
                yield _sse({"type": "error", "message": str(meta.get("error"))})
                return

            if delta and meta is None:
                full_parts.append(delta)
                buffer += delta
                chunks, buffer, first_chunk_done = pop_speakable_chunks(
                    buffer, first_chunk_done=first_chunk_done
                )
                for sentence in chunks:
                    spoken = plain_text_for_speech(sentence)
                    if not spoken:
                        continue
                    yield from _yield_sentence(_speak(spoken))
                    yield _sse(
                        {
                            "type": "partial",
                            "answer": plain_text_for_speech("".join(full_parts)),
                        }
                    )

            if meta is not None and meta.get("done"):
                remainder = plain_text_for_speech(buffer)
                if remainder:
                    yield from _yield_sentence(_speak(remainder))

                raw = "".join(full_parts).strip()
                if meta.get("full_text"):
                    raw = str(meta.get("full_text") or raw).strip()
                plain = plain_text_for_speech(raw)
                if not plain:
                    plain = OOC_SPOKEN
                final = resolve_spoken_answer(transcript=query, answer=plain)

                if final in (CLARIFY_SPOKEN, OOC_SPOKEN) and plain != final:
                    yield _sse({"type": "clear_audio"})
                    yield from _yield_sentence(_speak(final))

                yield _sse({"type": "done", "answer": final})
                return

    except Exception as exc:
        logger.error("Voice Pilot stream turn failed: %s", exc, exc_info=True)
        yield _sse(
            {
                "type": "error",
                "message": "Could not generate a spoken answer. Please try again.",
            }
        )
        return

    remainder = plain_text_for_speech(buffer)
    if remainder:
        yield from _yield_sentence(_speak(remainder))

    plain = plain_text_for_speech("".join(full_parts)) or CLARIFY_SPOKEN
    final = resolve_spoken_answer(transcript=query, answer=plain)
    yield _sse({"type": "done", "answer": final})


def voice_pilot_turn_stream_response(
    *,
    db: Session,
    project_id: UUID,
    user_id: int,
    text: str,
    voice_id: Optional[str] = None,
    chat_history: Optional[list] = None,
    provider: Optional[str] = None,
) -> Iterator[str]:
    yield from iter_voice_pilot_turn_stream(
        db=db,
        project_id=project_id,
        user_id=user_id,
        text=text,
        voice_id=voice_id,
        chat_history=chat_history,
        provider=provider,
    )
