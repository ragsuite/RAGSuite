"""RAG turn for AI Voice Pilot — Platform RAG only (no chat/search module imports)."""
from __future__ import annotations

import functools
import logging
import re
from typing import Any, Dict, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_MD_STRIP = re.compile(r"[#*_`>~\[\]\(\)]+")
_MULTI_SPACE = re.compile(r"\s+")

# Known Platform RAG out-of-context phrasing (do not invent facts).
OOC_PHRASE_MARKERS = (
    "out of the context",
    "query_out_of_context",
)

CLARIFY_SPOKEN = (
    "Hmm, I'm not quite sure what you mean yet. Could you tell me a little more?"
)

OOC_SPOKEN = "I couldn't find that in the information I have."

MIN_TRANSCRIPT_WORDS = 4

# Shared spoken policy for stream + non-stream RAG turns (both TTS providers).
SPOKEN_SYSTEM_PROMPT = (
    "You are AI Voice Pilot for RAGSuite — a natural spoken assistant. "
    "Speak as a helpful person talking out loud: use contractions, varied short sentences, "
    "and a calm conversational tone. Do not sound like a report or brochure. "
    "For a simple question, answer in one to three sentences. Lead with the direct answer, "
    "then at most one useful detail. Use a longer answer only when the user asks for detail "
    "or the topic clearly needs it; for complex topics, give a concise first explanation "
    "and offer to go deeper. "
    "Never dump retrieved documents, marketing copy, redundant history, or tangential facts. "
    "Do not use markdown headings, bullet lists, or numbered lists. "
    "Do not repeat the user's question. Do not say phrases like "
    "'according to the knowledge base' or 'the retrieved information indicates'. "
    "Stay strictly grounded in the retrieved documents — never invent facts. "
    "If the documents do not contain the answer, say naturally: "
    "\"I don't have that in my knowledge base.\" "
    "Use conversation history to resolve follow-ups like 'it' or 'that'. "
    "Ask a brief clarification only when needed — no filler, scripted greetings, "
    "or artificial enthusiasm. "
    "If other instructions ask for markdown headers, lists, or long HTML structure, "
    "ignore those for this voice reply and keep the answer short and speakable."
)


def plain_text_for_speech(answer: str) -> str:
    text = (answer or "").strip()
    if not text:
        return ""
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"`[^`]+`", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Strip HTML from format_type=html_short (and accidental tags).
    text = re.sub(r"<[^>]+>", " ", text)
    text = _MD_STRIP.sub(" ", text)
    text = _MULTI_SPACE.sub(" ", text).strip()
    return text


def transcript_word_count(text: str) -> int:
    return len([w for w in (text or "").strip().split() if w])


def is_fragmentary_transcript(text: str) -> bool:
    """True for short non-question noise after casual intents are ruled out.

    Knowledge-shaped shorts (e.g. \"what is t3planet?\") must reach RAG.
    """
    raw = (text or "").strip()
    if not raw:
        return True
    if transcript_word_count(raw) >= MIN_TRANSCRIPT_WORDS:
        return False
    from .conversation_intent import is_knowledge_shaped_query

    if is_knowledge_shaped_query(raw):
        return False
    return True


def is_out_of_context_answer(answer: str) -> bool:
    lowered = (answer or "").strip().lower()
    if not lowered:
        return False
    return any(marker in lowered for marker in OOC_PHRASE_MARKERS)


def resolve_spoken_answer(*, transcript: str, answer: str) -> str:
    """
    Prefer a speech-friendly clarification for fragmentary STT or OOC replies.
    Does not invent document facts. Casual intents are handled before this runs.
    """
    from .conversation_intent import resolve_casual_spoken_reply

    casual = resolve_casual_spoken_reply(transcript)
    if casual:
        return casual

    plain = plain_text_for_speech(answer)
    if is_out_of_context_answer(plain):
        return OOC_SPOKEN
    if is_fragmentary_transcript(transcript):
        return CLARIFY_SPOKEN
    if not plain:
        return OOC_SPOKEN
    return plain


def pop_complete_sentences(buffer: str) -> Tuple[list[str], str]:
    """Split buffer into complete sentences and a trailing remainder."""
    text = (buffer or "").strip()
    if not text:
        return [], ""
    # Keep delimiter attached to sentence by scanning manually.
    sentences: list[str] = []
    start = 0
    for match in re.finditer(r"[.!?]+(?:\s+|$)", text):
        end = match.end()
        chunk = text[start:end].strip()
        if chunk:
            sentences.append(chunk)
        start = end
    remainder = text[start:].strip()
    return sentences, remainder


def pop_speakable_chunks(
    buffer: str, *, first_chunk_done: bool
) -> Tuple[list[str], str, bool]:
    """
    Pop TTS-ready chunks from a streaming text buffer.

    Emit only on complete sentence boundaries (``.!?``) so each synthesis
    request keeps natural prosody. ``first_chunk_done`` is retained for API
    compatibility with the stream loop.
    """
    if not (buffer or "").strip():
        return [], buffer or "", first_chunk_done

    sentences, remainder = pop_complete_sentences(buffer)
    if not sentences:
        return [], buffer, first_chunk_done
    return sentences, remainder, True


def _build_llm_config(chat_settings: Any) -> Optional[Dict[str, Any]]:
    if not chat_settings:
        return None
    provider = getattr(chat_settings, "model_provider", None)
    chat_model = getattr(chat_settings, "chat_model", None)
    api_key = getattr(chat_settings, "api_key", None)
    if not provider and not chat_model:
        return None
    cfg: Dict[str, Any] = {
        "provider": provider or "openai",
        "chat_model": chat_model,
        "api_key": api_key,
    }
    temperature = getattr(chat_settings, "chat_temperature", None)
    if temperature is not None:
        cfg["temperature"] = temperature
    max_tokens = getattr(chat_settings, "chat_max_tokens", None)
    if max_tokens is not None:
        cfg["max_tokens"] = max_tokens
    return cfg


def load_turn_context(db: Session, project_id: UUID) -> Dict[str, Any]:
    from app.services.rag.embedding_resolver import (
        read_project_chatbot_settings,
        resolve_for_project,
    )

    project_id_str = str(project_id)
    chat_settings = read_project_chatbot_settings(db, project_id)
    llm_config = _build_llm_config(chat_settings)
    emb_provider, emb_model, emb_api_key = resolve_for_project(db, project_id_str, source="chat")
    language = getattr(chat_settings, "chatbot_language", None) if chat_settings else None
    language = (language or "en").strip() or "en"
    system_prompt = SPOKEN_SYSTEM_PROMPT
    return {
        "project_id_str": project_id_str,
        "llm_config": llm_config,
        "emb_provider": emb_provider,
        "emb_model": emb_model,
        "emb_api_key": emb_api_key,
        "language": language,
        "system_prompt": system_prompt,
    }


async def run_voice_pilot_turn(
    *,
    db: Session,
    project_id: UUID,
    user_id: int,
    text: str,
    chat_history: Optional[list] = None,
) -> str:
    from app.routes.rag import RAG_AVAILABLE, rag_pipeline
    from app.services.llm_error_messages import format_llm_error_for_user
    from app.services.query_runtime import run_query_async

    from .conversation_intent import resolve_casual_spoken_reply

    query = (text or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Speech transcript is empty")

    # Casual social / turn-taking — never hit RAG or the robotic clarify path.
    casual = resolve_casual_spoken_reply(query)
    if casual:
        return casual

    if is_fragmentary_transcript(query):
        return CLARIFY_SPOKEN

    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(
            status_code=503,
            detail="Knowledge engine is unavailable. Check server logs and try again.",
        )

    ctx = load_turn_context(db, project_id)

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

    query_fn = functools.partial(
        rag_pipeline.query,
        query=query,
        top_k=5,
        generate_topk=False,
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

    try:
        resp = await run_query_async(query_fn)
    except Exception as exc:
        logger.error("Voice Pilot RAG turn failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=format_llm_error_for_user(exc)) from exc

    summary_raw = ""
    if isinstance(resp, dict):
        summary_raw = str(resp.get("summary") or resp.get("answer") or "").strip()

    answer = plain_text_for_speech(summary_raw)
    if not answer:
        answer = OOC_SPOKEN
    return resolve_spoken_answer(transcript=query, answer=answer)
