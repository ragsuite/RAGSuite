"""Multi-provider embedder factory and per-model registry.

Resolves a project's chosen embedding model (saved in `SearchSettings` or
`ChatbotSettings`) into a llama-index embedding instance, with safe fallback to
the project default (Jina via Ollama). Instances are cached by (provider, model)
so repeated requests don't re-instantiate the embedder.

The registry documents each known model's parameters so ingest and query paths
can adapt automatically (chunk batch size, expected vector dimension, distance
metric for the Chroma collection, etc.).
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from ...defaults import DEFAULT_EMBEDDING_MODEL

logger = logging.getLogger(__name__)


JINA_FALLBACK_PROVIDER = "ollama"
JINA_FALLBACK_MODEL = DEFAULT_EMBEDDING_MODEL


@dataclass(frozen=True)
class EmbeddingModelMeta:
    """Static parameters for a known embedding model."""

    dim: int
    max_tokens: int
    batch: int
    metric: str
    normalize: bool
    needs_api_key: bool


EMBEDDING_REGISTRY: Dict[Tuple[str, str], EmbeddingModelMeta] = {
    ("ollama", "jina/jina-embeddings-v2-base-de"): EmbeddingModelMeta(
        dim=768, max_tokens=8192, batch=32, metric="cosine", normalize=True, needs_api_key=False,
    ),
    ("ollama", "jina/jina-embeddings-v2-base-en"): EmbeddingModelMeta(
        dim=768, max_tokens=8192, batch=32, metric="cosine", normalize=True, needs_api_key=False,
    ),
    ("ollama", "nomic-embed-text"): EmbeddingModelMeta(
        dim=768, max_tokens=8192, batch=32, metric="cosine", normalize=True, needs_api_key=False,
    ),
    ("ollama", "mxbai-embed-large"): EmbeddingModelMeta(
        dim=1024, max_tokens=512, batch=32, metric="cosine", normalize=True, needs_api_key=False,
    ),
    ("ollama", "all-minilm"): EmbeddingModelMeta(
        dim=384, max_tokens=256, batch=64, metric="cosine", normalize=True, needs_api_key=False,
    ),
    ("openai", "text-embedding-3-small"): EmbeddingModelMeta(
        dim=1536, max_tokens=8191, batch=100, metric="cosine", normalize=True, needs_api_key=True,
    ),
    ("openai", "text-embedding-3-large"): EmbeddingModelMeta(
        dim=3072, max_tokens=8191, batch=100, metric="cosine", normalize=True, needs_api_key=True,
    ),
    ("openai", "text-embedding-ada-002"): EmbeddingModelMeta(
        dim=1536, max_tokens=8191, batch=100, metric="cosine", normalize=True, needs_api_key=True,
    ),
    ("mistral", "mistral-embed"): EmbeddingModelMeta(
        # Free tier: keep batches small; token cap enforced in rag._embed_with_api_limits.
        dim=1024, max_tokens=8192, batch=8, metric="cosine", normalize=True, needs_api_key=True,
    ),
    ("gemini", "text-embedding-004"): EmbeddingModelMeta(
        dim=768, max_tokens=2048, batch=100, metric="cosine", normalize=True, needs_api_key=True,
    ),
    ("gemini", "models/embedding-001"): EmbeddingModelMeta(
        dim=768, max_tokens=2048, batch=100, metric="cosine", normalize=True, needs_api_key=True,
    ),
    ("gemini", "embedding-001"): EmbeddingModelMeta(
        dim=768, max_tokens=2048, batch=100, metric="cosine", normalize=True, needs_api_key=True,
    ),
    ("gemini", "gemini-embedding-001"): EmbeddingModelMeta(
        dim=3072, max_tokens=2048, batch=100, metric="cosine", normalize=True, needs_api_key=True,
    ),
}


_DEFAULT_META = EmbeddingModelMeta(
    dim=768, max_tokens=2048, batch=32, metric="cosine", normalize=True, needs_api_key=False,
)

# When provider is a remote API but the stored model id is missing or not ours (e.g. default
# Jina id left in DB), coerce to a known-good model instead of passing garbage to the vendor.
_HOSTED_PROVIDER_DEFAULT_MODEL: Dict[str, str] = {
    "openai": "text-embedding-3-large",
    "mistral": "mistral-embed",
    "gemini": "text-embedding-004",
}

# Model names that only make sense for local Ollama; must never be sent to OpenAI/Mistral/Gemini APIs.
_OLLAMA_ONLY_MODEL_IDS: frozenset[str] = frozenset(
    model for (prov, model) in EMBEDDING_REGISTRY if prov == "ollama"
)


def _is_ollama_only_model_id(model: str) -> bool:
    m = (model or "").strip()
    if not m:
        return False
    if m in _OLLAMA_ONLY_MODEL_IDS:
        return True
    # Catch Jina variants not yet in the registry (same class of bug as Mistral + jina/...).
    if m.startswith("jina/") or m.startswith("jinaai/"):
        return True
    return False


def _normalize_provider(provider: Optional[str]) -> str:
    """Normalize provider aliases to a canonical key used by the registry."""
    p = (provider or "").strip().lower()
    if not p:
        return ""
    if "google" in p or "gemini" in p:
        return "gemini"
    if "mistral" in p:
        return "mistral"
    if "openai" in p:
        return "openai"
    if "custom" in p or "ollama" in p:
        return "ollama"
    return p


def get_embedding_meta(provider: Optional[str], model: Optional[str]) -> EmbeddingModelMeta:
    """Look up registry metadata. Falls back to a conservative default when unknown."""
    key = (_normalize_provider(provider), (model or "").strip())
    return EMBEDDING_REGISTRY.get(key, _DEFAULT_META)


def is_known_model(provider: Optional[str], model: Optional[str]) -> bool:
    key = (_normalize_provider(provider), (model or "").strip())
    return key in EMBEDDING_REGISTRY


# ---- Embedder construction --------------------------------------------------

_embedder_cache_lock = threading.Lock()
_embedder_cache: Dict[Tuple[str, str, str], object] = {}


def _build_ollama_embedder(model: str):
    from llama_index.embeddings.ollama import OllamaEmbedding

    from ..infra_env import ollama_base_url

    base_url = ollama_base_url()
    meta = get_embedding_meta("ollama", model)
    return OllamaEmbedding(
        model_name=model,
        base_url=base_url,
        embed_batch_size=meta.batch,
        ollama_additional_kwargs={"keep_alive": "1h"},
    )


def _build_openai_embedder(model: str, api_key: Optional[str]):
    from llama_index.embeddings.openai import OpenAIEmbedding

    meta = get_embedding_meta("openai", model)
    kwargs: Dict[str, object] = {"model": model, "embed_batch_size": meta.batch}
    if api_key:
        kwargs["api_key"] = api_key
    return OpenAIEmbedding(**kwargs)


def _build_mistral_embedder(model: str, api_key: Optional[str]):
    from llama_index.embeddings.mistralai import MistralAIEmbedding

    meta = get_embedding_meta("mistral", model)
    kwargs: Dict[str, object] = {"model_name": model, "embed_batch_size": meta.batch}
    if api_key:
        kwargs["api_key"] = api_key
    return MistralAIEmbedding(**kwargs)


def _build_gemini_embedder(model: str, api_key: Optional[str]):
    from llama_index.embeddings.gemini import GeminiEmbedding

    meta = get_embedding_meta("gemini", model)
    kwargs: Dict[str, object] = {"model_name": model, "embed_batch_size": meta.batch}
    if api_key:
        kwargs["api_key"] = api_key
    return GeminiEmbedding(**kwargs)


def _build_fallback_embedder():
    logger.info(
        "Embedder factory: using Jina/Ollama fallback (%s/%s)",
        JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL,
    )
    return _build_ollama_embedder(JINA_FALLBACK_MODEL)


def _api_key_fingerprint(api_key: Optional[str]) -> str:
    """Short, non-reversible identifier for cache scoping (never logged)."""
    if not api_key:
        return "none"
    return hashlib.sha1(api_key.encode("utf-8")).hexdigest()[:12]


def get_raw_embedder(provider: Optional[str], model: Optional[str], api_key: Optional[str] = None):
    """Return a llama-index BaseEmbedding instance for the resolved provider+model.

    Always runs ``resolve_embedding`` first so hosted APIs never receive Ollama-only
    model ids (and vice versa the resolver rules stay centralized). Instances are
    cached by ``(provider, model, key_fingerprint)`` so two users on the same
    hosted provider with different API keys don't share an embedder instance.
    The fingerprint is a SHA-1 prefix of the API key, never the key itself.
    """
    p, m, k = resolve_embedding(provider, model, api_key)

    cache_key: Tuple[str, str, str] = (p, m, _api_key_fingerprint(k))
    with _embedder_cache_lock:
        cached = _embedder_cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            if p == "ollama":
                instance = _build_ollama_embedder(m)
            elif p == "openai":
                instance = _build_openai_embedder(m, k)
            elif p == "mistral":
                instance = _build_mistral_embedder(m, k)
            elif p == "gemini":
                instance = _build_gemini_embedder(m, k)
            else:
                instance = _build_fallback_embedder()
        except Exception as exc:
            logger.error(
                "Embedder factory: failed to build %s/%s (%s) — falling back to Jina/Ollama",
                p, m, exc,
            )
            instance = _build_fallback_embedder()
            cache_key = (JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, "none")
        _embedder_cache[cache_key] = instance
        return instance


# ---- Collection naming ------------------------------------------------------

DEFAULT_COLLECTION_NAME = "rag_collection"
"""Pre-existing single-collection name used when (provider, model) is the
project default. Keeping this collection for the default model preserves all
historic data without migration."""


def _sanitize_for_collection_name(value: str) -> str:
    """Chroma collection names are limited (3-63 chars, alphanumeric + _ -)."""
    cleaned = re.sub(r"[^a-z0-9_]+", "_", (value or "").lower()).strip("_")
    return cleaned or "x"


def collection_name_for(project_id: Optional[str], provider: Optional[str], model: Optional[str]) -> str:
    """Return the Chroma collection name a (project, provider, model) maps to.

    - The Jina/Ollama default keeps the legacy `rag_collection` (no migration).
    - Everything else gets a `proj_<id>__<provider>__<model>` collection so
      vector dimensions never collide.
    """
    p = _normalize_provider(provider)
    m = (model or "").strip()

    if not p or not m:
        return DEFAULT_COLLECTION_NAME
    if p == JINA_FALLBACK_PROVIDER and m == JINA_FALLBACK_MODEL:
        try:
            from ...settings import settings

            if not getattr(settings, "per_project_default_collection", False) or not project_id:
                return DEFAULT_COLLECTION_NAME
        except Exception:
            return DEFAULT_COLLECTION_NAME

    project_part = _sanitize_for_collection_name(str(project_id) if project_id else "shared")
    provider_part = _sanitize_for_collection_name(p)
    model_part = _sanitize_for_collection_name(m)

    raw = f"proj_{project_part}__{provider_part}__{model_part}"
    if len(raw) > 63:
        # Hash the model portion to fit Chroma's 63-char limit while staying deterministic.
        import hashlib

        digest = hashlib.sha1(model_part.encode("utf-8")).hexdigest()[:10]
        prefix = f"proj_{project_part}__{provider_part}__"
        raw = (prefix + digest)[:63]
    return raw


# ---- Resolution from settings ----------------------------------------------


def resolve_embedding(
    provider: Optional[str],
    model: Optional[str],
    api_key: Optional[str],
) -> Tuple[str, str, Optional[str]]:
    """Normalize a (provider, model, api_key) triple, applying the Jina fallback rule."""
    p = _normalize_provider(provider)
    m = (model or "").strip()

    if not p or not m:
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, None

    if p not in {"ollama", "openai", "mistral", "gemini"}:
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, None

    meta = EMBEDDING_REGISTRY.get((p, m))

    default_for_hosted = _HOSTED_PROVIDER_DEFAULT_MODEL.get(p)
    if (
        default_for_hosted is not None
        and meta is None
        and _is_ollama_only_model_id(m)
    ):
        if not api_key:
            logger.warning(
                "Embedding provider %s with local/Ollama model %r and no API key — using Jina/Ollama fallback",
                p,
                m,
            )
            return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, None
        logger.warning(
            "Embedding model %r is for local Ollama, not %s; using %s instead",
            m,
            p,
            default_for_hosted,
        )
        return p, default_for_hosted, api_key

    if meta and meta.needs_api_key and not api_key:
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, None

    return p, m, api_key


def clear_cache() -> None:
    """Test/debug helper to drop all cached embedders."""
    with _embedder_cache_lock:
        _embedder_cache.clear()


__all__ = [
    "EMBEDDING_REGISTRY",
    "EmbeddingModelMeta",
    "JINA_FALLBACK_PROVIDER",
    "JINA_FALLBACK_MODEL",
    "DEFAULT_COLLECTION_NAME",
    "collection_name_for",
    "get_embedding_meta",
    "get_raw_embedder",
    "is_known_model",
    "resolve_embedding",
    "clear_cache",
]
