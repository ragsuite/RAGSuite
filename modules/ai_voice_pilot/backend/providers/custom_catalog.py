"""Custom voice catalog — live edge-tts, bundled snapshot, curated overlays."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent / "data"
_OVERLAY_PATH = _DATA_DIR / "custom_voices.json"
_SNAPSHOT_PATH = _DATA_DIR / "custom_voices_catalog.json"
_PREVIEW_URLS_PATH = _DATA_DIR / "custom_voice_preview_urls.json"
_CACHE_TTL_S = 3600.0
_LIVE_FETCH_TIMEOUT_S = 12.0
# "Microsoft Adri Online (Natural) - Afrikaans (South Africa)" → "Adri"
_FRIENDLY_PERSON = re.compile(
    r"^Microsoft\s+(.+?)\s+Online\s+\(Natural\)(?:\s+-\s+.+)?$",
    re.IGNORECASE,
)

VALID_GENDERS = frozenset({"male", "female", "neutral"})

_cache_voices: Optional[Tuple[Dict[str, Any], ...]] = None
_cache_expires_at = 0.0
_thread_lock = threading.Lock()
_preview_urls_by_engine: Optional[Dict[str, str]] = None


def _load_preview_urls() -> Dict[str, str]:
    """Azure/speechsynthesis Style Sample (General) WAV URLs by engine_voice."""
    global _preview_urls_by_engine
    if _preview_urls_by_engine is not None:
        return _preview_urls_by_engine
    out: Dict[str, str] = {}
    if _PREVIEW_URLS_PATH.is_file():
        try:
            raw = json.loads(_PREVIEW_URLS_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("Failed to load %s: %s", _PREVIEW_URLS_PATH.name, exc)
            raw = None
        if isinstance(raw, dict):
            for key, val in raw.items():
                engine = str(key or "").strip()
                url = str(val or "").strip()
                if engine and url:
                    out[engine] = url
    _preview_urls_by_engine = out
    return out


def _attach_preview_url(voice: Dict[str, Any]) -> Dict[str, Any]:
    engine = str(voice.get("engine_voice") or "").strip()
    voice["preview_url"] = preview_url_for_engine(engine)
    return voice


def preview_url_for_engine(engine_voice: str) -> Optional[str]:
    """Return speechsynthesis/Azure General sample WAV URL for an edge-tts ShortName."""
    engine = (engine_voice or "").strip()
    if not engine:
        return None
    return _load_preview_urls().get(engine)


def _normalize_gender(raw: Any) -> str:
    g = str(raw or "").strip().lower()
    if g in ("male", "m", "man"):
        return "male"
    if g in ("female", "f", "woman"):
        return "female"
    return "neutral"


def _slug_engine(engine: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (engine or "").strip().lower()).strip("-")


def _voice_id_for_engine(engine: str) -> str:
    slug = _slug_engine(engine)
    return f"custom-{slug}" if slug else "custom-unknown"


def _display_name(friendly: str, short_name: str) -> str:
    name = (friendly or "").strip()
    if name:
        match = _FRIENDLY_PERSON.match(name)
        if match:
            person = match.group(1).strip()
            if person and len(person) < 40:
                return person
        # Prefer short person name before locale: "Adri - Afrikaans..." → "Adri"
        if " - " in name:
            head = name.split(" - ", 1)[0].strip()
            if head and len(head) < 40 and not head.lower().startswith("microsoft"):
                return head
    # Fallback: JennyNeural from en-US-JennyNeural
    parts = (short_name or "").split("-")
    if parts:
        last = parts[-1].replace("Neural", "").replace("Multilingual", "").strip()
        if last:
            return last
    return short_name or "Voice"


def _tags_from_edge(item: Dict[str, Any]) -> List[str]:
    tags: List[str] = ["Neural", "Custom"]
    voice_tag = item.get("VoiceTag") if isinstance(item.get("VoiceTag"), dict) else {}
    cats = voice_tag.get("ContentCategories") if isinstance(voice_tag, dict) else None
    personalities = voice_tag.get("VoicePersonalities") if isinstance(voice_tag, dict) else None
    if isinstance(cats, list):
        for c in cats[:2]:
            label = str(c or "").strip()
            if label and label not in tags:
                tags.append(label)
    if isinstance(personalities, list) and len(tags) < 4:
        for p in personalities[:1]:
            label = str(p or "").strip()
            if label and label not in tags:
                tags.append(label)
    short = str(item.get("ShortName") or "")
    if "Multilingual" in short and "Multilingual" not in tags:
        tags.append("Multilingual")
    return tags[:4]


def _description_from_edge(item: Dict[str, Any], *, language: str, gender: str) -> str:
    voice_tag = item.get("VoiceTag") if isinstance(item.get("VoiceTag"), dict) else {}
    personalities = voice_tag.get("VoicePersonalities") if isinstance(voice_tag, dict) else None
    personality = ""
    if isinstance(personalities, list) and personalities:
        personality = ", ".join(str(p).strip() for p in personalities[:2] if str(p).strip())
    gender_l = gender if gender != "neutral" else "neural"
    locale = language or "this locale"
    if personality:
        return f"A {gender_l} {locale} neural voice ({personality.lower()})."
    return f"A {gender_l} {locale} neural voice for clear conversational speech."


def _normalize_catalog_item(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Normalize a voice dict from snapshot or overlay into catalog shape."""
    engine = str(item.get("engine_voice") or "").strip()
    if not engine:
        return None
    vid = str(item.get("id") or "").strip() or _voice_id_for_engine(engine)
    if not vid.startswith("custom-"):
        vid = f"custom-{vid}"
    name = str(item.get("name") or "").strip()
    if not name:
        name = engine.split("-")[-1].replace("Neural", "") or engine
    raw_tags = item.get("tags")
    tags: List[str] = []
    if isinstance(raw_tags, list):
        for tag in raw_tags:
            label = str(tag or "").strip()
            if label and label not in tags:
                tags.append(label)
    if not tags:
        tags = ["Neural", "Custom"]
    return {
        "id": vid,
        "name": name,
        "language": str(item.get("language") or "").strip() or "Unknown",
        "language_code": str(item.get("language_code") or "").strip() or "und",
        "gender": _normalize_gender(item.get("gender")),
        "description": str(item.get("description") or "").strip(),
        "age": str(item.get("age") or "").strip() or "Adult",
        "tags": tags,
        "provider": "custom",
        "engine_voice": engine,
        "metadata": {},
    }


def _load_json_list(path: Path) -> List[Dict[str, Any]]:
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.error("Failed to load %s: %s", path.name, exc)
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _load_overlay_by_engine() -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for item in _load_json_list(_OVERLAY_PATH):
        normalized = _normalize_catalog_item(item)
        if not normalized:
            continue
        out[normalized["engine_voice"]] = normalized
    return out


def _load_snapshot_voices() -> List[Dict[str, Any]]:
    voices: List[Dict[str, Any]] = []
    for item in _load_json_list(_SNAPSHOT_PATH):
        normalized = _normalize_catalog_item(item)
        if normalized:
            voices.append(normalized)
    return voices


def _map_edge_voice(item: Dict[str, Any], overlay: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    short = str(item.get("ShortName") or "").strip()
    if not short:
        return None
    locale = str(item.get("Locale") or "").strip() or "und"
    locale_name = str(item.get("LocaleName") or "").strip() or locale
    gender = _normalize_gender(item.get("Gender"))
    base = {
        "id": _voice_id_for_engine(short),
        "name": _display_name(str(item.get("FriendlyName") or ""), short),
        "language": locale_name,
        "language_code": locale,
        "gender": gender,
        "description": _description_from_edge(item, language=locale_name, gender=gender),
        "age": "Adult",
        "tags": _tags_from_edge(item),
        "provider": "custom",
        "engine_voice": short,
        "metadata": {},
    }
    if overlay:
        # Prefer curated id/name/description/tags/age; keep engine from edge.
        for key in ("id", "name", "description", "tags", "age", "language", "language_code", "gender"):
            val = overlay.get(key)
            if val is None or val == "" or val == []:
                continue
            base[key] = val
        base["engine_voice"] = short
    return base


def _apply_overlays(
    voices: List[Dict[str, Any]],
    overlays: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge curated overlay metadata onto catalog voices; append missing overlay engines."""
    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
    for voice in voices:
        engine = str(voice.get("engine_voice") or "").strip()
        if not engine or engine in seen:
            continue
        seen.add(engine)
        merged = dict(voice)
        overlay = overlays.get(engine)
        if overlay:
            for key in ("id", "name", "description", "tags", "age", "language", "language_code", "gender"):
                val = overlay.get(key)
                if val is None or val == "" or val == []:
                    continue
                merged[key] = val
            merged["engine_voice"] = engine
        out.append(merged)

    for engine, overlay in overlays.items():
        if engine in seen:
            continue
        out.append(dict(overlay))
        seen.add(engine)
    return out


def _finalize_catalog(voices: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], ...]:
    """Full catalog, sorted A–Z by language then name (no hard voice cap)."""
    ordered = [_attach_preview_url(dict(v)) for v in voices]
    ordered.sort(
        key=lambda v: (
            str(v.get("language") or ""),
            str(v.get("name") or ""),
            str(v.get("engine_voice") or ""),
        )
    )
    return tuple(ordered)


async def _fetch_edge_voices() -> List[Dict[str, Any]]:
    try:
        import edge_tts
    except ImportError:
        logger.error("edge-tts is not installed; Custom catalog will use bundled snapshot")
        return []
    try:
        return list(await asyncio.wait_for(edge_tts.list_voices(), timeout=_LIVE_FETCH_TIMEOUT_S))
    except asyncio.TimeoutError:
        logger.warning("edge_tts.list_voices timed out after %ss", _LIVE_FETCH_TIMEOUT_S)
        return []
    except Exception as exc:
        logger.warning("edge_tts.list_voices failed: %s", exc)
        return []


def _run_async(coro):
    def _run():
        return asyncio.run(coro)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(_run).result(timeout=_LIVE_FETCH_TIMEOUT_S + 5)
    return _run()


def _build_catalog_from_edge(raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    overlays = _load_overlay_by_engine()
    voices: List[Dict[str, Any]] = []
    seen_engines: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        short = str(item.get("ShortName") or "").strip()
        if not short or short in seen_engines:
            continue
        mapped = _map_edge_voice(item, overlays.get(short))
        if not mapped:
            continue
        seen_engines.add(short)
        voices.append(mapped)
    # Include overlay-only engines missing from live edge list.
    for engine, overlay in overlays.items():
        if engine in seen_engines:
            continue
        voices.append(dict(overlay))
    return voices


def _build_catalog_from_snapshot() -> List[Dict[str, Any]]:
    overlays = _load_overlay_by_engine()
    snapshot = _load_snapshot_voices()
    if snapshot:
        return _apply_overlays(snapshot, overlays)
    # Last resort: curated overlay only (should be rare — snapshot ships with module).
    logger.warning(
        "Custom voice catalog snapshot missing; using overlay-only last resort (%s voices)",
        len(overlays),
    )
    return [dict(v) for v in overlays.values()]


def _refresh_catalog_unlocked() -> Tuple[Dict[str, Any], ...]:
    global _cache_voices, _cache_expires_at
    raw: List[Dict[str, Any]] = []
    source = "snapshot"
    try:
        raw = _run_async(_fetch_edge_voices())
    except Exception as exc:
        logger.warning("Could not refresh edge-tts voice list: %s", exc)
        raw = []

    if raw:
        voices = _build_catalog_from_edge(raw)
        source = "live"
        logger.info("Custom voice catalog source=live (%s voices before finalize)", len(voices))
    else:
        voices = _build_catalog_from_snapshot()
        source = "snapshot" if _SNAPSHOT_PATH.is_file() else "overlay"
        logger.info(
            "Custom voice catalog source=%s (%s voices before finalize)",
            source,
            len(voices),
        )

    catalog = _finalize_catalog(voices)
    logger.info("Custom voice catalog ready source=%s count=%s", source, len(catalog))
    _cache_voices = catalog
    _cache_expires_at = time.monotonic() + _CACHE_TTL_S
    return catalog


def get_custom_catalog() -> tuple:
    """Return immutable tuple of normalized voice dicts (full edge-tts catalog)."""
    global _cache_voices, _cache_expires_at
    now = time.monotonic()
    with _thread_lock:
        if _cache_voices is not None and now < _cache_expires_at:
            return _cache_voices
        return _refresh_catalog_unlocked()


def list_custom_voices() -> List[Dict[str, Any]]:
    return [dict(v) for v in get_custom_catalog()]


def get_custom_voice(voice_id: str) -> Optional[Dict[str, Any]]:
    vid = (voice_id or "").strip()
    if not vid:
        return None
    for v in get_custom_catalog():
        if v["id"] == vid:
            return dict(v)
    # Also allow resolving by engine ShortName for convenience.
    for v in get_custom_catalog():
        if v.get("engine_voice") == vid:
            return dict(v)
    return None


def resolve_engine_voice(voice_id: str) -> Optional[str]:
    voice = get_custom_voice(voice_id)
    if voice:
        return str(voice.get("engine_voice") or "") or None
    # Direct ShortName passthrough (custom-en-us-jennyneural or en-US-JennyNeural)
    raw = (voice_id or "").strip()
    if not raw:
        return None
    if raw.startswith("custom-"):
        # Rebuild engine guess is unreliable; already looked up by id.
        return None
    if "Neural" in raw or raw.count("-") >= 2:
        return raw
    return None


def filter_custom_voices(
    *,
    search: str = "",
    language: str = "",
    gender: str = "",
) -> List[Dict[str, Any]]:
    """Filter helpers for API / tests (frontend also filters client-side)."""
    q = (search or "").strip().lower()
    lang = (language or "").strip().lower()
    gen = (gender or "").strip().lower()
    if gen in ("all", "all genders"):
        gen = ""
    if lang in ("all", "all languages"):
        lang = ""

    out: List[Dict[str, Any]] = []
    for v in list_custom_voices():
        if q:
            hay = f"{v['name']} {v.get('description') or ''} {v.get('language') or ''}".lower()
            if q not in hay:
                continue
        if lang:
            if lang not in (v.get("language") or "").lower() and lang not in (
                v.get("language_code") or ""
            ).lower():
                continue
        if gen:
            if _normalize_gender(v.get("gender")) != gen:
                continue
        out.append(v)
    return out


def catalog_languages() -> List[str]:
    langs = sorted({v["language"] for v in get_custom_catalog() if v.get("language")})
    return langs


def clear_custom_catalog_cache() -> None:
    """Test helper — force next get_custom_catalog() to refresh."""
    global _cache_voices, _cache_expires_at, _preview_urls_by_engine
    with _thread_lock:
        _cache_voices = None
        _cache_expires_at = 0.0
        _preview_urls_by_engine = None
