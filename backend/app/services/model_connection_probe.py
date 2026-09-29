"""Chat / embedding connection probes shared by model settings test endpoints."""
from __future__ import annotations

import asyncio
from typing import Dict, Optional

from ..utils.mistral_models import format_mistral_chat_test_failure

CHAT_TIMEOUT_S = 18
EMBED_TIMEOUT_S = 8
PROBE_REQUEST_TIMEOUT_S = 15.0


async def probe_chat_model(provider_key: str, model: Optional[str], api_key: Optional[str]) -> str:
    from .llmconn import LLMFactory

    def _run() -> str:
        llm = LLMFactory.get_llm(
            provider=provider_key,
            model_name=model,
            api_key=api_key,
            allow_ollama_fallback=False,
            request_timeout=PROBE_REQUEST_TIMEOUT_S,
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


async def probe_embedding_model(provider_key: str, model: Optional[str], api_key: Optional[str]) -> str:
    def _run() -> str:
        from .rag.embedder_factory import get_raw_embedder

        embedding = get_raw_embedder(provider_key, model, api_key).get_text_embedding("Hello")
        return f"Success: Vector of length {len(embedding)} generated"

    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(loop.run_in_executor(None, _run), timeout=EMBED_TIMEOUT_S)
    except asyncio.TimeoutError:
        return f"Failed: Timed out after {EMBED_TIMEOUT_S}s"
    except Exception as exc:
        return f"Failed: {str(exc)}"


async def probe_provider_models(
    provider_key: str,
    *,
    chat_model: Optional[str],
    embedding_model: Optional[str],
    api_key: Optional[str],
) -> Dict[str, str]:
    """Run chat then embedding probes sequentially.

    Parallel run_in_executor workers race on openai / llama-index lazy imports
    (importlib _ModuleLock on openai.resources.chat) and deadlock.
    """
    results: Dict[str, str] = {}
    if chat_model:
        results["chat_model"] = await probe_chat_model(provider_key, chat_model, api_key)
    if embedding_model:
        results["embedding_model"] = await probe_embedding_model(provider_key, embedding_model, api_key)
    return results


def is_probe_success(results: Dict[str, str]) -> bool:
    return bool(results) and all(str(v).startswith("Success") for v in results.values())
