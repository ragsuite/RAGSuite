"""Route queries that name a trained source (site or document) to that source's chunks.

A per-project registry maps distinctive phrases taken from crawl source names, base-URL
host labels and uploaded document titles to the ``document_id`` values stored in Chroma
chunk metadata (crawl chunks store the crawl source id there). Retrieval runs an extra
scoped query for matched sources and ranks their chunks first, so a small site named in
the question is not crowded out by large unrelated sites.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
import uuid
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 300.0
_MAX_ROUTED_SOURCES = 3
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
_CRAWL_SOURCE_FILE_PREFIX = "crawl_source_"
_CRAWL_SOURCE_FILE_RE = re.compile(r"crawl_source_([0-9a-fA-F-]{36})")

_GENERIC_TOKENS = frozenset(
    {
        # URL / web noise
        "www", "http", "https", "com", "net", "org", "de", "io", "ai", "co", "uk", "eu", "info",
        "html", "php", "index", "sitemap", "xml", "type", "pages", "page", "site", "website",
        "web", "home", "online", "shop", "store", "blog", "app", "en", "fr", "es", "it",
        # Legal forms
        "gmbh", "ag", "kg", "ug", "ltd", "llc", "inc", "corp", "plc", "sa", "ev", "co",
        # Provider / admin annotations in source names
        "mistral", "openai", "gemini", "ollama", "jina", "cohere", "voyage", "test",
        "providertest", "provider", "crawl", "source", "domain", "copy", "new", "old", "prod",
        "stage", "staging", "dev", "demo", "docs", "doc", "file", "pdf", "docx", "pptx", "xlsx",
        # Generic query words that must never select a source on their own
        "the", "and", "for", "what", "who", "how", "does", "which", "about", "company",
        "services", "service", "products", "product", "contact", "team", "news", "report",
    }
)

_registry_cache: Dict[str, Tuple[float, Dict[str, Set[str]], Dict[str, str]]] = {}
_registry_lock = threading.Lock()


def _enabled() -> bool:
    raw = (os.environ.get("RAG_SOURCE_ROUTING_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _tokens(text: str) -> List[str]:
    return _TOKEN_RE.findall((text or "").lower())


def _phrases_from_tokens(tokens: List[str], *, min_single_len: int) -> Set[str]:
    """Distinctive single tokens plus the spaced and joined forms of the whole phrase."""
    kept = [t for t in tokens if t not in _GENERIC_TOKENS and not t.isdigit()]
    out: Set[str] = {t for t in kept if len(t) >= min_single_len}
    if len(kept) >= 2:
        out.add(" ".join(kept))
        out.add("".join(kept))
    return out


def host_phrases(base_url: str) -> Set[str]:
    """``https://www.rak-saar.de/x`` -> {"rak", "saar", "rak saar", "raksaar"}; also keeps "nitsan ai"."""
    host = (urlparse(base_url if "//" in (base_url or "") else f"//{base_url}").netloc or "").lower()
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    labels = [label for label in host.split(".") if label]
    if not labels:
        return set()
    core = labels[:-1] if len(labels) > 1 else labels
    if core and core[0] in {"www", "en", "de", "shop", "blog", "docs", "demo", "mailing"} and len(core) > 1:
        core = core[1:]
    out = _phrases_from_tokens(_tokens(" ".join(core)), min_single_len=3)
    full = [t for t in _tokens(host)]
    if len(full) >= 2 and full[0] not in _GENERIC_TOKENS:
        out.add(" ".join(full))
        out.add("".join(full))
    return out


def name_phrases(name: str) -> Set[str]:
    return _phrases_from_tokens(_tokens(name), min_single_len=4)


def title_phrases(title: str) -> Set[str]:
    stem = os.path.splitext(title or "")[0]
    tokens = _tokens(stem)
    phrases = _phrases_from_tokens(tokens, min_single_len=99)
    kept = [t for t in tokens if t not in _GENERIC_TOKENS]
    if len(kept) == 1 and len(kept[0]) >= 6:
        phrases.add(kept[0])
    return {p for p in phrases if len(p.replace(" ", "")) >= 5}


def _query_ngrams(query: str) -> List[Tuple[int, int, str]]:
    """``(start, end, phrase)`` for 3-, 2- then 1-token windows (spaced and joined forms)."""
    tokens = _tokens(query)
    grams: List[Tuple[int, int, str]] = []
    for n in (3, 2, 1):
        for i in range(len(tokens) - n + 1):
            window = tokens[i:i + n]
            grams.append((i, i + n, " ".join(window)))
            if n > 1:
                grams.append((i, i + n, "".join(window)))
    return grams


def _expand_prefix_ambiguity(phrase_map: Dict[str, Set[str]]) -> None:
    """A bare token that prefixes another source's token ("nitsan" ⊂ "nitsantech")
    names both sources — routing it to only one would bury the other."""
    singles = [p for p in phrase_map if " " not in p]
    for short in singles:
        if len(short) < 4:
            continue
        for other in singles:
            if other != short and other.startswith(short):
                phrase_map[short] = phrase_map[short] | phrase_map[other]


def build_registry(
    crawl_sources: List[Tuple[str, str, str]],
    documents: List[Tuple[str, str]],
) -> Tuple[Dict[str, Set[str]], Dict[str, str]]:
    """``(phrase -> document_ids, document_id -> host key)`` from (id, name, base_url)
    crawl sources and (id, title) uploaded documents."""
    phrase_map: Dict[str, Set[str]] = {}
    host_of: Dict[str, str] = {}
    for sid, name, base_url in crawl_sources:
        doc_id = str(sid)
        host_of[doc_id] = (urlparse(base_url or "").netloc or doc_id).lower().removeprefix("www.")
        for phrase in host_phrases(base_url or "") | name_phrases(name or ""):
            phrase_map.setdefault(phrase, set()).add(doc_id)
    for did, title in documents:
        doc_id = str(did)
        host_of[doc_id] = f"doc:{doc_id}"
        for phrase in title_phrases(title or ""):
            phrase_map.setdefault(phrase, set()).add(doc_id)
    _expand_prefix_ambiguity(phrase_map)
    return phrase_map, host_of


def _valid_project_uuid(project_id: Optional[str]) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(project_id))
    except (TypeError, ValueError):
        return None


def _load_registry(project_uuid: uuid.UUID) -> Tuple[Dict[str, Set[str]], Dict[str, str]]:
    """Return (phrase -> document_ids, document_id -> host key) for one project."""
    from ...db import SessionLocal
    from ...models import CrawlSource, UploadedDocument

    db = SessionLocal()
    try:
        crawl_sources = [
            (str(sid), name, base_url)
            for sid, name, base_url in db.query(
                CrawlSource.id, CrawlSource.name, CrawlSource.base_url
            ).filter(CrawlSource.project_id == project_uuid)
        ]
        documents = [
            (str(did), title)
            for did, title in db.query(UploadedDocument.id, UploadedDocument.title).filter(
                UploadedDocument.project_id == project_uuid
            )
        ]
    finally:
        db.close()
    return build_registry(crawl_sources, documents)


def _registry(project_uuid: uuid.UUID) -> Tuple[Dict[str, Set[str]], Dict[str, str]]:
    key = str(project_uuid)
    now = time.monotonic()
    with _registry_lock:
        cached = _registry_cache.get(key)
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1], cached[2]
    try:
        phrase_map, host_of = _load_registry(project_uuid)
    except Exception as exc:
        logger.debug("source routing registry unavailable for %s: %s", key, exc)
        phrase_map, host_of = {}, {}
    with _registry_lock:
        _registry_cache[key] = (now, phrase_map, host_of)
    return phrase_map, host_of


def chroma_where(source_ids: List[str], project_id: Optional[str] = None) -> Dict[str, object]:
    """Chroma filter for chunks of the given sources.

    Every crawl chunk keeps ``source_file = crawl_source_<source id>`` (older crawls also
    put the source id in ``document_id``, newer ones the page id). Uploaded documents use
    their own id as ``document_id``. With ``project_id`` the cached registry tells which
    ids are crawl sources vs documents, avoiding a slower ``$or`` when only one kind is
    routed; unknown ids match either field.
    """
    ids = [str(i) for i in source_ids]
    crawl_ids, doc_ids = ids, ids
    project_uuid = _valid_project_uuid(project_id)
    if project_uuid is not None:
        _phrases, host_of = _registry(project_uuid)
        known_docs = {i for i in ids if host_of.get(i, "").startswith("doc:")}
        known_crawl = {i for i in ids if i in host_of and i not in known_docs}
        unknown = [i for i in ids if i not in host_of]
        crawl_ids = sorted(known_crawl) + unknown
        doc_ids = sorted(known_docs) + unknown
    clauses: List[Dict[str, object]] = []
    if doc_ids:
        clauses.append({"document_id": {"$in": doc_ids}})
    if crawl_ids:
        clauses.append({"source_file": {"$in": [f"{_CRAWL_SOURCE_FILE_PREFIX}{i}" for i in crawl_ids]}})
    return clauses[0] if len(clauses) == 1 else {"$or": clauses}


def chunk_belongs_to(meta: object, source_ids: Set[str]) -> bool:
    """True when chunk metadata belongs to one of ``source_ids`` (see ``chroma_where``)."""
    if not source_ids or not isinstance(meta, dict):
        return False
    if str(meta.get("document_id") or "") in source_ids:
        return True
    if str(meta.get("crawl_source_id") or "") in source_ids:
        return True
    match = _CRAWL_SOURCE_FILE_RE.match(str(meta.get("source_file") or ""))
    return bool(match and match.group(1).lower() in source_ids)


def invalidate(project_id: Optional[str] = None) -> None:
    with _registry_lock:
        if project_id is None:
            _registry_cache.clear()
        else:
            _registry_cache.pop(str(project_id), None)


def match_source_ids(project_id: Optional[str], query: str) -> List[str]:
    """Document ids of sources the query names; empty when none or too ambiguous."""
    if not _enabled() or not (query or "").strip():
        return []
    project_uuid = _valid_project_uuid(project_id)
    if project_uuid is None:
        return []
    phrase_map, host_of = _registry(project_uuid)
    if not phrase_map:
        return []
    matched: Set[str] = set()
    covered: Set[int] = set()
    for start, end, gram in _query_ngrams(query):
        span = set(range(start, end))
        if span & covered:
            continue
        ids = phrase_map.get(gram)
        if ids:
            matched |= ids
            covered |= span
    if not matched:
        return []
    if len({host_of.get(d, d) for d in matched}) > _MAX_ROUTED_SOURCES:
        return []
    return sorted(d.lower() for d in matched)
