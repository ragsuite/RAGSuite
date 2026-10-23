"""Convert RAGFlow-style llm_factories into the Model Configuration catalog.

Bundled snapshot is the offline baseline. A fail-soft HTTP refresh merges newer
factory ids into memory (and a writable synced file when possible). Saved project
selections are never auto-changed.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
BUNDLED_FACTORIES_PATH = DATA_DIR / "llm_factories.json"
SYNCED_FACTORIES_PATH = DATA_DIR / "llm_factories.synced.json"
FACTORIES_URL = "https://raw.githubusercontent.com/infiniflow/ragflow/main/conf/llm_factories.json"

KIND_ORDER = ("chat", "embedding", "asr", "rerank", "tts", "ocr")
KIND_FROM_MODEL_TYPE = {
    "chat": "chat",
    "embedding": "embedding",
    "speech2text": "asr",
    "tts": "tts",
    "rerank": "rerank",
    "ocr": "ocr",
}
KIND_FROM_TAG = {
    "llm": "chat",
    "text embedding": "embedding",
    "speech2text": "asr",
    "tts": "tts",
    "text re-rank": "rerank",
    "re-rank": "rerank",
    "ocr": "ocr",
}
SKIP_FACTORIES = frozenset({"builtin", "google_cloud"})
# Stable ids for providers already saved in project_model_providers.
FACTORY_ID_ALIASES = {
    "openai": "openai",
    "azure-openai": "azure_openai",
    "azure_openai": "azure_openai",
    "anthropic": "anthropic",
    "mistral": "mistral",
    "gemini": "gemini",
    "google_gemini": "gemini",
    "google-gemini": "gemini",
    "ollama": "ollama",
    "togetherai": "together",
    "together": "together",
    "huggingface": "huggingface",
    "xai": "xai",
    "deepseek": "deepseek",
    "openrouter": "openrouter",
    "nvidia": "nvidia",
    "groq": "groq",
    "cohere": "cohere",
    "moonshot": "moonshot",
    "zhipu-ai": "zhipu",
    "zhipu": "zhipu",
    "tongyi-qianwen": "tongyi",
}
DOCS_URLS = {
    "openai": "https://platform.openai.com/docs",
    "azure_openai": "https://learn.microsoft.com/azure/ai-foundry/openai/",
    "anthropic": "https://docs.anthropic.com",
    "mistral": "https://docs.mistral.ai",
    "gemini": "https://ai.google.dev/gemini-api/docs",
    "ollama": "https://github.com/ollama/ollama",
    "groq": "https://console.groq.com/docs",
    "together": "https://docs.together.ai",
    "deepseek": "https://api-docs.deepseek.com",
    "openrouter": "https://openrouter.ai/docs",
    "cohere": "https://docs.cohere.com",
    "huggingface": "https://huggingface.co/docs/inference-providers",
    "xai": "https://docs.x.ai",
    "nvidia": "https://build.nvidia.com",
    "moonshot": "https://platform.moonshot.cn/docs",
}

_lock = threading.Lock()
_runtime_factories: Optional[Dict[str, Any]] = None


def _slug(name: str) -> str:
    text = (name or "").strip().lower().replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")[:50]


def factory_id(name: str) -> str:
    slug = _slug(name)
    return FACTORY_ID_ALIASES.get(slug, slug)


def _as_kind_list(raw: Any) -> List[str]:
    if isinstance(raw, list):
        values = [str(item).strip().lower() for item in raw]
    else:
        values = [str(raw or "").strip().lower()]
    kinds: List[str] = []
    for value in values:
        kind = KIND_FROM_MODEL_TYPE.get(value)
        if kind and kind not in kinds:
            kinds.append(kind)
    return kinds


def _kinds_from_tags(tags: str) -> List[str]:
    kinds: List[str] = []
    for part in str(tags or "").split(","):
        kind = KIND_FROM_TAG.get(part.strip().lower())
        if kind and kind not in kinds:
            kinds.append(kind)
    return kinds


def _ordered_kinds(kinds: Iterable[str]) -> List[str]:
    seen = {str(k) for k in kinds if str(k) in KIND_ORDER}
    return [k for k in KIND_ORDER if k in seen]


def _model_bucket(kind: str) -> str:
    return f"{kind}_models"


def convert_factory(factory: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    name = str(factory.get("name") or "").strip()
    if not name or factory_id(name) in SKIP_FACTORIES:
        return None
    provider_id = factory_id(name)
    if not provider_id:
        return None
    buckets: Dict[str, List[str]] = {f"{kind}_models": [] for kind in KIND_ORDER}
    kinds_from_models: List[str] = []
    for llm in factory.get("llm") or []:
        if not isinstance(llm, dict):
            continue
        model_id = str(llm.get("llm_name") or "").strip()
        if not model_id:
            continue
        for kind in _as_kind_list(llm.get("model_type")):
            bucket = buckets[_model_bucket(kind)]
            if model_id not in bucket:
                bucket.append(model_id)
            if kind not in kinds_from_models:
                kinds_from_models.append(kind)
    kinds = _ordered_kinds(kinds_from_models or _kinds_from_tags(str(factory.get("tags") or "")))
    if not kinds:
        return None
    url = str(factory.get("url") or "").strip().rstrip("/")
    entry: Dict[str, Any] = {
        "id": provider_id,
        "label": name,
        "adapter": "openai_compatible",
        "kinds": kinds,
        "factory_name": name,
    }
    if url:
        entry["default_base_url"] = url
    docs = DOCS_URLS.get(provider_id)
    if docs:
        entry["docs_url"] = docs
    for kind in KIND_ORDER:
        models = buckets[_model_bucket(kind)]
        if models:
            entry[_model_bucket(kind)] = models
    return entry


def load_factories_document() -> Dict[str, Any]:
    with _lock:
        if _runtime_factories is not None:
            return _runtime_factories
    for path in (SYNCED_FACTORIES_PATH, BUNDLED_FACTORIES_PATH):
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Could not read factories snapshot %s: %s", path, exc)
            continue
        if isinstance(data, dict) and isinstance(data.get("factory_llm_infos"), list):
            return data
    return {"factory_llm_infos": []}


def _set_runtime_factories(data: Dict[str, Any]) -> None:
    global _runtime_factories
    with _lock:
        _runtime_factories = data
    convert_factories.cache_clear()


@lru_cache(maxsize=1)
def convert_factories() -> List[Dict[str, Any]]:
    data = load_factories_document()
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for factory in data.get("factory_llm_infos") or []:
        if not isinstance(factory, dict):
            continue
        entry = convert_factory(factory)
        if not entry or entry["id"] in seen:
            continue
        seen.add(entry["id"])
        out.append(entry)
    return out


def refresh_factories(*, timeout: float = 8.0) -> bool:
    """Fetch the public factories list. Fail-soft; never raises to the caller."""
    try:
        import urllib.request

        request = urllib.request.Request(FACTORIES_URL, headers={"User-Agent": "RAGSuite/1.0"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
        data = json.loads(raw)
        if not isinstance(data, dict) or not isinstance(data.get("factory_llm_infos"), list):
            return False
        try:
            SYNCED_FACTORIES_PATH.write_bytes(raw)
        except OSError:
            logger.info("Factories snapshot is not writable; keeping in-memory catalog")
        _set_runtime_factories(data)
        try:
            from .provider_marketplace import invalidate_catalog

            invalidate_catalog()
        except Exception:
            convert_factories.cache_clear()
        logger.info("Provider factories refreshed (%s entries)", len(data["factory_llm_infos"]))
        return True
    except Exception as exc:
        logger.info("Provider factories refresh skipped: %s", exc)
        return False


def schedule_factories_refresh() -> None:
    thread = threading.Thread(target=refresh_factories, name="provider-factories-refresh", daemon=True)
    thread.start()


def classify_live_model_id(model_id: str) -> str:
    lowered = (model_id or "").strip().lower()
    if not lowered:
        return "chat"
    if any(token in lowered for token in ("rerank", "reranker", "colbert")):
        return "rerank"
    if "ocr" in lowered:
        return "ocr"
    if any(token in lowered for token in ("whisper", "speech2text", "speech-to-text", "transcribe", "stt")):
        return "asr"
    if any(token in lowered for token in ("tts", "speech-synthesis", "audio-speech")):
        return "tts"
    if "embed" in lowered:
        return "embedding"
    return "chat"


def merge_model_ids(*groups: Optional[Sequence[str]]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for group in groups:
        for raw in group or []:
            value = str(raw or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            out.append(value)
    return out
