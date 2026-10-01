"""Prefer passages and Sources written in the query's language.

Multilingual websites publish the same content per language under translated slugs
(``/produkte/...`` vs ``/en/products/...``), so twins cannot be paired by URL or title.
Instead, within one website only, a query-language chunk is moved ahead of an
other-language chunk with similar relevance, and the Sources list hides that site's
other-language pages when it also has pages in the query language. Chunks in an
unknown language are neutral; pools with a single language are returned unchanged.
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple
from urllib.parse import parse_qs, urlsplit

from .query_language import detect_text_language, normalize_lang_code

_URL_LANGS = frozenset(
    "en de fr es pt it nl ar hi ja zh ru ko pl tr da sv no nb fi cs sk hu ro el bg hr sl uk".split()
)
_LOCALE_SEGMENT_RE = re.compile(r"^([a-z]{2})(?:[-_][a-z]{2,4})?$")
_LOCALE_PARAMS = ("lang", "language", "hl", "locale")
_SOURCE_FILE_PREFIX = "crawl_source_"
_TEXT_SAMPLE_CHARS = 800

Entry = Dict[str, Any]


def enabled() -> bool:
    return os.getenv("RAG_QUERY_LANGUAGE_PRIORITY", "1").strip().lower() not in ("0", "false", "no", "off")


def similarity_margin() -> float:
    try:
        return max(0.0, float(os.getenv("RAG_QUERY_LANGUAGE_MARGIN", "0.08")))
    except ValueError:
        return 0.08


def rank_window() -> int:
    try:
        return max(0, int(os.getenv("RAG_QUERY_LANGUAGE_WINDOW", "3")))
    except ValueError:
        return 3


def preferred_language(user_query: Optional[str], fallback_code: Optional[str] = None) -> Optional[str]:
    """Language of the question itself, else the visitor/admin answer language."""
    return detect_text_language(user_query) or normalize_lang_code(fallback_code)


def _url_locale(url: str) -> Optional[str]:
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    segment = next((s for s in parts.path.split("/") if s), "").lower()
    match = _LOCALE_SEGMENT_RE.match(segment)
    if match and match.group(1) in _URL_LANGS:
        return match.group(1)
    labels = (parts.hostname or "").split(".")
    if len(labels) >= 3 and labels[0] in _URL_LANGS:
        return labels[0]
    params = parse_qs(parts.query)
    for name in _LOCALE_PARAMS:
        code = normalize_lang_code((params.get(name) or [None])[0])
        if code in _URL_LANGS:
            return code
    return None


def chunk_language(doc: Any, meta: Any) -> Optional[str]:
    """Metadata ``language`` → URL locale → detected text language → ``None``."""
    meta = meta if isinstance(meta, dict) else {}
    code = normalize_lang_code(meta.get("language") or meta.get("lang"))
    if code:
        return code
    url = str(meta.get("url") or meta.get("source_url") or "")
    if url.startswith(("http://", "https://")):
        code = _url_locale(url)
        if code:
            return code
    return detect_text_language(str(doc or "")[:_TEXT_SAMPLE_CHARS]) if doc else None


def site_key(meta: Any) -> Optional[str]:
    """Website identity shared by all language versions of a site."""
    if not isinstance(meta, dict):
        return None
    url = str(meta.get("url") or meta.get("source_url") or "")
    if url.startswith(("http://", "https://")):
        host = (urlsplit(url).hostname or "").lower()
        labels = [label for label in host.split(".") if label]
        if labels and labels[0] == "www":
            labels = labels[1:]
        if len(labels) >= 3 and labels[0] in _URL_LANGS:
            labels = labels[1:]
        if labels:
            return "host:" + ".".join(labels)
    source_id = meta.get("crawl_source_id")
    source_file = str(meta.get("source_file") or "")
    if not source_id and source_file.startswith(_SOURCE_FILE_PREFIX):
        source_id = source_file[len(_SOURCE_FILE_PREFIX):]
    if source_id:
        return f"crawl:{source_id}"
    doc_id = meta.get("document_id")
    return f"doc:{doc_id}" if doc_id else None


def _is_mixed(langs: Sequence[Optional[str]], lang: str) -> bool:
    return lang in langs and any(code and code != lang for code in langs)


def _similarity(entry: Entry) -> float:
    try:
        return 1.0 - float(entry.get("dist", 1.0))
    except (TypeError, ValueError):
        return 0.0


def _reorder_group(
    members: List[Tuple[Entry, Optional[str]]], lang: str, margin: float, window: int
) -> List[Entry]:
    """Promote the next query-language member ahead of a similar other-language one.

    A member only moves behind query-language members ranked at most ``window`` group
    positions after it, so no chunk drifts far from its rank. Relative order inside each
    language is preserved; unknown-language members never trigger a move.
    """
    remaining = list(enumerate(members))
    ordered: List[Entry] = []
    while remaining:
        pos, (entry, code) = remaining[0]
        pick = 0
        if code and code != lang:
            match = next((i for i, (_, (_, c)) in enumerate(remaining) if c == lang), None)
            if match is not None:
                match_pos, (match_entry, _) = remaining[match]
                if match_pos - pos <= window and _similarity(match_entry) >= _similarity(entry) - margin:
                    pick = match
        ordered.append(remaining.pop(pick)[1][0])
    return ordered


def prefer_language(
    entries: List[Entry],
    lang: Optional[str],
    *,
    margin: Optional[float] = None,
    window: Optional[int] = None,
    partition_ids: Optional[Set[str]] = None,
) -> Tuple[List[Entry], bool]:
    """Reorder ``entries`` within each website (and routed partition); order across sites is kept.

    Order-only: the caller passes the final top-k so the set of chunks never changes.
    """
    if not lang or not enabled() or len(entries) < 2:
        return entries, False
    langs = [chunk_language(e.get("doc"), e.get("meta")) for e in entries]
    if not _is_mixed(langs, lang):
        return entries, False
    if partition_ids:
        from .source_routing import chunk_belongs_to

    groups: Dict[str, List[int]] = {}
    for i, entry in enumerate(entries):
        key = site_key(entry.get("meta"))
        if not key:
            continue
        if partition_ids:
            key = f"{key}|{chunk_belongs_to(entry.get('meta'), partition_ids)}"
        groups.setdefault(key, []).append(i)

    gap = similarity_margin() if margin is None else margin
    reach = rank_window() if window is None else window
    out = list(entries)
    changed = False
    for slots in groups.values():
        members = [(entries[i], langs[i]) for i in slots]
        if len(slots) < 2 or not _is_mixed([c for _, c in members], lang):
            continue
        for slot, entry in zip(slots, _reorder_group(members, lang, gap, reach)):
            changed = changed or out[slot] is not entry
            out[slot] = entry
    return out, changed


def twin_keep_mask(
    metas: Sequence[Any],
    lang: Optional[str],
    docs: Optional[Sequence[Any]] = None,
) -> List[bool]:
    """False for other-language items of a website that also has query-language items."""
    keep = [True] * len(metas)
    if not lang or not enabled() or len(metas) < 2:
        return keep
    langs = [chunk_language(docs[i] if docs and i < len(docs) else None, m) for i, m in enumerate(metas)]
    sites = [site_key(m) for m in metas]
    sites_with_lang = {site for site, code in zip(sites, langs) if site and code == lang}
    for i, (site, code) in enumerate(zip(sites, langs)):
        if site in sites_with_lang and code and code != lang:
            keep[i] = False
    return keep


def _chunk_identity(meta: Any) -> Optional[Tuple[str, str]]:
    if not isinstance(meta, dict):
        return None
    ref = meta.get("url") or meta.get("document_id") or meta.get("source_file")
    return (str(ref), str(meta.get("chunk_index", 0))) if ref else None


def texts_for_metas(metas: Sequence[Any], contexts: Any, context_metas: Any) -> List[Optional[str]]:
    """Chunk text for each meta (e.g. cited passages) looked up in the retrieval lists."""
    by_identity: Dict[Tuple[str, str], str] = {}
    for ctx, meta in zip(list(contexts or []), list(context_metas or [])):
        key = _chunk_identity(meta)
        if key and key not in by_identity:
            by_identity[key] = str(ctx or "")
    return [by_identity.get(_chunk_identity(m)) for m in metas]


def filter_language_twins(
    metas: Sequence[Any], lang: Optional[str], docs: Optional[Sequence[Any]] = None
) -> List[Any]:
    mask = twin_keep_mask(metas, lang, docs=docs)
    return [m for m, keep in zip(metas, mask) if keep]


def drop_language_twins(
    contexts: Any, metas: Any, sims: Any, lang: Optional[str]
) -> Tuple[List[Any], List[Any], Any, bool]:
    """Aligned (contexts, metas, sims) without other-language twins; last item = anything dropped."""
    ctx_list = list(contexts or [])
    meta_list = list(metas or [])
    mask = twin_keep_mask(meta_list, lang, docs=ctx_list)
    if all(mask):
        return ctx_list, meta_list, sims, False
    kept = [i for i, keep in enumerate(mask) if keep]
    new_sims = [sims[i] for i in kept if i < len(sims)] if isinstance(sims, list) else sims
    return [ctx_list[i] for i in kept if i < len(ctx_list)], [meta_list[i] for i in kept], new_sims, True


def mixed_language_hint(docs: Sequence[Any], metas: Sequence[Any], lang: Optional[str]) -> str:
    """One prompt sentence when passages mix the query language with others; else ``""``."""
    if not lang or not enabled() or len(metas) < 2:
        return ""
    langs = [chunk_language(docs[i] if i < len(docs) else None, m) for i, m in enumerate(metas)]
    if not _is_mixed(langs, lang):
        return ""
    from .language_config import resolve_language_name

    name = resolve_language_name(lang)
    return (
        f" SOURCE LANGUAGE: When passages in different languages state the same fact, "
        f"use and cite the passage written in {name}."
    )


def query_language_from_result(result: Any) -> Optional[str]:
    """``query_language`` of a RAG result (top level, else its retrieval_meta)."""
    if not isinstance(result, dict):
        return None
    if result.get("query_language"):
        return normalize_lang_code(result.get("query_language"))
    meta = result.get("retrieval_meta")
    return normalize_lang_code(meta.get("query_language")) if isinstance(meta, dict) else None
