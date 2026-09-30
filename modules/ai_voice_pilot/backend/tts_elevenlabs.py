"""ElevenLabs TTS client for AI Voice Pilot."""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

ELEVENLABS_BASE = "https://api.elevenlabs.io"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
FALLBACK_MODEL_ID = "eleven_turbo_v2_5"
FLASH_MODEL_ID = "eleven_flash_v2_5"
TTS_MODEL_CHAIN = (DEFAULT_MODEL_ID, FALLBACK_MODEL_ID, FLASH_MODEL_ID)
REQUEST_TIMEOUT_S = 45.0
MAX_TTS_CHARS = 4500
# Voice Library pages (page_size ≤ 100). 5 × 100 keeps carousel usable.
SHARED_VOICES_PAGE_SIZE = 100
SHARED_VOICES_MAX_PAGES = 5
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MULTI_SPACE = re.compile(r"\s+")

# voice_id → public_owner_id for Voice Library entries (used if TTS needs add-to-library).
_shared_owner_by_voice: Dict[str, str] = {}

DEFAULT_VOICE_SETTINGS = {
    "stability": 0.45,
    "similarity_boost": 0.75,
    "style": 0.0,
    "speed": 1.0,
    "use_speaker_boost": True,
}


def sanitize_voice_settings(raw: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Clamp voice_settings to ElevenLabs-safe ranges; merge onto defaults."""
    base = dict(DEFAULT_VOICE_SETTINGS)
    if not isinstance(raw, dict):
        return base

    def _f(key: str, lo: float, hi: float) -> None:
        if key not in raw:
            return
        try:
            base[key] = max(lo, min(hi, float(raw[key])))
        except (TypeError, ValueError):
            pass

    _f("stability", 0.0, 1.0)
    _f("similarity_boost", 0.0, 1.0)
    _f("style", 0.0, 1.0)
    _f("speed", 0.7, 1.2)
    if "use_speaker_boost" in raw:
        base["use_speaker_boost"] = bool(raw["use_speaker_boost"])
    return base


class ElevenLabsError(Exception):
    def __init__(self, message: str, *, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "xi-api-key": api_key.strip(),
        "Accept": "application/json",
    }


def normalize_text_for_speech(text: str) -> str:
    """Collapse whitespace and strip control characters for reliable TTS."""
    cleaned = _CONTROL_CHARS.sub(" ", (text or "").replace("\r", " ").replace("\n", " "))
    cleaned = _MULTI_SPACE.sub(" ", cleaned).strip()
    if len(cleaned) > MAX_TTS_CHARS:
        cleaned = cleaned[:MAX_TTS_CHARS].rsplit(" ", 1)[0] or cleaned[:MAX_TTS_CHARS]
    return cleaned


def _parse_eleven_error(resp: httpx.Response) -> str:
    """Extract a useful message from an ElevenLabs error body."""
    try:
        data = resp.json()
        if isinstance(data, dict):
            detail = data.get("detail")
            if isinstance(detail, dict):
                msg = detail.get("message") or detail.get("status") or detail
                return str(msg)[:240]
            if detail is not None:
                return str(detail)[:240]
            if data.get("message"):
                return str(data["message"])[:240]
            return str(data)[:240]
    except Exception:
        pass
    return (resp.text or f"HTTP {resp.status_code}")[:240]


_QUOTA_HINTS = (
    "quota",
    "credit",
    "payment_required",
    "payment required",
    "billing",
    "insufficient",
    "limit_exceeded",
    "quota_exceeded",
    "out of credits",
    "character limit",
    "characters remaining",
)


def _looks_like_quota_error(detail: str) -> bool:
    lower = (detail or "").lower()
    return any(hint in lower for hint in _QUOTA_HINTS)


CREDITS_EXHAUSTED_MESSAGE = (
    "ElevenLabs credits are exhausted or your plan limit was reached. "
    "Add credits or upgrade your ElevenLabs plan, then try again."
)


def _raise_from_http_response(resp: httpx.Response, *, context: str) -> None:
    """Raise ElevenLabsError with a professional, cause-specific message."""
    detail = _parse_eleven_error(resp)
    status = resp.status_code

    if status == 402 or _looks_like_quota_error(detail):
        raise ElevenLabsError(CREDITS_EXHAUSTED_MESSAGE, status_code=402)

    if status == 401:
        raise ElevenLabsError("Invalid ElevenLabs API key", status_code=400)

    if status == 404 and "voice" in context.lower():
        raise ElevenLabsError(
            "This voice is unavailable in ElevenLabs. Pick another voice.",
            status_code=400,
        )

    if status == 429:
        raise ElevenLabsError(
            (
                f"ElevenLabs rate limit exceeded. {detail}".strip()
                if detail
                else "ElevenLabs rate limit exceeded. Try again shortly."
            ),
            status_code=429,
        )

    hint = detail.strip() if detail else f"HTTP {status}"
    raise ElevenLabsError(
        f"{context} ({status}): {hint}",
        status_code=502 if status >= 500 else status,
    )


def validate_api_key(api_key: str) -> None:
    key = (api_key or "").strip()
    if not key:
        raise ElevenLabsError("ElevenLabs API key is required", status_code=400)
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
            resp = client.get(f"{ELEVENLABS_BASE}/v1/user", headers=_headers(key))
        if resp.status_code >= 400:
            _raise_from_http_response(resp, context="ElevenLabs key check failed")
    except ElevenLabsError:
        raise
    except Exception as exc:
        logger.warning("ElevenLabs key validation failed: %s", exc)
        raise ElevenLabsError("Could not reach ElevenLabs. Try again shortly.", status_code=502) from exc


def _normalize_gender_label(raw: Any) -> str:
    g = str(raw or "").strip().lower()
    if g in ("male", "m", "man"):
        return "male"
    if g in ("female", "f", "woman"):
        return "female"
    if g in ("neutral", "non-binary", "nonbinary", "other"):
        return "neutral"
    return "neutral"


def _title_case_label(raw: Any) -> str:
    text = str(raw or "").strip().replace("_", " ").replace("-", " ").strip()
    if not text:
        return ""
    return " ".join(part.capitalize() for part in text.split() if part)


def _build_elevenlabs_tags(
    *,
    use_case: str = "",
    descriptive: str = "",
    category: str = "",
    accent: str = "",
) -> List[str]:
    tags: List[str] = []
    for raw in (use_case, descriptive, category, accent):
        label = _title_case_label(raw)
        if not label:
            continue
        # Short display chips — skip very long phrases
        if len(label) > 28:
            continue
        if label.lower() not in {t.lower() for t in tags}:
            tags.append(label)
        if len(tags) >= 4:
            break
    if not tags:
        tags = ["ElevenLabs"]
    return tags


def _build_elevenlabs_description(
    *,
    description: str = "",
    descriptive: str = "",
    gender: str = "",
    language: str = "",
    accent: str = "",
    use_case: str = "",
) -> str:
    for candidate in (description, descriptive):
        text = str(candidate or "").strip()
        if text:
            return text[:280]
    gender_l = gender if gender and gender != "neutral" else "neural"
    locale = language or (f"English · {_title_case_label(accent)}" if accent else "this locale")
    if use_case:
        return f"A {gender_l} {locale} voice for {_title_case_label(use_case).lower()}."
    if accent:
        return f"A {gender_l} {_title_case_label(accent)} accent voice for clear conversational speech."
    return f"A {gender_l} ElevenLabs voice for clear conversational speech."


def _build_elevenlabs_language(*, language: str = "", locale: str = "", accent: str = "") -> str:
    lang = str(language or "").strip()
    loc = str(locale or "").strip()
    acc = _title_case_label(accent)
    if lang and acc and acc.lower() not in lang.lower():
        return f"{lang} · {acc}"
    if lang:
        return lang
    if loc:
        return loc
    if acc:
        return f"English · {acc}"
    return ""


def _enrich_voice_fields(
    *,
    voice_id: str,
    name: str,
    preview_url: Any,
    labels: Optional[Dict[str, str]],
    description: str = "",
    descriptive: str = "",
    use_case: str = "",
    category: str = "",
    accent: str = "",
    language: str = "",
    locale: str = "",
    gender: str = "",
    age: str = "",
) -> Dict[str, Any]:
    labels_out: Dict[str, str] = dict(labels or {})
    gender_n = _normalize_gender_label(gender or labels_out.get("gender"))
    age_n = _title_case_label(age or labels_out.get("age")) or "Adult"
    use_case_n = use_case or labels_out.get("use_case") or ""
    descriptive_n = descriptive or labels_out.get("descriptive") or ""
    category_n = category or labels_out.get("category") or ""
    accent_n = accent or labels_out.get("accent") or ""
    language_n = _build_elevenlabs_language(
        language=language or labels_out.get("language") or "",
        locale=locale or labels_out.get("locale") or "",
        accent=accent_n,
    )
    description_n = _build_elevenlabs_description(
        description=description or labels_out.get("description") or "",
        descriptive=descriptive_n,
        gender=gender_n,
        language=language_n,
        accent=accent_n,
        use_case=use_case_n,
    )
    tags = _build_elevenlabs_tags(
        use_case=use_case_n,
        descriptive=descriptive_n,
        category=category_n,
        accent=accent_n,
    )
    # Keep labels in sync for filters / older UI paths
    if gender_n:
        labels_out["gender"] = gender_n
    if age_n:
        labels_out["age"] = age_n
    if language_n:
        labels_out["language"] = language_n
    if description_n:
        labels_out["description"] = description_n
    if accent_n and "accent" not in labels_out:
        labels_out["accent"] = accent_n
    if use_case_n and "use_case" not in labels_out:
        labels_out["use_case"] = use_case_n

    return {
        "voice_id": voice_id,
        "name": name,
        "preview_url": preview_url,
        "labels": labels_out or None,
        "description": description_n,
        "tags": tags,
        "language": language_n or None,
        "gender": gender_n,
        "age": age_n,
    }


def _normalize_account_voice(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    voice_id = str(item.get("voice_id") or "").strip()
    name = str(item.get("name") or voice_id).strip()
    if not voice_id:
        return None
    raw_labels = item.get("labels") if isinstance(item.get("labels"), dict) else {}
    labels: Dict[str, str] = {}
    for key, val in raw_labels.items():
        if val is None or val == "":
            continue
        labels[str(key)] = str(val)
    return _enrich_voice_fields(
        voice_id=voice_id,
        name=name,
        preview_url=item.get("preview_url"),
        labels=labels,
        description=str(item.get("description") or "").strip(),
        descriptive=str(labels.get("descriptive") or "").strip(),
        use_case=str(labels.get("use_case") or "").strip(),
        category=str(item.get("category") or labels.get("category") or "").strip(),
        accent=str(labels.get("accent") or "").strip(),
        language=str(labels.get("language") or "").strip(),
        locale=str(labels.get("locale") or "").strip(),
        gender=str(labels.get("gender") or "").strip(),
        age=str(labels.get("age") or "").strip(),
    )


def _normalize_shared_voice(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    voice_id = str(item.get("voice_id") or "").strip()
    name = str(item.get("name") or voice_id).strip()
    if not voice_id:
        return None
    public_owner_id = str(item.get("public_owner_id") or "").strip()
    labels: Dict[str, str] = {}
    for key in ("accent", "gender", "age", "descriptive", "use_case", "language", "locale"):
        val = item.get(key)
        if val is None or val == "":
            continue
        labels[key] = str(val)
    if public_owner_id:
        labels["public_owner_id"] = public_owner_id
    category = item.get("category")
    if category:
        labels["category"] = str(category)
    return _enrich_voice_fields(
        voice_id=voice_id,
        name=name,
        preview_url=item.get("preview_url"),
        labels=labels,
        description=str(item.get("description") or "").strip(),
        descriptive=str(item.get("descriptive") or "").strip(),
        use_case=str(item.get("use_case") or "").strip(),
        category=str(category or "").strip(),
        accent=str(item.get("accent") or "").strip(),
        language=str(item.get("language") or "").strip(),
        locale=str(item.get("locale") or "").strip(),
        gender=str(item.get("gender") or "").strip(),
        age=str(item.get("age") or "").strip(),
    )


def _fetch_account_voices(client: httpx.Client, api_key: str) -> List[Dict[str, Any]]:
    resp = client.get(
        f"{ELEVENLABS_BASE}/v1/voices",
        headers=_headers(api_key),
        params={"show_legacy": "true"},
    )
    if resp.status_code >= 400:
        _raise_from_http_response(resp, context="Failed to list voices")
    payload = resp.json() if resp.content else {}
    voices = payload.get("voices") if isinstance(payload, dict) else None
    if not isinstance(voices, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in voices:
        if not isinstance(item, dict):
            continue
        normalized = _normalize_account_voice(item)
        if normalized:
            out.append(normalized)
    return out


def _fetch_shared_voices(client: httpx.Client, api_key: str) -> List[Dict[str, Any]]:
    """Paginate Voice Library (trending). Best-effort — never fails the whole list."""
    out: List[Dict[str, Any]] = []
    for page in range(SHARED_VOICES_MAX_PAGES):
        try:
            resp = client.get(
                f"{ELEVENLABS_BASE}/v1/shared-voices",
                headers=_headers(api_key),
                params={
                    "page_size": SHARED_VOICES_PAGE_SIZE,
                    "page": page,
                    "sort": "trending",
                },
            )
        except Exception as exc:
            logger.warning("ElevenLabs shared-voices request failed page=%s: %s", page, exc)
            break
        if resp.status_code >= 400:
            logger.warning(
                "ElevenLabs shared-voices HTTP %s page=%s: %s",
                resp.status_code,
                page,
                _parse_eleven_error(resp),
            )
            break
        payload = resp.json() if resp.content else {}
        if not isinstance(payload, dict):
            break
        voices = payload.get("voices")
        if not isinstance(voices, list) or not voices:
            break
        for item in voices:
            if not isinstance(item, dict):
                continue
            normalized = _normalize_shared_voice(item)
            if normalized:
                out.append(normalized)
        if not payload.get("has_more"):
            break
    return out


def _merge_voice_lists(
    account: List[Dict[str, Any]],
    shared: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Account/library voices first; then Voice Library entries not already present."""
    global _shared_owner_by_voice
    owner_map: Dict[str, str] = {}
    merged: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for voice in account:
        vid = voice["voice_id"]
        if vid in seen:
            continue
        seen.add(vid)
        merged.append(voice)

    for voice in shared:
        vid = voice["voice_id"]
        labels = voice.get("labels") if isinstance(voice.get("labels"), dict) else {}
        owner = str(labels.get("public_owner_id") or "").strip()
        if owner:
            owner_map[vid] = owner
        if vid in seen:
            continue
        seen.add(vid)
        merged.append(voice)

    _shared_owner_by_voice = owner_map
    return merged


def _ensure_shared_voice_in_library(
    client: httpx.Client,
    *,
    api_key: str,
    voice_id: str,
    voice_name: str = "",
) -> Optional[str]:
    """
    Add a Voice Library voice to the account if TTS requires it (best-effort).
    Returns a replacement voice_id when ElevenLabs issues a new one.
    """
    owner = _shared_owner_by_voice.get(voice_id) or ""
    if not owner:
        return None
    try:
        resp = client.post(
            f"{ELEVENLABS_BASE}/v1/voices/add/{owner}/{voice_id}",
            headers=_headers(api_key),
            json={
                "new_name": (voice_name or voice_id)[:64] or voice_id,
                "bookmarked": False,
            },
        )
        if resp.status_code >= 500:
            logger.warning(
                "ElevenLabs add shared voice failed status=%s detail=%s",
                resp.status_code,
                _parse_eleven_error(resp),
            )
            return None
        if resp.status_code >= 400:
            # Often already in library — keep original id.
            return None
        payload = resp.json() if resp.content else {}
        if isinstance(payload, dict):
            new_id = str(payload.get("voice_id") or "").strip()
            if new_id:
                return new_id
    except Exception as exc:
        logger.warning("ElevenLabs add shared voice error: %s", exc)
    return None


def list_voices(api_key: str) -> List[Dict[str, Any]]:
    """Account voices (incl. legacy premade) + paginated Voice Library catalog."""
    key = (api_key or "").strip()
    if not key:
        raise ElevenLabsError("ElevenLabs API key is required", status_code=400)
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
            account = _fetch_account_voices(client, key)
            shared = _fetch_shared_voices(client, key)
        merged = _merge_voice_lists(account, shared)
        logger.info(
            "ElevenLabs voices listed account=%s shared=%s merged=%s",
            len(account),
            len(shared),
            len(merged),
        )
        return merged
    except ElevenLabsError:
        raise
    except Exception as exc:
        logger.warning("ElevenLabs list_voices failed: %s", exc)
        raise ElevenLabsError("Could not load voices from ElevenLabs.", status_code=502) from exc


def _post_tts(
    client: httpx.Client,
    *,
    api_key: str,
    voice_id: str,
    text: str,
    model_id: str,
    voice_settings: Optional[Dict[str, Any]] = None,
) -> httpx.Response:
    url = f"{ELEVENLABS_BASE}/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": voice_settings
        if voice_settings is not None
        else dict(DEFAULT_VOICE_SETTINGS),
    }
    headers = {
        **_headers(api_key),
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }
    return client.post(url, headers=headers, json=payload)


def synthesize_speech(
    api_key: str,
    *,
    text: str,
    voice_id: str,
    voice_settings: Optional[Dict[str, Any]] = None,
    preferred_model_id: Optional[str] = None,
) -> tuple[bytes, str]:
    """
    Synthesize speech. Returns ``(audio_bytes, model_id_used)``.

    When ``preferred_model_id`` is set (e.g. locked for a stream turn), only that
    model is attempted so mid-answer chunks keep the same engine identity.
    """
    key = (api_key or "").strip()
    vid = (voice_id or "").strip()
    body_text = normalize_text_for_speech(text)
    settings = sanitize_voice_settings(voice_settings)
    if not key:
        raise ElevenLabsError("ElevenLabs API key is required", status_code=400)
    if not vid:
        raise ElevenLabsError("A voice must be selected", status_code=400)
    if not body_text:
        raise ElevenLabsError("Text is required", status_code=400)

    preferred = (preferred_model_id or "").strip() or None
    model_chain: tuple[str, ...] = (preferred,) if preferred else TTS_MODEL_CHAIN

    last_detail = ""
    last_status = 502
    last_resp: Optional[httpx.Response] = None

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
            shared_add_attempted = False
            for attempt, model_id in enumerate(model_chain):
                if attempt > 0:
                    time.sleep(0.45)
                resp = _post_tts(
                    client,
                    api_key=key,
                    voice_id=vid,
                    text=body_text,
                    model_id=model_id,
                    voice_settings=settings,
                )
                if resp.status_code == 401:
                    _raise_from_http_response(resp, context="Text-to-speech failed")
                if resp.status_code == 402 or _looks_like_quota_error(_parse_eleven_error(resp)):
                    _raise_from_http_response(resp, context="Text-to-speech failed")
                if resp.status_code == 404:
                    if not shared_add_attempted and vid in _shared_owner_by_voice:
                        shared_add_attempted = True
                        new_id = _ensure_shared_voice_in_library(
                            client, api_key=key, voice_id=vid
                        )
                        if new_id:
                            vid = new_id
                        # Retry same model after adding Voice Library entry.
                        resp = _post_tts(
                            client,
                            api_key=key,
                            voice_id=vid,
                            text=body_text,
                            model_id=model_id,
                            voice_settings=settings,
                        )
                        if resp.status_code < 400:
                            audio = resp.content or b""
                            if not audio:
                                raise ElevenLabsError("ElevenLabs returned empty audio", status_code=502)
                            return audio, model_id
                    raise ElevenLabsError(
                        "This voice is unavailable in ElevenLabs. Pick another voice.",
                        status_code=400,
                    )
                if resp.status_code == 429:
                    last_detail = _parse_eleven_error(resp)
                    last_status = 429
                    last_resp = resp
                    logger.warning(
                        "ElevenLabs TTS rate-limited model=%s detail=%s",
                        model_id,
                        last_detail,
                    )
                    time.sleep(0.9)
                    continue
                if resp.status_code >= 400:
                    last_detail = _parse_eleven_error(resp)
                    last_status = resp.status_code
                    last_resp = resp
                    logger.warning(
                        "ElevenLabs TTS failed model=%s status=%s detail=%s",
                        model_id,
                        resp.status_code,
                        last_detail,
                    )
                    # Some fallback models reject style/speed — retry without them.
                    detail_l = (last_detail or "").lower()
                    if "style" in detail_l or "speed" in detail_l:
                        settings = {
                            k: v
                            for k, v in settings.items()
                            if k not in ("style", "speed")
                        }
                    continue
                audio = resp.content or b""
                if not audio:
                    last_detail = "empty audio body"
                    logger.warning("ElevenLabs TTS empty audio model=%s", model_id)
                    continue
                return audio, model_id
    except ElevenLabsError:
        raise
    except Exception as exc:
        logger.warning("ElevenLabs synthesize failed: %s", exc)
        raise ElevenLabsError(
            "Could not reach ElevenLabs for speech synthesis.",
            status_code=502,
        ) from exc

    logger.warning(
        "ElevenLabs TTS exhausted retries status=%s detail=%s",
        last_status,
        last_detail,
    )
    if last_resp is not None and (
        last_status == 402
        or last_status == 429
        or _looks_like_quota_error(last_detail)
    ):
        _raise_from_http_response(last_resp, context="Text-to-speech failed")
    if last_status == 429:
        raise ElevenLabsError(
            f"ElevenLabs rate limit: {last_detail or 'try again shortly'}",
            status_code=429,
        )
    hint = last_detail.strip() if last_detail else "unknown error"
    raise ElevenLabsError(
        f"Text-to-speech failed ({last_status}): {hint}",
        status_code=502 if last_status >= 500 else last_status,
    )
