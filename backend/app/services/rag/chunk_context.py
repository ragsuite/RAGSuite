"""Context header for a chunk: where in the site or document the passage sits.

The header (page title, breadcrumb, section) is prepended to the chunk only for
embedding and for the answering model; the stored chunk text stays untouched, so
display, citations and answer verification keep working on the original passage.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import unquote, urlparse

# Bump when the embedded text of a chunk changes; older chunks count as outdated.
# 1 = title/breadcrumb/section header, 2 = header plus LLM-written document context.
CHUNK_CONTEXT_VERSION = 1
CHUNK_CONTEXT_VERSION_LLM = 2

MAX_TITLE_CHARS = 110
MAX_SEGMENT_CHARS = 60
MAX_CRUMBS = 4
MAX_HEADER_CHARS = 200
MAX_PASSAGE_LINE_CHARS = 140
SEPARATOR = " > "

_UPLOAD_PREFIX_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_", re.I)
_LANG_SEGMENT_RE = re.compile(r"^[a-z]{2}(?:[-_][a-z]{2})?$", re.I)
_FILE_EXT_RE = re.compile(r"\.(?:html?|php|aspx?|jsp|pdf|docx?|pptx?|xlsx?)$", re.I)
_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)
_GENERIC_SEGMENTS = {"index", "default", "home", "p", "pr", "dp", "item", "detail", "details", "page", "pages"}


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return (cut or text[:limit]).rstrip(" ,;:-")


def _words(text: str) -> set:
    return {w.lower() for w in _WORD_RE.findall(text or "") if len(w) > 1}


def _looks_like_id(segment: str) -> bool:
    if segment.isdigit():
        return True
    compact = segment.replace("-", "").replace("_", "")
    digits = sum(ch.isdigit() for ch in compact)
    return len(compact) >= 8 and digits >= 3 and " " not in segment and digits / len(compact) > 0.25


def clean_title(meta: Dict[str, Any]) -> str:
    title = str(meta.get("title") or "").strip()
    title = _UPLOAD_PREFIX_RE.sub("", title)
    return _clip(title, MAX_TITLE_CHARS)


def url_breadcrumb(url: str) -> List[str]:
    """Readable path segments of an http(s) URL; language codes, IDs and file names dropped."""
    parsed = urlparse(str(url or ""))
    if parsed.scheme not in ("http", "https"):
        return []
    crumbs: List[str] = []
    for raw in unquote(parsed.path or "").split("/"):
        segment = _FILE_EXT_RE.sub("", raw.strip())
        if not segment or len(segment) < 2 or segment.lower() in _GENERIC_SEGMENTS:
            continue
        if _LANG_SEGMENT_RE.match(segment) or _looks_like_id(segment):
            continue
        words = re.sub(r"[-_+]+", " ", segment).strip()
        if words:
            crumbs.append(_clip(words, MAX_SEGMENT_CHARS))
    return crumbs[-MAX_CRUMBS:]


def is_site_block(meta: Optional[Dict[str, Any]]) -> bool:
    """Site header/footer chunk: its ``url`` is only the page the block was first seen on."""
    return bool(isinstance(meta, dict) and meta.get("content_kind"))


def _crumbs(meta: Dict[str, Any]) -> List[str]:
    explicit = meta.get("breadcrumb")
    if isinstance(explicit, str) and explicit.strip():
        return [c.strip() for c in explicit.split(SEPARATOR) if c.strip()][-MAX_CRUMBS:]
    if is_site_block(meta):
        return []
    return url_breadcrumb(str(meta.get("url") or ""))


def _dedupe(parts: Iterable[str]) -> List[str]:
    kept: List[str] = []
    seen_words: set = set()
    for part in parts:
        words = _words(part)
        if not words or words <= seen_words:
            continue
        kept.append(part)
        seen_words |= words
    return kept


def build_header(meta: Optional[Dict[str, Any]]) -> str:
    """``Title > crumb > crumb > Section`` for any source; empty when nothing is known."""
    meta = meta or {}
    section = _clip(str(meta.get("section") or ""), MAX_SEGMENT_CHARS)
    parts = _dedupe([clean_title(meta), *_crumbs(meta), section])
    return _clip(SEPARATOR.join(parts), MAX_HEADER_CHARS)


def header_for(meta: Optional[Dict[str, Any]]) -> str:
    meta = meta or {}
    stored = meta.get("ctx_header")
    return stored if isinstance(stored, str) and stored.strip() else build_header(meta)


def embedding_text(chunk: str, meta: Optional[Dict[str, Any]]) -> str:
    """Text that gets embedded: header, optional LLM context, then the chunk."""
    meta = meta or {}
    llm_context = str(meta.get("ctx_llm") or "").strip()
    return "\n".join(p for p in (header_for(meta), llm_context, chunk or "") if p)


def embedding_texts(texts: List[str], metas: Optional[List[Dict[str, Any]]]) -> List[str]:
    metas = metas or []
    return [embedding_text(t, metas[i] if i < len(metas) else None) for i, t in enumerate(texts)]


def annotate(metas: Optional[List[Dict[str, Any]]], count: int) -> Optional[List[Dict[str, Any]]]:
    """Per-chunk metadata carrying ``ctx_header`` and ``chunk_ctx_v``.

    ``None`` stays ``None`` so the vector store keeps building its own fallback metadata.
    """
    if not metas:
        return metas
    source = list(metas)
    out: List[Dict[str, Any]] = []
    for i in range(count):
        meta = dict(source[i]) if i < len(source) and isinstance(source[i], dict) else {}
        meta["ctx_header"] = build_header(meta)
        meta["chunk_ctx_v"] = CHUNK_CONTEXT_VERSION_LLM if meta.get("ctx_llm") else CHUNK_CONTEXT_VERSION
        out.append(meta)
    return out


def passage_line(meta: Any) -> str:
    """``Page: ...`` line shown to the answering model above a passage."""
    if not isinstance(meta, dict):
        return ""
    header = _clip(header_for(meta), MAX_PASSAGE_LINE_CHARS)
    return f"Page: {header}\n" if header else ""
