"""Chat / embedding connection probes shared by model settings test endpoints."""
from __future__ import annotations

import asyncio
from typing import Dict, Mapping, Optional

from ..utils.mistral_models import format_mistral_chat_test_failure

CHAT_TIMEOUT_S = 18
EMBED_TIMEOUT_S = 8
PROBE_REQUEST_TIMEOUT_S = 15.0
CREDENTIALS_TIMEOUT_S = 15.0
EXTRA_PROBE_FIELDS = ("asr_model", "tts_model", "rerank_model", "ocr_model")
NO_MODEL_PROBE_FAILURE = "Failed: Select a model to test."


async def probe_chat_model(
    provider_key: str,
    model: Optional[str],
    api_key: Optional[str],
    *,
    endpoint: Optional[str] = None,
    api_version: Optional[str] = None,
) -> str:
    from .llmconn import LLMFactory

    def _run() -> str:
        llm = LLMFactory.get_llm(
            provider=provider_key,
            model_name=model,
            api_key=api_key,
            allow_ollama_fallback=False,
            request_timeout=PROBE_REQUEST_TIMEOUT_S,
            endpoint=endpoint,
            api_version=api_version,
        )
        return str(llm.complete("Reply with Yes."))

    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(loop.run_in_executor(None, _run), timeout=CHAT_TIMEOUT_S)
        return f"Success: {result}"
    except asyncio.TimeoutError:
        return f"Failed: Timed out after {CHAT_TIMEOUT_S}s"
    except Exception as exc:
        if provider_key == "mistral":
            return format_mistral_chat_test_failure(model or "", api_key or "", exc)
        return f"Failed: {str(exc)}"


async def probe_embedding_model(
    provider_key: str,
    model: Optional[str],
    api_key: Optional[str],
    *,
    endpoint: Optional[str] = None,
    api_version: Optional[str] = None,
) -> str:
    def _run() -> str:
        from .rag.embedder_factory import get_raw_embedder

        embedding = get_raw_embedder(
            provider_key, model, api_key, endpoint=endpoint, api_version=api_version
        ).get_text_embedding("Hello")
        return f"Success: Vector of length {len(embedding)} generated"

    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(loop.run_in_executor(None, _run), timeout=EMBED_TIMEOUT_S)
    except asyncio.TimeoutError:
        return f"Failed: Timed out after {EMBED_TIMEOUT_S}s"
    except Exception as exc:
        return f"Failed: {str(exc)}"


def collect_extra_models(
    extra_models: Optional[Mapping[str, Optional[str]]] = None,
    **fields: Optional[str],
) -> Dict[str, str]:
    """Non-empty ASR/TTS/rerank/OCR ids selected for an extra-only credentials probe."""
    merged: Dict[str, Optional[str]] = dict(extra_models or {})
    merged.update(fields)
    out: Dict[str, str] = {}
    for name in EXTRA_PROBE_FIELDS:
        value = str(merged.get(name) or "").strip()
        if value:
            out[name] = value
    return out


async def probe_compatible_credentials(
    api_key: Optional[str],
    *,
    endpoint: Optional[str],
) -> str:
    """GET {base}/models with Bearer auth. 401/403 fail; 2xx succeed.

    Used for extra-only OpenAI-compatible factories (OCR/ASR/TTS/rerank) that
    have no chat or embedding model to complete().
    """
    key = (api_key or "").strip()
    base = (endpoint or "").strip().rstrip("/")
    if not key:
        return "Failed: API key is required."
    if not base:
        return "Failed: Endpoint is required."
    try:
        import httpx

        async with httpx.AsyncClient(timeout=CREDENTIALS_TIMEOUT_S) as client:
            response = await client.get(
                f"{base}/models",
                headers={"Authorization": f"Bearer {key}"},
            )
        if response.status_code in (401, 403):
            reason = (response.reason_phrase or "Unauthorized").strip() or "Unauthorized"
            return f"Failed: {response.status_code} {reason}"
        if 200 <= response.status_code < 300:
            return "Success: Credentials accepted"
        return f"Failed: HTTP {response.status_code}"
    except Exception as exc:
        name = type(exc).__name__
        if "Timeout" in name or "timeout" in str(exc).lower():
            return f"Failed: Timed out after {int(CREDENTIALS_TIMEOUT_S)}s"
        return f"Failed: {str(exc)}"


async def probe_provider_models(
    provider_key: str,
    *,
    chat_model: Optional[str],
    embedding_model: Optional[str],
    api_key: Optional[str],
    endpoint: Optional[str] = None,
    api_version: Optional[str] = None,
    extra_models: Optional[Mapping[str, Optional[str]]] = None,
) -> Dict[str, str]:
    """Run chat then embedding probes sequentially.

    Parallel run_in_executor workers race on openai / llama-index lazy imports
    (importlib _ModuleLock on openai.resources.chat) and deadlock.

    Extra-only providers (no chat/embed) probe credentials via GET /models
    instead of native chat SDKs — ids like mistral_ocr must not hit Mistral chat.
    """
    results: Dict[str, str] = {}
    if chat_model:
        results["chat_model"] = await probe_chat_model(
            provider_key, chat_model, api_key, endpoint=endpoint, api_version=api_version
        )
    if embedding_model:
        results["embedding_model"] = await probe_embedding_model(
            provider_key, embedding_model, api_key, endpoint=endpoint, api_version=api_version
        )
    if results:
        return results
    extras = collect_extra_models(extra_models)
    if extras:
        from .provider_marketplace import default_base_url

        base = (endpoint or "").strip().rstrip("/") or (default_base_url(provider_key) or "")
        results["credentials"] = await probe_compatible_credentials(api_key, endpoint=base)
        return results
    return {"credentials": NO_MODEL_PROBE_FAILURE}


def is_probe_success(results: Dict[str, str]) -> bool:
    return bool(results) and all(str(v).startswith("Success") for v in results.values())
