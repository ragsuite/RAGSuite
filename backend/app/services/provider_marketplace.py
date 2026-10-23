"""Marketplace catalog: native six + OpenAI-compatible extras (RAGFlow factories)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from .provider_factories import (
    KIND_ORDER,
    convert_factories,
    merge_model_ids,
)

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "provider_marketplace.json"
NATIVE_ADAPTER = "native"
OPENAI_COMPATIBLE_ADAPTER = "openai_compatible"
NATIVE_IDS = ("openai", "azure_openai", "anthropic", "mistral", "gemini", "ollama")
HOSTED_IDS = ("openai", "azure_openai", "anthropic", "mistral", "gemini")
NATIVE_LABELS = {
    "openai": "OpenAI",
    "azure_openai": "Azure OpenAI",
    "anthropic": "Anthropic",
    "mistral": "Mistral",
    "gemini": "Google Gemini",
    "ollama": "Custom LLM / Ollama",
}


@lru_cache(maxsize=1)
def load_overlay() -> List[Dict[str, Any]]:
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return list(raw.get("providers") or [])


def _overlay_by_id() -> Dict[str, Dict[str, Any]]:
    return {str(row.get("id") or "").strip(): row for row in load_overlay() if row.get("id")}


def _merge_entry(base: Dict[str, Any], overlay: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    provider_id = str(base.get("id") or (overlay or {}).get("id") or "")
    merged: Dict[str, Any] = dict(base)
    if overlay:
        if overlay.get("label"):
            merged["label"] = overlay["label"]
        if overlay.get("default_base_url") and not merged.get("default_base_url"):
            merged["default_base_url"] = overlay["default_base_url"]
        if overlay.get("docs_url"):
            merged["docs_url"] = overlay["docs_url"]
        kinds = list(merged.get("kinds") or [])
        for kind in overlay.get("kinds") or []:
            if kind not in kinds:
                kinds.append(kind)
        merged["kinds"] = [k for k in KIND_ORDER if k in kinds]
        for kind in KIND_ORDER:
            key = f"{kind}_models"
            merged[key] = merge_model_ids(merged.get(key), overlay.get(key))
            if not merged[key]:
                merged.pop(key, None)
    if provider_id in NATIVE_IDS:
        merged["adapter"] = NATIVE_ADAPTER
        merged["label"] = NATIVE_LABELS.get(provider_id, merged.get("label") or provider_id)
        merged.pop("default_base_url", None)
    else:
        merged["adapter"] = OPENAI_COMPATIBLE_ADAPTER
    merged["id"] = provider_id
    return merged


@lru_cache(maxsize=1)
def load_catalog() -> List[Dict[str, Any]]:
    overlay = _overlay_by_id()
    converted = {str(row.get("id")): row for row in convert_factories() if row.get("id")}
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for native_id in NATIVE_IDS:
        base = converted.get(native_id) or {"id": native_id, "kinds": ["chat"]}
        out.append(_merge_entry(base, overlay.get(native_id)))
        seen.add(native_id)
    extras: List[Dict[str, Any]] = []
    for provider_id, row in converted.items():
        if provider_id in seen:
            continue
        extras.append(_merge_entry(row, overlay.get(provider_id)))
        seen.add(provider_id)
    for provider_id, row in overlay.items():
        if not provider_id or provider_id in seen:
            continue
        extras.append(_merge_entry({"id": provider_id, "kinds": row.get("kinds") or ["chat"]}, row))
        seen.add(provider_id)
    extras.sort(key=lambda row: str(row.get("label") or row.get("id") or "").lower())
    out.extend(extras)
    return out


def invalidate_catalog() -> None:
    load_catalog.cache_clear()
    load_overlay.cache_clear()
    convert_factories.cache_clear()


def catalog_entry(provider: Optional[str]) -> Optional[Dict[str, Any]]:
    key = (provider or "").strip().lower()
    if not key:
        return None
    if key.startswith("openai_compatible:") or key.startswith("openai_compatible_"):
        key = key.split(":", 1)[-1].split("_", 1)[-1] if ":" in key else key[len("openai_compatible_") :]
    for row in load_catalog():
        if str(row.get("id") or "").strip().lower() == key:
            return row
    return None


def catalog_id(provider: Optional[str]) -> str:
    entry = catalog_entry(provider)
    if entry:
        return str(entry["id"])
    return (provider or "").strip().lower()


def adapter_for(provider: Optional[str]) -> str:
    key = (provider or "").strip().lower()
    if key == OPENAI_COMPATIBLE_ADAPTER or key.startswith("openai_compatible"):
        return OPENAI_COMPATIBLE_ADAPTER
    entry = catalog_entry(key)
    if entry:
        return str(entry.get("adapter") or NATIVE_ADAPTER)
    if key in NATIVE_IDS:
        return NATIVE_ADAPTER
    return ""


def is_native(provider: Optional[str]) -> bool:
    return adapter_for(provider) == NATIVE_ADAPTER and catalog_id(provider) in NATIVE_IDS


def is_openai_compatible(provider: Optional[str]) -> bool:
    return adapter_for(provider) == OPENAI_COMPATIBLE_ADAPTER


def kinds_for(provider: Optional[str]) -> List[str]:
    entry = catalog_entry(provider)
    if entry:
        return [str(k) for k in (entry.get("kinds") or [])]
    key = catalog_id(provider)
    if key == "anthropic":
        return ["chat"]
    if key in NATIVE_IDS:
        return ["chat", "embedding"]
    return []


def is_chat_only(provider: Optional[str]) -> bool:
    kinds = kinds_for(provider)
    return "chat" in kinds and "embedding" not in kinds


def has_kind(provider: Optional[str], kind: str) -> bool:
    return kind in kinds_for(provider)


def default_base_url(provider: Optional[str]) -> Optional[str]:
    entry = catalog_entry(provider)
    url = str((entry or {}).get("default_base_url") or "").strip().rstrip("/")
    return url or None


def extra_providers() -> List[Dict[str, Any]]:
    return [row for row in load_catalog() if str(row.get("adapter")) == OPENAI_COMPATIBLE_ADAPTER]


def native_ids() -> tuple[str, ...]:
    return NATIVE_IDS


def hosted_ids() -> tuple[str, ...]:
    return HOSTED_IDS


def models_for(provider: Optional[str], kind: str) -> List[str]:
    entry = catalog_entry(provider)
    if not entry:
        return []
    return [str(m) for m in (entry.get(f"{kind}_models") or []) if str(m).strip()]
