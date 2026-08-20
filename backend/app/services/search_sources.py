"""Build search result source cards from RAG retrieval contexts."""
from __future__ import annotations

import logging
import os
import re
import uuid
from urllib.parse import urljoin, urlsplit, urlunsplit
from typing import Any, Dict, List, Optional, Set

from .rag.source_display_config import display_sources_min_chunk_similarity_pct
from .document_content_urls import document_content_api_path
from .source_display_policy import (
    chunk_passes_source_relevance,
    chunk_source_haystack,
    effective_source_similarity_floor,
    query_anchor_hit_count,
    should_omit_sources_for_answer,
)
from .source_display_titles import clean_doc_title

logger = logging.getLogger(__name__)

_SOURCE_FILE_UUID_PREFIX_RE = re.compile(
    r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_",
    re.IGNORECASE,
)
_DOCUMENT_CONTENT_URL_RE = re.compile(
    r"^/api/v1/documents/([0-9a-f-]{36})/content/?$",
    re.IGNORECASE,
)


def _chunk_similarity_meets_display_floor(
    idx: int,
    chunk_similarity_pct: Any,
    floor_pct: int,
) -> bool:
    if floor_pct <= 0:
        return True
    if (
        not isinstance(chunk_similarity_pct, list)
        or idx < 0
        or idx >= len(chunk_similarity_pct)
    ):
        return False
    val = chunk_similarity_pct[idx]
    try:
        vi = int(val)
    except (TypeError, ValueError):
        return False
    return vi >= floor_pct


def _chunk_references_live_item(meta: Any, live_item_ids: Optional[Set[str]]) -> bool:
    if live_item_ids is None:
        return True
    if not isinstance(meta, dict):
        return False
    for key in ("document_id", "crawl_source_id", "source_id"):
        val = meta.get(key)
        if val and str(val).strip() and str(val) in live_item_ids:
            return True
    source_file = str(meta.get("source_file") or "")
    if source_file.startswith("crawl_source_"):
        crawl_id = source_file[len("crawl_source_"):]
        if crawl_id in live_item_ids:
            return True
    return False


def _chunk_similarity_score(idx: int, chunk_similarity_pct: Any) -> int:
    if isinstance(chunk_similarity_pct, list) and 0 <= idx < len(chunk_similarity_pct):
        try:
            return int(chunk_similarity_pct[idx])
        except (TypeError, ValueError):
            pass
    return max(0, 100 - idx)


def _resolve_document_uuid(meta: Dict[str, Any]) -> Optional[str]:
    """Resolve ingest document UUID from trusted metadata only."""
    source_type = str(meta.get("source_type") or "").strip().lower()
    source_file = str(meta.get("source_file") or "").strip()
    source_file_name = os.path.basename(source_file).lower()

    # Crawl chunks store crawl_source_id in `document_id`; this is not an UploadedDocument id.
    if source_type == "crawl" or source_file_name.startswith("crawl_source_"):
        return None

    doc_id = meta.get("document_id")
    if doc_id is not None:
        doc_s = str(doc_id).strip()
        if doc_s and doc_s.lower() != "unknown":
            try:
                return str(uuid.UUID(doc_s)).lower()
            except (ValueError, TypeError):
                pass

    if source_file:
        basename = os.path.basename(source_file)
        match = _SOURCE_FILE_UUID_PREFIX_RE.match(basename)
        if match:
            try:
                return str(uuid.UUID(match.group(1))).lower()
            except (ValueError, TypeError):
                pass

    return None


def _absolutize_image_url(image: str, page_url: str) -> str:
    """Resolve relative/protocol-relative OG image URLs against the page URL."""
    image = (image or "").strip()
    if not image:
        return ""
    if image.startswith(("http://", "https://", "data:")):
        return image
    page = (page_url or "").strip()
    if page.startswith(("http://", "https://")):
        return urljoin(page, image)
    return image


def _citation_from_meta(meta: Dict[str, Any], idx: int) -> Optional[Dict[str, str]]:
    """
    Build one source card from chunk metadata — parity with chat _citation_from_chunk_meta.
    Title + URL only; no per-chunk snippet.
    """
    url = (meta.get("url") or "").strip()
    source_file = meta.get("source_file", "") or ""
    is_pdf = str(source_file).lower().endswith(".pdf")
    is_office_upload = str(source_file).lower().endswith(
        (".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".rtf", ".txt", ".md")
    )
    resolved_uuid = _resolve_document_uuid(meta)

    citation_url = ""
    if is_pdf or is_office_upload or resolved_uuid:
        citation_url = (document_content_api_path(resolved_uuid) or "").strip()
        if not citation_url and url.startswith(("http://", "https://")):
            citation_url = url
        elif not citation_url and url:
            try:
                citation_url = (document_content_api_path(str(uuid.UUID(url)).lower()) or "").strip()
            except (ValueError, TypeError):
                citation_url = url
    else:
        citation_url = url

    if not citation_url:
        return None

    meta_title = meta.get("title", "") or ""
    raw_title = meta_title or (os.path.basename(source_file) if source_file else "")
    display_title = (
        clean_doc_title(raw_title, strip_extension=True)
        if raw_title
        else f"Source {idx + 1}"
    )
    page_for_image = url if url.startswith(("http://", "https://")) else citation_url
    image = _absolutize_image_url((meta.get("og_image") or "").strip(), page_for_image)
    return {
        "title": display_title,
        "url": citation_url,
        "snippet": "",
        "image": image,
    }


def _url_dedup_key(citation_url: str, meta: Dict[str, Any]) -> str:
    """One card per document: UUID from metadata/filename, else normalized URL."""
    resolved_uuid = _resolve_document_uuid(meta)
    if resolved_uuid:
        return f"doc:{resolved_uuid}"
    url_match = _DOCUMENT_CONTENT_URL_RE.match((citation_url or "").strip())
    if url_match:
        return f"doc:{url_match.group(1).lower()}"

    normalized = (citation_url or "").strip()
    if normalized.startswith(("http://", "https://")):
        try:
            parts = urlsplit(normalized)
            # For crawl pages, fragments are in-page anchors; they should not create
            # separate source cards.
            normalized = urlunsplit(
                (
                    parts.scheme.lower(),
                    parts.netloc.lower(),
                    parts.path,
                    parts.query,
                    "",
                )
            )
        except Exception:
            pass
    normalized = normalized.rstrip("/").lower()
    return f"url:{normalized}" if normalized else f"url:{citation_url}"


def build_search_sources_from_contexts(
    raw_contexts: List[Any],
    raw_contexts_metadatas: List[Any],
    raw_chunk_sim: Any,
    *,
    top_k: int,
    answer: Optional[str] = None,
    user_query: Optional[str] = None,
    live_item_ids: Optional[Set[str]] = None,
    system_prompt: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Build search source cards — chat-style: unique URL/document, title + link only."""
    if should_omit_sources_for_answer(answer, system_prompt=system_prompt):
        return []

    sim_floor = display_sources_min_chunk_similarity_pct()
    candidates: List[Dict[str, Any]] = []

    for idx, ctx in enumerate(raw_contexts):
        meta = raw_contexts_metadatas[idx] if idx < len(raw_contexts_metadatas) else {}
        if not isinstance(meta, dict):
            meta = {}

        cleaned_ctx = re.sub(r"\[Document\s+\d+.*?\]", "", str(ctx or ""))
        cleaned_ctx = re.sub(r"CITE:\d+", "", cleaned_ctx).strip()
        if not chunk_passes_source_relevance(
            cleaned_ctx,
            meta,
            answer=answer,
            user_query=user_query,
        ):
            continue

        haystack = chunk_source_haystack(cleaned_ctx, meta)
        chunk_floor = effective_source_similarity_floor(
            sim_floor,
            user_query=user_query,
            haystack=haystack,
        )
        if not _chunk_similarity_meets_display_floor(idx, raw_chunk_sim, chunk_floor):
            continue
        if not _chunk_references_live_item(meta, live_item_ids):
            continue

        citation = _citation_from_meta(meta, idx)
        if not citation:
            continue

        candidates.append(
            {
                "source": citation,
                "score": _chunk_similarity_score(idx, raw_chunk_sim),
                "idx": idx,
                "dedup_key": _url_dedup_key(citation["url"], meta),
                "anchor_hits": query_anchor_hit_count(user_query, haystack),
            }
        )

    candidates.sort(
        key=lambda c: (-int(c["anchor_hits"]), -int(c["score"]), int(c["idx"]))
    )

    sources: List[Dict[str, Any]] = []
    seen_keys: set = set()
    for candidate in candidates:
        dedup_key = candidate["dedup_key"]
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)
        sources.append(candidate["source"])
        if len(sources) >= top_k:
            break

    logger.debug("Built %d search sources (requested top_k=%d)", len(sources), top_k)
    return sources
