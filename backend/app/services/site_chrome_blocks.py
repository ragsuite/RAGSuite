"""Site header / footer ("chrome") blocks for crawl sources.

The site header and footer are always removed from page text. When a source
opts in (``index_site_header`` / ``index_site_footer``), each *unique* block is
saved once as its own crawl Document, so shared chrome is never embedded once
per page.
"""
from __future__ import annotations

import hashlib
import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urlparse

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Document
from .html_text_utils import enrich_contact_links

logger = logging.getLogger(__name__)

SITE_HEADER = "site_header"
SITE_FOOTER = "site_footer"
SITE_BLOCK_KINDS: Tuple[str, str] = (SITE_HEADER, SITE_FOOTER)

MIN_BLOCK_CHARS = 20

_CONTENT_ANCESTORS = ["main", "article", "section", "aside"]
_NOISE_TAGS = ["script", "style", "noscript", "template", "svg"]

_KIND_SELECTORS: Dict[str, Tuple[List[str], List[str]]] = {
    SITE_HEADER: (
        ["header", "[role=banner]"],
        ["#header", "#site-header", ".site-header", "#masthead"],
    ),
    SITE_FOOTER: (
        ["footer", "[role=contentinfo]"],
        ["#footer", "#site-footer", ".site-footer", "#colophon"],
    ),
}

_KIND_LABELS = {SITE_HEADER: "Site header", SITE_FOOTER: "Site footer"}
_KIND_SLUGS = {SITE_HEADER: "site-header", SITE_FOOTER: "site-footer"}


def enabled_site_block_kinds(index_header: bool, index_footer: bool) -> frozenset:
    kinds = set()
    if index_header:
        kinds.add(SITE_HEADER)
    if index_footer:
        kinds.add(SITE_FOOTER)
    return frozenset(kinds)


def normalize_block_text(text: str) -> str:
    return " ".join((text or "").split())


def block_hash(text: str) -> str:
    return hashlib.sha256(normalize_block_text(text).lower().encode("utf-8")).hexdigest()


def _outermost(nodes: list) -> list:
    picked = []
    ids = {id(n) for n in nodes}
    for node in nodes:
        if any(id(parent) in ids for parent in node.parents):
            continue
        picked.append(node)
    return picked


def _site_nodes(soup, kind: str) -> list:
    semantic, fallback = _KIND_SELECTORS[kind]
    for selectors in (semantic, fallback):
        try:
            found = soup.select(", ".join(selectors))
        except Exception:
            continue
        top_level = [n for n in found if n.find_parent(_CONTENT_ANCESTORS) is None]
        if top_level:
            return _outermost(top_level)
    return []


def _block_text(nodes: list) -> str:
    parts = []
    for node in nodes:
        for noise in node(_NOISE_TAGS):
            noise.decompose()
        enrich_contact_links(node)
        parts.append(node.get_text(" "))
    return normalize_block_text(" ".join(parts))


@dataclass
class SiteBlockExtraction:
    blocks: Dict[str, str]
    detached: Dict[str, list]

    def detached_links(self, kind: str) -> list:
        tags: list = []
        for node in self.detached.get(kind, []):
            tags.extend(node.find_all(["a", "link", "area"], href=True))
        return tags


def extract_site_blocks(soup, *, want_header: bool, want_footer: bool) -> SiteBlockExtraction:
    """Detach the site header/footer from ``soup``; return text for the wanted kinds.

    Mutates ``soup`` so page text extracted afterwards never contains them. The
    detached nodes stay intact so callers can still discover their links.
    """
    wanted = enabled_site_block_kinds(want_header, want_footer)
    blocks: Dict[str, str] = {}
    detached: Dict[str, list] = {}
    for kind in SITE_BLOCK_KINDS:
        nodes = _site_nodes(soup, kind)
        if not nodes:
            continue
        for node in nodes:
            node.extract()
        detached[kind] = nodes
        if kind in wanted:
            text = _block_text(nodes)
            if len(text) >= MIN_BLOCK_CHARS:
                blocks[kind] = text
    return SiteBlockExtraction(blocks=blocks, detached=detached)


@dataclass(frozen=True)
class SiteBlock:
    kind: str
    content_hash: str
    text: str
    first_seen_url: str


class SiteBlockRegistry:
    """Unique site blocks seen during one crawl run (thread-safe)."""

    def __init__(self, enabled_kinds: Iterable[str]):
        self.enabled_kinds = frozenset(enabled_kinds)
        self._lock = threading.Lock()
        self._seen: Dict[Tuple[str, str], SiteBlock] = {}

    def claim(self, kind: str, text: str, page_url: str) -> Optional[SiteBlock]:
        """Record a block; returns it only the first time its content is seen."""
        if kind not in self.enabled_kinds:
            return None
        normalized = normalize_block_text(text)
        if len(normalized) < MIN_BLOCK_CHARS:
            return None
        key = (kind, block_hash(normalized))
        with self._lock:
            if key in self._seen:
                return None
            block = SiteBlock(kind=kind, content_hash=key[1], text=normalized, first_seen_url=page_url)
            self._seen[key] = block
            return block

    def seen_hashes(self, kind: str) -> Set[str]:
        with self._lock:
            return {h for (k, h) in self._seen if k == kind}


def site_block_url(block: SiteBlock) -> str:
    parsed = urlparse(block.first_seen_url)
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
    return f"{origin}/#{_KIND_SLUGS[block.kind]}-{block.content_hash[:16]}"


def build_site_block_document(source_id: uuid.UUID, block: SiteBlock) -> dict:
    """Document payload in the same shape the crawler batches for pages."""
    host = urlparse(block.first_seen_url).netloc
    now = datetime.now(timezone.utc)
    return {
        "id": uuid.uuid4(),
        "source_id": source_id,
        "url": site_block_url(block),
        "title": f"{_KIND_LABELS[block.kind]} · {host}" if host else _KIND_LABELS[block.kind],
        "text_content": block.text,
        "meta_data": {
            "content_kind": block.kind,
            "content_hash": block.content_hash,
            "first_seen_url": block.first_seen_url,
            "crawled_at": now.isoformat(),
        },
        "indexed_at": now,
    }


def is_site_block_document(doc) -> bool:
    return (getattr(doc, "meta_data", None) or {}).get("content_kind") in SITE_BLOCK_KINDS


def count_site_block_payloads(docs: Iterable[dict]) -> int:
    return sum(1 for d in docs if (d.get("meta_data") or {}).get("content_kind") in SITE_BLOCK_KINDS)


def site_block_display_url(doc) -> str:
    """Citation URL: the page a block was first seen on, not its synthetic fragment URL."""
    if is_site_block_document(doc):
        return (doc.meta_data or {}).get("first_seen_url") or doc.url
    return doc.url


def _content_kind_column():
    return func.coalesce(Document.meta_data["content_kind"].as_string(), "")


def site_block_document_clause():
    """SQL filter matching site header/footer block documents."""
    return _content_kind_column().in_(SITE_BLOCK_KINDS)


def page_document_clause():
    """SQL filter matching crawled pages only; blocks train with the source but are not pages."""
    return _content_kind_column().notin_(SITE_BLOCK_KINDS)


def prune_stale_site_block_documents(
    db: Session, source_id: uuid.UUID, registry: SiteBlockRegistry
) -> int:
    """Delete block docs for disabled kinds, or whose content was not seen this run.

    A kind with no blocks seen this run is left untouched (e.g. pages failed to load).
    """
    docs = (
        db.query(Document)
        .filter(Document.source_id == source_id, site_block_document_clause())
        .all()
    )
    stale = []
    for doc in docs:
        meta = doc.meta_data or {}
        kind = meta.get("content_kind")
        if kind not in registry.enabled_kinds:
            stale.append(doc)
            continue
        seen = registry.seen_hashes(kind)
        if seen and meta.get("content_hash") not in seen:
            stale.append(doc)
    if not stale:
        return 0

    from .rag.singleton import locked_delete_document_embeddings

    removed = 0
    for doc in stale:
        try:
            locked_delete_document_embeddings(str(doc.id))
        except Exception as exc:
            logger.warning("Site block %s vectors not deleted; keeping row for retry: %s", doc.id, exc)
            continue
        db.delete(doc)
        removed += 1
    db.commit()
    if removed:
        logger.info("Pruned %d stale site header/footer document(s) for source %s", removed, source_id)
    return removed
