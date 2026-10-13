"""Deterministic retrieval decisions shared by Chat and Search.

* ``should_rerank``      — when the cross-encoder is worth its latency
* ``should_fallback``    — one retry with the unrewritten query on weak results
* ``evidence_sufficient`` — language-aware "do the passages support the question?"

All functions are pure; callers record the returned decisions in ``retrieval_meta``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import AbstractSet, Any, Dict, Iterable, List, Optional, Sequence

from .query_keywords import extract_keywords, keyword_language, match_forms

RERANK_MIN_CANDIDATES = 5
RERANK_CLEAR_TOP1_SIM = 0.75
RERANK_CLEAR_MARGIN = 0.10
FALLBACK_MIN_TOP1_SIM = 0.16
EVIDENCE_SEMANTIC_RESCUE_SIM = 0.55
_MIN_FORM_CHARS = 3
_RISKY_INTENTS = frozenset({"compare", "filter", "attribute"})
_TRANSPORT_FAILURES = frozenset({"vector_timeout"})


@dataclass(frozen=True)
class Decision:
    value: bool
    reason: str

    def to_meta(self) -> Dict[str, Any]:
        return {"value": self.value, "reason": self.reason}


@dataclass(frozen=True)
class EvidenceDecision:
    sufficient: bool
    reason: str
    matched_terms: List[str] = field(default_factory=list)

    def to_meta(self) -> Dict[str, Any]:
        return {"sufficient": self.sufficient, "reason": self.reason, "matched_terms": self.matched_terms[:5]}


def similarities_from_distances(distances: Iterable[Optional[float]]) -> List[float]:
    """Cosine similarities (descending) from Chroma distances; ``None`` entries skipped."""
    sims = [max(0.0, 1.0 - float(d)) for d in distances if d is not None]
    return sorted(sims, reverse=True)


def should_rerank(
    setting_enabled: bool,
    candidate_count: int,
    *,
    distances: Sequence[Optional[float]] = (),
    intent: Optional[str] = None,
    entity_count: int = 0,
    has_constraints: bool = False,
    min_candidates: int = RERANK_MIN_CANDIDATES,
) -> Decision:
    """Rerank only when enabled by the admin and likely to change the answer.

    Never turns reranking on when the project setting is off.
    """
    if not setting_enabled:
        return Decision(False, "disabled")
    if candidate_count <= 0:
        return Decision(False, "no_candidates")
    if candidate_count < min_candidates:
        return Decision(False, "low_candidates")
    if intent in _RISKY_INTENTS or has_constraints or entity_count >= 2:
        return Decision(True, "high_risk_query")
    sims = similarities_from_distances(distances)
    if len(sims) >= 2:
        margin = sims[0] - sims[1]
        if sims[0] >= RERANK_CLEAR_TOP1_SIM and margin >= RERANK_CLEAR_MARGIN:
            return Decision(False, "clear_top1")
        if margin < RERANK_CLEAR_MARGIN:
            return Decision(True, "close_scores")
    return Decision(True, "default")


def should_fallback(
    retrieval_meta: Optional[Dict[str, Any]],
    *,
    retrieval_query: str,
    original_query: str,
    result_count: int,
    already_retried: bool = False,
) -> Decision:
    """Retry retrieval once with the original (unrewritten) query on weak results.

    The retry reuses the same source scope, so a hard source filter still holds.
    """
    if already_retried:
        return Decision(False, "already_retried")
    if (retrieval_query or "").strip() == (original_query or "").strip():
        return Decision(False, "same_query")
    meta = retrieval_meta or {}
    if meta.get("fallback_reason") in _TRANSPORT_FAILURES:
        # Vector search timed out: top-1 similarity reads 0 although nothing was weak,
        # and a second full retrieval would hit the same slow store.
        return Decision(False, str(meta.get("fallback_reason")))
    if result_count <= 0:
        return Decision(True, "empty_pool")
    top1 = float(meta.get("top1_similarity") or 0) / 100.0
    if top1 < FALLBACK_MIN_TOP1_SIM:
        return Decision(True, "low_top1")
    return Decision(False, "confident")


def _context_hits(forms: Sequence[str], contexts: Sequence[str]) -> List[str]:
    lowered = [(c or "").lower() for c in contexts if c]
    return [f for f in forms if any(f in text for text in lowered)]


def evidence_sufficient(
    query: str,
    contexts: Sequence[str],
    *,
    lang: Optional[str] = None,
    top_similarity: Optional[float] = None,
    legacy_supported: Optional[bool] = None,
    ignore_terms: Optional[AbstractSet[str]] = None,
) -> EvidenceDecision:
    """True when the passages plausibly answer ``query``.

    Lexical support uses the question language's stop words and light stems, so
    function words in any shipped language never count as evidence.
    ``legacy_supported`` (the previous gate) is always honoured, so this gate never
    refuses more often than before; it only rescues (language-aware lexical hits,
    strong semantic match for cross-lingual questions). ``ignore_terms`` are
    generic site words ("services", "offer") that never count as evidence.
    """
    texts = [c for c in contexts if (c or "").strip()]
    if not texts:
        return EvidenceDecision(False, "no_contexts")
    q_lang = keyword_language(query, lang)
    keywords = [k for k in extract_keywords(query, q_lang) if not ignore_terms or k not in ignore_terms]
    forms = [f for f in match_forms(keywords, q_lang) if len(f) >= _MIN_FORM_CHARS]
    if forms:
        hits = _context_hits(forms, texts)
        if hits:
            return EvidenceDecision(True, "lexical", hits)
    if legacy_supported:
        return EvidenceDecision(True, "legacy_lexical")
    non_english = bool(q_lang) and q_lang != "en"
    if non_english and top_similarity is not None and top_similarity >= EVIDENCE_SEMANTIC_RESCUE_SIM:
        return EvidenceDecision(True, "semantic")
    return EvidenceDecision(False, "no_query_terms" if not forms else "no_lexical_support")
