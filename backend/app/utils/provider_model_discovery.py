"""Live provider model discovery for Chat/Search model pickers.

Failures always return [] so curated catalogs remain the safe baseline.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DISCOVERY_TIMEOUT_S = 10.0


def list_openai_chat_models_for_key(api_key: str) -> List[str]:
    key = (api_key or "").strip()
    if not key:
        return []
    try:
        import httpx

        response = httpx.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=_DISCOVERY_TIMEOUT_S,
        )
        if response.status_code >= 400:
            return []
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            return []
        out: List[str] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or "").strip()
            if not model_id or not _is_openai_chat_model_id(model_id):
                continue
            out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("OpenAI model list probe failed: %s", exc)
        return []


def _is_openai_chat_model_id(model_id: str) -> bool:
    lowered = model_id.lower()
    excluded_tokens = (
        "embedding",
        "whisper",
        "tts",
        "dall-e",
        "davinci",
        "babbage",
        "ada-",
        "realtime",
        "audio",
        "transcribe",
        "moderation",
        "image",
        "sora",
        "computer-use",
    )
    if any(token in lowered for token in excluded_tokens):
        return False
    return (
        lowered.startswith("gpt-")
        or lowered.startswith("o1")
        or lowered.startswith("o3")
        or lowered.startswith("o4")
        or lowered.startswith("chatgpt-")
        or "codex" in lowered
    )


def list_anthropic_chat_models_for_key(api_key: str) -> List[str]:
    key = (api_key or "").strip()
    if not key:
        return []
    try:
        import httpx

        response = httpx.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
            timeout=_DISCOVERY_TIMEOUT_S,
        )
        if response.status_code >= 400:
            return []
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            return []
        out: List[str] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or "").strip()
            if not model_id:
                continue
            if "claude" not in model_id.lower():
                continue
            out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("Anthropic model list probe failed: %s", exc)
        return []


def list_gemini_chat_models_for_key(api_key: str) -> List[str]:
    key = (api_key or "").strip()
    if not key:
        return []
    try:
        import httpx

        response = httpx.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": key},
            timeout=_DISCOVERY_TIMEOUT_S,
        )
        if response.status_code >= 400:
            return []
        payload = response.json()
        models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(models, list):
            return []
        out: List[str] = []
        for item in models:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            # API returns "models/gemini-2.5-flash"
            model_id = name.split("/", 1)[-1].strip()
            if not model_id or "embed" in model_id.lower():
                continue
            methods = item.get("supportedGenerationMethods") or item.get(
                "supported_generation_methods"
            )
            if isinstance(methods, list) and methods:
                method_set = {str(m).lower() for m in methods}
                if "generatecontent" not in method_set and "generate_content" not in method_set:
                    continue
            out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("Gemini model list probe failed: %s", exc)
        return []


def list_ollama_chat_models(base_url: Optional[str] = None) -> List[str]:
    try:
        import httpx
        from ..services.infra_env import ollama_base_url

        root = (base_url or ollama_base_url() or "").strip().rstrip("/")
        if not root:
            return []
        response = httpx.get(f"{root}/api/tags", timeout=_DISCOVERY_TIMEOUT_S)
        if response.status_code >= 400:
            return []
        payload = response.json()
        models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(models, list):
            return []
        out: List[str] = []
        for item in models:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("name") or item.get("model") or "").strip()
            if model_id:
                out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("Ollama model list probe failed: %s", exc)
        return []


def _is_azure_embedding_deployment(deployment_id: str, model_name: str) -> bool:
    blob = f"{deployment_id} {model_name}".lower()
    return "embed" in blob


# Data-plane list support varies by resource/API version; try a few when the preferred fails.
_AZURE_LIST_API_VERSION_FALLBACKS = (
    "2024-10-21",
    "2024-06-01",
    "2024-02-15",
    "2023-05-15",
    "2024-12-01-preview",
    "2024-10-01-preview",
)

_AZURE_LIST_UNSUPPORTED_HINT = (
    "Azure does not allow listing deployments with an API key on this resource "
    "(common for Foundry / Cognitive Services). Type the exact chat and embedding "
    "deployment names from Azure (e.g. gpt-4o, text-embedding-3-small), then Test connection."
)


def _azure_list_versions(preferred: Optional[str]) -> List[str]:
    from ..services.project_model_providers import azure_openai_api_version

    ordered: List[str] = []
    for version in (azure_openai_api_version(preferred), *_AZURE_LIST_API_VERSION_FALLBACKS):
        v = (version or "").strip()
        if v and v not in ordered:
            ordered.append(v)
    return ordered


def _parse_azure_deployments_payload(payload: Any) -> Dict[str, List[str]]:
    empty: Dict[str, List[str]] = {"chat": [], "embedding": []}
    if not isinstance(payload, dict):
        return empty
    data = payload.get("data")
    if not isinstance(data, list):
        # Some management-shaped payloads use "value"
        data = payload.get("value")
    if not isinstance(data, list):
        return empty
    chat: List[str] = []
    embedding: List[str] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        dep_id = str(
            item.get("id") or item.get("deployment_id") or item.get("name") or ""
        ).strip()
        # ARM ids look like .../deployments/gpt-4o — keep the last segment.
        if "/" in dep_id:
            dep_id = dep_id.rstrip("/").rsplit("/", 1)[-1]
        model_obj = item.get("model")
        if isinstance(model_obj, dict):
            model_name = str(model_obj.get("name") or "").strip()
        else:
            model_name = str(model_obj or "").strip()
        props = item.get("properties") if isinstance(item.get("properties"), dict) else {}
        if not model_name and isinstance(props, dict):
            nested = props.get("model")
            if isinstance(nested, dict):
                model_name = str(nested.get("name") or "").strip()
        if not dep_id:
            continue
        if _is_azure_embedding_deployment(dep_id, model_name):
            embedding.append(dep_id)
        else:
            chat.append(dep_id)
    return {"chat": sorted(set(chat)), "embedding": sorted(set(embedding))}


def list_azure_deployments(
    endpoint: str,
    api_key: str,
    api_version: Optional[str] = None,
) -> Dict[str, Any]:
    """List Azure OpenAI deployment names split into chat vs embedding.

    Returns ``{"chat": [...], "embedding": [...], "error": str|None}``.

    Modern Foundry / Cognitive Services resources often reject data-plane
    ``GET /openai/deployments`` (404). Callers should treat ``error`` as the
    user-facing reason when both lists are empty.
    """
    empty: Dict[str, Any] = {"chat": [], "embedding": [], "error": None}
    base = (endpoint or "").strip().rstrip("/")
    key = (api_key or "").strip()
    if not base or not key:
        empty["error"] = "Endpoint and API key are required to list Azure deployments."
        return empty

    # Normalize host-only base (strip accidental /models or completion paths).
    try:
        from urllib.parse import urlparse

        parsed = urlparse(base if "://" in base else f"https://{base}")
        if parsed.scheme and parsed.netloc:
            base = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    except Exception:
        pass

    try:
        import httpx

        url = f"{base}/openai/deployments"
        last_status: Optional[int] = None
        last_body = ""
        for version in _azure_list_versions(api_version):
            response = httpx.get(
                url,
                params={"api-version": version},
                headers={"api-key": key},
                timeout=_DISCOVERY_TIMEOUT_S,
            )
            if response.status_code >= 400:
                last_status = response.status_code
                last_body = (response.text or "")[:300]
                logger.debug(
                    "Azure deployments list failed: version=%s status=%s body=%s",
                    version,
                    response.status_code,
                    last_body[:200],
                )
                continue
            try:
                payload = response.json()
            except Exception:
                empty["error"] = "Azure returned a non-JSON response when listing deployments."
                return empty
            parsed = _parse_azure_deployments_payload(payload)
            if parsed["chat"] or parsed["embedding"]:
                return {**parsed, "error": None}
            # 200 with empty data — keep trying other versions, then report empty.
            last_status = response.status_code
            last_body = "empty deployment list"

        if last_status in (401, 403):
            empty["error"] = (
                f"Azure rejected the API key while listing deployments (HTTP {last_status}). "
                "Check that the key matches this endpoint."
            )
        elif last_status == 404 or (last_status and last_status >= 400):
            empty["error"] = _AZURE_LIST_UNSUPPORTED_HINT
            if last_status and last_status != 404:
                empty["error"] = (
                    f"Azure listing failed (HTTP {last_status}). {_AZURE_LIST_UNSUPPORTED_HINT}"
                )
        elif last_status == 200:
            empty["error"] = (
                "Azure returned no deployments for this resource. "
                "Confirm chat and embedding models are deployed, or type their names manually."
            )
        else:
            empty["error"] = _AZURE_LIST_UNSUPPORTED_HINT
        if last_body and last_status not in (404,) and last_status and last_status >= 400:
            logger.info(
                "Azure deployments list exhausted versions; last_status=%s body=%s",
                last_status,
                last_body[:200],
            )
        return empty
    except Exception as exc:
        logger.debug("Azure deployments list probe failed: %s", exc)
        empty["error"] = (
            f"Could not reach Azure to list deployments ({exc}). "
            "Type deployment names manually, then Test connection."
        )
        return empty


def list_live_chat_models_for_provider(
    provider: str,
    *,
    api_key: Optional[str] = None,
    ollama_base: Optional[str] = None,
    endpoint: Optional[str] = None,
    api_version: Optional[str] = None,
) -> List[str]:
    """Dispatch live chat model discovery for a normalized provider key."""
    from .api_key import normalize_provider_for_connection_test
    from .mistral_models import list_mistral_chat_models_for_key

    provider_key = normalize_provider_for_connection_test(provider)
    if provider_key == "azure_openai":
        return list_azure_deployments(endpoint or "", api_key or "", api_version).get("chat") or []
    if provider_key == "mistral":
        models = list_mistral_chat_models_for_key(api_key or "")
        return [m for m in models if m != "mistral-embed" and "embed" not in m.lower()]
    if provider_key == "openai":
        return list_openai_chat_models_for_key(api_key or "")
    if provider_key == "anthropic":
        return list_anthropic_chat_models_for_key(api_key or "")
    if provider_key == "gemini":
        return list_gemini_chat_models_for_key(api_key or "")
    if provider_key == "ollama":
        return list_ollama_chat_models(ollama_base)
    return []


def list_live_embedding_models_for_provider(
    provider: str,
    *,
    api_key: Optional[str] = None,
    endpoint: Optional[str] = None,
    api_version: Optional[str] = None,
) -> List[str]:
    from .api_key import normalize_provider_for_connection_test

    provider_key = normalize_provider_for_connection_test(provider)
    if provider_key == "azure_openai":
        return list_azure_deployments(endpoint or "", api_key or "", api_version).get("embedding") or []
    return []


def build_provider_enrichments(
    *,
    db: Any,
    user_id: int,
    project_id: Any,
    profile_type: str,
    settings_api_key: Optional[str] = None,
    settings_provider: Optional[str] = None,
    selected_chat: Optional[str] = None,
    selected_embedding: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Build enrichments map for ``build_available_providers_payload``.

    Uses stored provider keys (never requires client plaintext). Live probe
    failures leave that provider at curated-only.
    """
    from .api_key import (
        normalize_provider_for_connection_test,
        resolve_stored_provider_api_key,
    )

    providers = ("openai", "azure_openai", "anthropic", "mistral", "gemini", "ollama")
    active_provider = normalize_provider_for_connection_test(settings_provider)
    enrichments: Dict[str, Dict[str, Any]] = {}

    for provider_key in providers:
        api_key = resolve_stored_provider_api_key(
            db,
            user_id=user_id,
            project_id=project_id,
            provider=provider_key,
            profile_type=profile_type,
            settings_api_key=settings_api_key,
            settings_provider=settings_provider,
        )
        live_chat: List[str] = []
        live_embedding: List[str] = []
        try:
            if provider_key == "ollama":
                live_chat = list_live_chat_models_for_provider(provider_key)
            elif provider_key == "azure_openai" and api_key:
                from ..services.project_model_providers import (
                    azure_openai_api_version,
                    get_provider_config,
                    normalize_azure_api_version,
                )

                row = get_provider_config(db, project_id, "azure_openai")
                endpoint = (row.endpoint or "").strip().rstrip("/") if row else ""
                version = azure_openai_api_version(
                    normalize_azure_api_version(row.api_version if row else None)
                )
                if endpoint:
                    deps = list_azure_deployments(endpoint, api_key, version)
                    live_chat = deps.get("chat") or []
                    live_embedding = deps.get("embedding") or []
            elif api_key:
                live_chat = list_live_chat_models_for_provider(
                    provider_key, api_key=api_key
                )
        except Exception as exc:
            logger.debug("Live discovery failed for %s: %s", provider_key, exc)
            live_chat = []
            live_embedding = []

        entry: Dict[str, Any] = {
            "live_chat": live_chat,
            "live_embedding": live_embedding,
            "selected_chat": None,
            "selected_embedding": None,
        }
        if active_provider == provider_key:
            entry["selected_chat"] = (selected_chat or "").strip() or None
            entry["selected_embedding"] = (selected_embedding or "").strip() or None
        enrichments[provider_key] = entry

    return enrichments
