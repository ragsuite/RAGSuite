"""Resolve optional ASR / TTS / rerank / OCR models from a project provider row.

Empty fields mean RAGSuite native (browser speech, BGE rerank, Docling OCR off).
Provider keys never leave this module.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy.orm import Session

from ..models import ChatbotSettings, ProjectModelProvider, SearchSettings
from .project_model_providers import (
    get_provider_config,
    has_usable_key,
    normalize_provider,
    resolve_provider_endpoint,
)
from .provider_marketplace import default_base_url

logger = logging.getLogger(__name__)

KIND_TO_FIELD = {
    "asr": "asr_model",
    "tts": "tts_model",
    "rerank": "rerank_model",
    "ocr": "ocr_model",
}


@dataclass(frozen=True)
class ExtraModelRef:
    provider: str
    model: str
    api_key: str
    endpoint: Optional[str]
    kind: str


def _project_uuid(project_id: Any) -> Optional[uuid.UUID]:
    if isinstance(project_id, uuid.UUID):
        return project_id
    try:
        return uuid.UUID(str(project_id))
    except (TypeError, ValueError):
        return None


def configured_ocr_options(db: Session, project_id: Any) -> List[Dict[str, str]]:
    pid = _project_uuid(project_id)
    if pid is None:
        return []
    rows = db.query(ProjectModelProvider).filter(ProjectModelProvider.project_id == pid).all()
    options: List[Dict[str, str]] = []
    for row in rows:
        model = (row.ocr_model or "").strip()
        if not model:
            continue
        if row.provider != "ollama" and not has_usable_key(row):
            continue
        options.append({"provider": row.provider, "model": model, "value": f"{row.provider}:{model}"})
    return options


def resolve_extra_model(
    db: Session,
    project_id: Any,
    kind: str,
    preferred_provider: Optional[str] = None,
) -> Optional[ExtraModelRef]:
    field = KIND_TO_FIELD.get(kind)
    if not field:
        return None
    pid = _project_uuid(project_id)
    if pid is None:
        return None
    providers: List[str] = []
    if preferred_provider:
        try:
            providers.append(normalize_provider(preferred_provider))
        except Exception:
            raw = (preferred_provider or "").strip().lower()
            if raw:
                providers.append(raw)
    for provider in providers:
        row = get_provider_config(db, pid, provider)
        model = (getattr(row, field, None) or "").strip() if row else ""
        if not row or not model:
            continue
        if row.provider != "ollama" and not has_usable_key(row):
            continue
        endpoint = resolve_provider_endpoint(db, pid, provider) or default_base_url(provider)
        return ExtraModelRef(
            provider=provider,
            model=model,
            api_key=(row.api_key or "").strip(),
            endpoint=endpoint,
            kind=kind,
        )
    return None


def widget_model_provider(db: Session, project_id: Any, surface: str = "chat") -> Optional[str]:
    pid = _project_uuid(project_id)
    if pid is None:
        return None
    model = ChatbotSettings if surface != "search" else SearchSettings
    row = db.query(model).filter(model.project_id == pid).first()
    return (row.model_provider or "").strip() or None if row else None


def extra_rerank_scores(
    project_id: Any,
    collection_name: Optional[str],
    query: str,
    documents: List[str],
) -> Optional[List[float]]:
    """None means 'use native BGE'. Empty list means nothing to score."""
    if not documents or not project_id:
        return None
    try:
        from app.db import SessionLocal
    except Exception:
        return None
    db = SessionLocal()
    try:
        chat_provider = widget_model_provider(db, project_id, "chat")
        search_provider = widget_model_provider(db, project_id, "search")
        preferred = provider_from_collection(
            collection_name, [p for p in (chat_provider, search_provider) if p]
        ) or chat_provider or search_provider
        ref = resolve_extra_model(db, project_id, "rerank", preferred)
        if ref is None:
            return None
        return provider_rerank_scores(ref, query, documents)
    except Exception as exc:
        logger.warning("Provider rerank resolve failed: %s", exc)
        return None
    finally:
        db.close()


def provider_from_collection(collection_name: Optional[str], candidates: Sequence[str]) -> Optional[str]:
    text = (collection_name or "").lower()
    if not text:
        return None
    for provider in candidates:
        key = (provider or "").strip().lower()
        if key and key in text:
            return key
    return None


def _http_json(method: str, url: str, *, headers: Dict[str, str], json_body: Dict[str, Any], timeout: float = 30.0) -> Any:
    import httpx

    response = httpx.request(method, url, headers=headers, json=json_body, timeout=timeout)
    response.raise_for_status()
    return response.json()


def provider_rerank_scores(ref: ExtraModelRef, query: str, documents: List[str]) -> Optional[List[float]]:
    """Return relevance scores aligned with ``documents``, or None to use native BGE."""
    if not documents:
        return []
    headers = {"Authorization": f"Bearer {ref.api_key}", "Content-Type": "application/json"}
    try:
        if ref.provider == "cohere" or "cohere" in (ref.endpoint or ""):
            payload = _http_json(
                "POST",
                "https://api.cohere.com/v2/rerank",
                headers=headers,
                json_body={"model": ref.model, "query": query, "documents": documents},
            )
            results = payload.get("results") if isinstance(payload, dict) else None
            return _scores_from_ranked_results(results, len(documents))
        base = (ref.endpoint or default_base_url(ref.provider) or "").rstrip("/")
        if not base:
            return None
        payload = _http_json(
            "POST",
            f"{base}/rerank",
            headers=headers,
            json_body={"model": ref.model, "query": query, "documents": documents},
        )
        results = payload.get("results") if isinstance(payload, dict) else payload
        return _scores_from_ranked_results(results, len(documents))
    except Exception as exc:
        logger.warning("Provider rerank failed (%s/%s): %s", ref.provider, ref.model, exc)
        return None


def _scores_from_ranked_results(results: Any, n: int) -> Optional[List[float]]:
    if not isinstance(results, list) or not results:
        return None
    scores = [0.0] * n
    filled = False
    for item in results:
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        score = item.get("relevance_score", item.get("score"))
        if index is None or score is None:
            continue
        try:
            idx = int(index)
            if 0 <= idx < n:
                scores[idx] = float(score)
                filled = True
        except (TypeError, ValueError):
            continue
    return scores if filled else None


def synthesize_speech(ref: ExtraModelRef, text: str, *, voice: str = "alloy") -> Optional[bytes]:
    import httpx

    base = (ref.endpoint or default_base_url(ref.provider) or "https://api.openai.com/v1").rstrip("/")
    if base.endswith("/v1"):
        url = f"{base}/audio/speech"
    else:
        url = f"{base}/v1/audio/speech"
    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {ref.api_key}"},
            json={"model": ref.model, "input": text, "voice": voice},
            timeout=60.0,
        )
        response.raise_for_status()
        return response.content
    except Exception as exc:
        logger.warning("Provider TTS failed (%s/%s): %s", ref.provider, ref.model, exc)
        return None


def transcribe_audio(ref: ExtraModelRef, audio: bytes, filename: str = "speech.webm") -> Optional[str]:
    import httpx

    base = (ref.endpoint or default_base_url(ref.provider) or "https://api.openai.com/v1").rstrip("/")
    if base.endswith("/v1"):
        url = f"{base}/audio/transcriptions"
    else:
        url = f"{base}/v1/audio/transcriptions"
    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {ref.api_key}"},
            files={"file": (filename, audio, "application/octet-stream")},
            data={"model": ref.model},
            timeout=60.0,
        )
        response.raise_for_status()
        payload = response.json()
        text = payload.get("text") if isinstance(payload, dict) else None
        return str(text).strip() if text else None
    except Exception as exc:
        logger.warning("Provider ASR failed (%s/%s): %s", ref.provider, ref.model, exc)
        return None
