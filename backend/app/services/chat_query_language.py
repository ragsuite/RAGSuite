"""Retrieval-language bridge for chat.

A question in a language the project's documents are not written in ("मुझे लैपटॉप चाहिए"
against English product pages) shares no words with them, so keyword retrieval, the item
catalog and the evidence gate all miss it. Such a message is translated once into the
content language for retrieval; the reply-language rules stay as configured.
"""
from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from collections import Counter, OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, FrozenSet, Optional, Tuple

from .rag.language_config import resolve_language_name
from .rag.query_language import DETECTED_LANGUAGE_NAMES, detect_text_language

logger = logging.getLogger(__name__)

SAMPLE_DOCS = 40
SAMPLE_CHARS = 600
# A language counts as a content language from this share of the sampled documents.
MIN_SHARE = 0.2
LANGUAGES_TTL_S = 3600.0
TIMEOUT_S = 8.0
MAX_CACHED = 512

_NUMBER_RX = re.compile(r"\d+")
_MARKUP_RX = re.compile(r"[*_`#]+")

_lock = threading.Lock()
_languages: Dict[str, Tuple[float, Tuple[str, ...]]] = {}
_translations: "OrderedDict[Tuple[str, str], str]" = OrderedDict()


@dataclass(frozen=True)
class Bridged:
    message: str
    language: Optional[str] = None  # the user's language, set only when translated
    translate_ms: Optional[int] = None

    @property
    def translated(self) -> bool:
        return self.language is not None


def _sample_texts(db, project_id: str):
    import uuid

    from sqlalchemy import func

    from ..models import CrawlSource, Document, UploadedDocument

    project_id = uuid.UUID(str(project_id))
    rows = (
        db.query(Document.title, func.substr(Document.text_content, 1, SAMPLE_CHARS))
        .join(CrawlSource, CrawlSource.id == Document.source_id)
        .filter(CrawlSource.project_id == project_id)
        .limit(SAMPLE_DOCS)
        .all()
    )
    uploads = (
        db.query(UploadedDocument.title, UploadedDocument.language)
        .filter(UploadedDocument.project_id == project_id)
        .limit(SAMPLE_DOCS)
        .all()
    )
    return rows, uploads


def _detect_languages(db, project_id: str) -> Tuple[str, ...]:
    """Content languages, most common first (empty when unknown)."""
    try:
        rows, uploads = _sample_texts(db, project_id)
    except Exception as exc:
        logger.warning("content language sample failed project=%s: %s", project_id, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return ()
    votes: Counter = Counter()
    for title, text in rows:
        lang = detect_text_language(f"{title or ''}\n{text or ''}")
        if lang:
            votes[lang] += 1
    for title, declared in uploads:
        lang = (str(declared).strip().lower()[:2] if declared else None) or detect_text_language(title or "")
        if lang:
            votes[lang] += 1
    total = sum(votes.values())
    return tuple(lang for lang, n in votes.most_common() if total and n >= MIN_SHARE * total)


def content_languages(db, project_id: Optional[str]) -> Tuple[str, ...]:
    if not project_id or db is None:
        return ()
    key, now = str(project_id), time.monotonic()
    with _lock:
        hit = _languages.get(key)
    if hit and hit[0] > now:
        return hit[1]
    langs = _detect_languages(db, key)
    with _lock:
        _languages[key] = (now + LANGUAGES_TTL_S, langs)
    return langs


def foreign_language(message: str, langs: Tuple[str, ...]) -> Optional[str]:
    """The message's language when it is confidently not one of the content languages."""
    if not langs:
        return None
    lang = detect_text_language(message)
    return lang if lang and lang not in langs else None


def _name(code: str) -> str:
    return DETECTED_LANGUAGE_NAMES.get(code.split("-", 1)[0].lower()) or resolve_language_name(code)


def _prompt(message: str, source: str, target: str) -> str:
    src, tgt = _name(source), _name(target)
    return (
        f"You are a translator. Translate the {src} customer chat message below into {tgt} for a search "
        "engine. Translate only: do not answer it and do not add products, models, numbers or details "
        "that are not in the message. Keep brand, product and model names, numbers, units and currency "
        f"exactly as written. Return only the {tgt} translation as plain text.\n\n"
        f"{src}: {message}\n{tgt}:"
    )


def _numbers(text: str) -> FrozenSet[int]:
    return frozenset(int(n) for n in _NUMBER_RX.findall(text))


def _clean(text: str, message: str, source: str, target: str) -> Optional[str]:
    """The translation, or None when it is empty, runs on, is not in the target language, or
    adds numbers the message lacks (the model answered or embellished instead of translating)."""
    out = _MARKUP_RX.sub("", (text or "").strip()).strip().strip("\"'").strip()
    label = out.split(":", 1)[0].strip().lower() if ":" in out[:24] else ""
    if label in {source, target, _name(source).lower(), _name(target).lower(), "translation"}:
        out = out.split(":", 1)[1].strip()
    if not out or "\n" in out or len(out) > max(4 * len(message), 200):
        return None
    if len(out.split()) > 3 * len(message.split()) + 6 or not _numbers(out) <= _numbers(message):
        return None
    return out if detect_text_language(out) in (target, None) else None


async def _translate(
    message: str, source: str, target: str, llm_config: Optional[Dict[str, Any]], llm_factory: Any
) -> Optional[str]:
    key = (target, message)
    with _lock:
        if key in _translations:
            _translations.move_to_end(key)
            return _translations[key]
    cfg = llm_config or {}
    llm = llm_factory.get_llm(cfg.get("provider", "openai"), cfg.get("chat_model", "gpt-4"), cfg.get("api_key"))
    loop = asyncio.get_running_loop()
    result = await asyncio.wait_for(
        loop.run_in_executor(None, lambda: llm.complete(_prompt(message, source, target))), timeout=TIMEOUT_S
    )
    out = _clean(result.text if hasattr(result, "text") else str(result), message, source, target)
    if out:
        with _lock:
            _translations[key] = out
            while len(_translations) > MAX_CACHED:
                _translations.popitem(last=False)
    return out


async def bridge(
    db, project_id: Optional[str], message: str, llm_config: Optional[Dict[str, Any]], *, llm_factory: Any
) -> Bridged:
    """``message`` in the content language (unchanged when it already is or on any failure)."""
    langs = content_languages(db, project_id)
    lang = foreign_language(message, langs)
    if lang is None:
        return Bridged(message)
    start = time.perf_counter()
    try:
        translated = await _translate(message, lang, langs[0], llm_config, llm_factory)
    except Exception as exc:
        logger.warning("query translation failed (%s → %s): %s", lang, langs[0], exc)
        return Bridged(message)
    ms = int((time.perf_counter() - start) * 1000)
    if not translated:
        return Bridged(message)
    logger.info("Query translated for retrieval (%s → %s, %d ms): %r -> %r", lang, langs[0], ms, message[:80], translated[:120])
    return Bridged(translated, lang, ms)
