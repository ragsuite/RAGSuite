"""Shared rules for when chat/search should omit citation sources from responses."""
from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Tuple

OUT_OF_CONTEXT_PHRASE = "out of the context of the provided documents"
OOC_SENTINEL = "QUERY_OUT_OF_CONTEXT"
PRIVACY_BLOCK_MSG = (
    "I cannot share sensitive personal or financial details from uploaded documents."
)

NOT_IN_DOCS_PHRASES: Tuple[str, ...] = (
    "do not mention",
    "does not mention",
    "don't mention",
    "not mentioned in",
    "not referenced in",
    "is not referenced",
    "not in the provided",
    "not in my documents",
    "not in your documents",
    "not found in the provided",
    "no mention of",
)

INSUFFICIENT_INFO_PHRASES: Tuple[str, ...] = (
    "don't have enough information",
    "do not have enough information",
    "not have enough information",
    "cannot provide an answer",
    "can't provide an answer",
    "unable to provide an answer",
    "cannot answer based on",
    "can't answer based on",
    "unable to answer based on",
    "no relevant information",
    "information is not available",
    "couldn't find this information",
    "could not find this information",
    "cannot find this information",
    "can't find this information",
    "not found in the available knowledge base",
    "keine antwort geben",
    "auf der grundlage der verfügbaren informationen keine",
    "nicht genug informationen",
    "nicht über genügend informationen",
)

_CUSTOM_OOC_PATTERNS = (
    r"respond\s+exactly\s+with:\s*['\"]([^'\"]+)['\"]",
    r"reply\s+exactly\s+with:\s*['\"]([^'\"]+)['\"]",
    r"respond\s+with:\s*['\"]([^'\"]+)['\"]",
)


def _normalize_compare_text(text: str) -> str:
    return " ".join((text or "").lower().split())


def extract_custom_ooc_reply(system_prompt: Optional[str]) -> Optional[str]:
    """Best-effort extraction of explicit out-of-context reply from a system prompt."""
    if not (system_prompt or "").strip():
        return None
    for pattern in _CUSTOM_OOC_PATTERNS:
        match = re.search(pattern, system_prompt, flags=re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1).strip()
    return None


_PURE_REFUSAL_MAX_LEN = 320  # answers longer than this are substantive, not pure refusals


def should_omit_sources_for_answer(
    answer: Optional[str],
    *,
    system_prompt: Optional[str] = None,
    treat_empty_as_omit: bool = True,
) -> bool:
    """
    Return True when citation sources should be hidden (chat + search parity).

    Hedge phrases like "does not mention" or "no relevant information" only suppress
    sources when the answer is short (pure refusal).  Substantive answers that happen
    to include a caveat clause still show sources.
    """
    text = (answer or "").strip()
    if not text:
        return treat_empty_as_omit

    lower = text.lower()

    # Hard stops — always suppress, regardless of length.
    if OUT_OF_CONTEXT_PHRASE in lower or "out of the context" in lower:
        return True
    if OOC_SENTINEL in text:
        return True
    if "llm failed to respond" in lower:
        return True
    if text.strip() == PRIVACY_BLOCK_MSG:
        return True

    # Soft stops — suppress only when the answer is a short pure-refusal.
    # Long answers with these phrases are hedged substantive responses; show sources.
    is_short_answer = len(text) <= _PURE_REFUSAL_MAX_LEN
    if is_short_answer:
        if any(phrase in lower for phrase in NOT_IN_DOCS_PHRASES):
            return True
        if any(phrase in lower for phrase in INSUFFICIENT_INFO_PHRASES):
            return True

    if system_prompt:
        custom = extract_custom_ooc_reply(system_prompt)
        if custom:
            norm_answer = _normalize_compare_text(text)
            norm_custom = _normalize_compare_text(custom)
            if norm_answer == norm_custom or norm_custom in norm_answer:
                return True

    return False


# --- Source↔chunk relevance (chat + search parity) ---

SOURCE_OVERLAP_STOPWORDS = frozenset(
    {
        "about", "after", "again", "also", "been", "before", "being", "below",
        "between", "both", "could", "does", "doing", "done", "each", "from",
        "further", "had", "has", "have", "here", "into", "just", "like",
        "made", "make", "many", "more", "most", "much", "must", "only",
        "other", "over", "same", "shall", "should", "some", "such", "than",
        "that", "the", "their", "them", "then", "there", "these", "they",
        "this", "those", "through", "under", "until", "very", "was", "were",
        "what", "when", "where", "which", "while", "will", "with", "would",
        "your", "http", "https", "www", "com", "org", "html",
        "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
        "by", "as", "is", "are", "be", "it", "its", "we", "our", "you",
        "locate", "located", "location",
    }
)

_QUERY_ANCHOR_MIN_LEN = 5
_ANCHOR_MATCH_SIMILARITY_FLOOR = 10

_GEOGRAPHIC_LOCATION_QUERY_RE = re.compile(
    r"(?i)\b(where|wo)\b.{0,100}\b("
    r"located|location|gelegen|liegt|ansässig|ansassig|based|"
    r"headquarter|headquarters|hq|office|standort|adresse|address"
    r")\b"
    r"|\b("
    r"headquarter|headquarters|hq|office location|company location|"
    r"standort|adresse|registered office|corporate office"
    r")\b"
)

# Chunks cited for location questions must show place/address evidence — not mere brand mentions.
_LOCATION_EVIDENCE_RE = re.compile(
    r"(?i)(?:"
    r"\b("
    r"located|location|headquarter|headquarters|\bhq\b|office|address|adresse|"
    r"standort|ansässig|ansassig|gelegen|"
    r"street|straße|strasse|road|avenue|pincode|postal|zip"
    r")\b"
    r"|\bagency in\b|\bcompany in\b|\bfounded in\b|\bco-founded\b|\bbased in\b"
    r"|\b\d{5,6}\b"
    r")"
)


def sources_require_overlap_enabled() -> bool:
    raw = (os.environ.get("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def sources_min_overlap_hits() -> int:
    raw = os.environ.get("CHAT_SOURCES_MIN_OVERLAP_HITS", "2")
    try:
        value = int(str(raw).strip() or "2")
    except ValueError:
        return 2
    return max(1, min(10, value))


def source_overlap_tokens(
    text: Optional[str],
    *,
    min_len: int = 4,
    max_tokens: int = 48,
) -> List[str]:
    """Distinct content tokens for source relevance checks."""
    if not (text or "").strip():
        return []
    normalized = re.sub(r"[`#*_~\[\]()|]", " ", (text or "").lower())
    found = re.findall(rf"[\w]{{{min_len},}}", normalized, flags=re.UNICODE)
    out: List[str] = []
    seen: set = set()
    for word in found:
        if word in SOURCE_OVERLAP_STOPWORDS:
            continue
        if word.isdigit() and len(word) < 4:
            continue
        if word not in seen:
            seen.add(word)
            out.append(word)
        if len(out) >= max_tokens:
            break
    return out


def chunk_source_haystack(chunk_text: Any, meta: Optional[Dict[str, Any]] = None) -> str:
    """Searchable text for overlap: chunk body plus URL/title metadata."""
    parts = [str(chunk_text or "")]
    if isinstance(meta, dict):
        parts.extend(
            [
                str(meta.get("url") or ""),
                str(meta.get("title") or ""),
                str(meta.get("source_file") or ""),
            ]
        )
    return " ".join(parts).lower()


def _token_in_haystack(token: str, haystack: str) -> bool:
    """Whole-token match — avoids 'tech' matching inside 'technology'."""
    if not token or not haystack:
        return False
    return bool(
        re.search(rf"\b{re.escape(token)}\b", haystack, flags=re.IGNORECASE | re.UNICODE)
    )


def _query_anchor_tokens(query_tokens: List[str]) -> List[str]:
    """Entity-like query tokens (e.g. 'nitsan') that must appear in a cited chunk."""
    return [token for token in query_tokens if len(token) >= _QUERY_ANCHOR_MIN_LEN]


def query_anchor_hit_count(user_query: Optional[str], haystack: str) -> int:
    query_tokens = source_overlap_tokens(user_query)
    anchors = _query_anchor_tokens(query_tokens)
    if anchors:
        return sum(1 for token in anchors if _token_in_haystack(token, haystack))
    return sum(1 for token in query_tokens if _token_in_haystack(token, haystack))


def chunk_has_query_anchor_match(user_query: Optional[str], haystack: str) -> bool:
    return query_anchor_hit_count(user_query, haystack) > 0


def effective_source_similarity_floor(
    base_floor_pct: int,
    *,
    user_query: Optional[str],
    haystack: str,
) -> int:
    """
    Relax the similarity floor for chunks that clearly match the query entity.
    Keeps irrelevant weak chunks out while still surfacing the right document.
    """
    if base_floor_pct <= 0:
        return 0
    if chunk_has_query_anchor_match(user_query, haystack):
        return min(base_floor_pct, _ANCHOR_MATCH_SIMILARITY_FLOOR)
    return base_floor_pct


def user_query_asks_geographic_location(user_query: Optional[str]) -> bool:
    """True for HQ / where-is-X-located style questions (Sources need place evidence)."""
    q = (user_query or "").strip()
    if not q:
        return False
    return bool(_GEOGRAPHIC_LOCATION_QUERY_RE.search(q))


def chunk_has_location_evidence(haystack: str) -> bool:
    """True when chunk text/metadata looks like it states a place or address."""
    return bool(_LOCATION_EVIDENCE_RE.search(haystack or ""))


def chunk_passes_source_relevance(
    chunk_text: Any,
    meta: Optional[Dict[str, Any]],
    *,
    answer: Optional[str] = None,
    user_query: Optional[str] = None,
    min_overlap_hits: Optional[int] = None,
    enabled: Optional[bool] = None,
) -> bool:
    """
    Gate source cards on query relevance (primary) and answer overlap (fallback).

    When the user query has entity tokens (len >= 5), at least one must appear in the
    chunk text or metadata URL/title. Generic assistant wording alone cannot qualify
    unrelated pages (e.g. typing.com for a NITSAN question).

    For geographic location questions, also require place/address evidence in the chunk
    so unrelated brand pages are not listed as Sources.
    """
    if enabled is None:
        enabled = sources_require_overlap_enabled()
    if not enabled:
        return True

    haystack = chunk_source_haystack(chunk_text, meta)
    query_tokens = source_overlap_tokens(user_query)
    answer_tokens = source_overlap_tokens(answer)
    need = sources_min_overlap_hits() if min_overlap_hits is None else min_overlap_hits

    if query_tokens:
        anchors = _query_anchor_tokens(query_tokens)
        if anchors:
            if not any(_token_in_haystack(token, haystack) for token in anchors):
                return False
        else:
            required = min(need, len(query_tokens))
            if sum(1 for token in query_tokens if _token_in_haystack(token, haystack)) < required:
                return False
        if user_query_asks_geographic_location(user_query) and not chunk_has_location_evidence(
            haystack
        ):
            return False
        return True

    if answer_tokens:
        required = min(need, len(answer_tokens))
        if sum(1 for token in answer_tokens if _token_in_haystack(token, haystack)) < required:
            return False

    return True
