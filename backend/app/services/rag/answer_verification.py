"""Deterministic answer verification for risky queries (no extra LLM call to judge).

Checks, in order:
* the answer is not empty;
* every price in the answer appears in the passages (or in the question, or is
  the difference of two passage prices — comparisons);
* plain figures are mostly found in the passages;
* cited passages belong to the hard source scope, when one is active;
* geographic answers only name places that appear in the passages.

Runs only for risky queries (numbers/prices, compare/filter/attribute intents,
low confidence, multi-source). Callers regenerate at most once with
``strict_instruction`` and otherwise fall back to ``redact_unsupported``.
Controlled by ``RAG_ANSWER_VERIFY`` (default on).
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set

from . import source_routing
from .constraint_boost import parse_amount

LOW_CONFIDENCE_PCT = 45
MAX_UNSUPPORTED_PLAIN = 2
_MIN_PLAIN_VALUE = 10.0
_MAX_CONTEXT_PRICES = 200
_CUR = r"(?:₹|\$|€|£|¥|rs\.?|inr|usd|eur|gbp)"
_AMOUNT = r"\d[\d.,]*\d|\d"
_PRICE_RX = re.compile(
    rf"(?P<cur1>{_CUR})\s*(?P<a1>{_AMOUNT})|(?P<a2>{_AMOUNT})\s*(?P<cur2>{_CUR}|rupees|euros?|dollars?)",
    re.IGNORECASE,
)
_NUMBER_RX = re.compile(rf"(?<![\w.]){_AMOUNT}(?![\w])")
_SENTENCE_SPLIT_RX = re.compile(r"(?<=[.!?。])\s+|\n+")
_TAG_RX = re.compile(r"<[^>]+>")
_PLACE_NAME = (
    r"(?-i:[A-ZÀ-ÖØ-Þ][\w'.-]*(?:\s+[A-ZÀ-ÖØ-Þ][\w'.-]*)*"
    r"(?:\s*,\s*[A-ZÀ-ÖØ-Þ][\w'.-]*)*)"
)
_PLACE_AFTER_IN_RX = re.compile(
    r"(?i)\b(?:located|based|headquarter(?:ed|s)?|\bhq\b|office|ansässig|ansassig|gelegen|liegt)\s+"
    rf"(?:in|im|at)\s+({_PLACE_NAME})"
)
_IS_IN_PLACE_RX = re.compile(
    rf"(?i)\b(?:is|are|ist|sind)\s+in\s+({_PLACE_NAME})"
)
_PLACE_TOKEN_STOP = frozenset(
    {
        "a", "an", "and", "are", "based", "das", "der", "die", "headquarters",
        "hq", "in", "im", "is", "located", "office", "of", "or", "the",
    }
)


@dataclass
class VerificationResult:
    checked: bool
    passed: bool = True
    reason: str = "ok"
    unsupported_prices: List[str] = field(default_factory=list)
    unsupported_numbers: List[str] = field(default_factory=list)
    unsupported_places: List[str] = field(default_factory=list)
    regenerated: bool = False
    redacted: bool = False

    @property
    def unsupported(self) -> List[str]:
        return self.unsupported_prices + self.unsupported_numbers + self.unsupported_places

    def to_meta(self) -> Dict[str, Any]:
        return {
            "checked": self.checked,
            "passed": self.passed,
            "reason": self.reason,
            "unsupported": self.unsupported[:6],
            "regenerated": self.regenerated,
            "redacted": self.redacted,
        }


def is_enabled() -> bool:
    raw = (os.environ.get("RAG_ANSWER_VERIFY") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def should_verify(
    processed_query: Any,
    retrieval_meta: Optional[Dict[str, Any]],
    query: Optional[str] = None,
) -> Optional[str]:
    """Reason to verify, or ``None`` when the query is low-risk."""
    if not is_enabled():
        return None
    meta = retrieval_meta or {}
    if processed_query is not None:
        if processed_query.is_high_risk:
            return f"intent:{processed_query.intent}"
        if re.search(r"(?<![^\W\d_])\d", processed_query.processed or ""):
            return "numeric_query"
    if meta.get("hard_source_ids"):
        return "hard_source"
    conf = meta.get("confidence_score")
    if isinstance(conf, (int, float)) and 0 < conf < LOW_CONFIDENCE_PCT:
        return "low_confidence"
    from ..source_display_policy import user_query_asks_geographic_location

    asked = query or (getattr(processed_query, "original", None) or "")
    if user_query_asks_geographic_location(asked):
        return "geographic"
    return None


def _fmt(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.2f}".rstrip("0").rstrip(".")


def _plain_text(text: str) -> str:
    return _TAG_RX.sub(" ", text or "")


def extract_place_spans(answer: str) -> List[str]:
    """City/region phrases the answer claims after located/based/is-in."""
    text = _plain_text(answer)
    spans: List[str] = []
    seen: Set[str] = set()
    for pattern in (_PLACE_AFTER_IN_RX, _IS_IN_PLACE_RX):
        for match in pattern.finditer(text):
            span = (match.group(1) or "").strip(" .,")
            key = span.lower()
            if span and key not in seen:
                seen.add(key)
                spans.append(span)
    return spans


def _place_supported(span: str, context_lower: str) -> bool:
    tokens = [
        token
        for token in re.findall(r"[\w]{3,}", span.lower(), flags=re.UNICODE)
        if token not in _PLACE_TOKEN_STOP
    ]
    if not tokens:
        return True
    return all(re.search(rf"\b{re.escape(token)}\b", context_lower) for token in tokens)


def _prices(text: str) -> List[float]:
    out: List[float] = []
    for m in _PRICE_RX.finditer(text):
        value = parse_amount(m.group("a1") or m.group("a2") or "")
        if value is not None:
            out.append(value)
    return out


def _numbers(text: str) -> Set[float]:
    values: Set[float] = set()
    for m in _NUMBER_RX.finditer(text):
        value = parse_amount(m.group(0))
        if value is not None:
            values.add(round(value, 2))
    return values


def _supported_price(value: float, known: Set[float], context_prices: Sequence[float]) -> bool:
    if round(value, 2) in known:
        return True
    prices = list(dict.fromkeys(round(p, 2) for p in context_prices))[:_MAX_CONTEXT_PRICES]
    for i, a in enumerate(prices):
        for b in prices[i + 1:]:
            if abs(abs(a - b) - value) < 0.01:
                return True
    return False


def _cross_source(cited_metas: Optional[Iterable[Any]], hard_ids: Optional[Sequence[str]]) -> bool:
    if not hard_ids or not cited_metas:
        return False
    scope = {str(i) for i in hard_ids}
    return any(isinstance(m, dict) and m and not source_routing.chunk_belongs_to(m, scope) for m in cited_metas)


def verify_answer(
    answer: str,
    contexts: Sequence[str],
    *,
    query: str = "",
    hard_source_ids: Optional[Sequence[str]] = None,
    cited_metadatas: Optional[Iterable[Any]] = None,
) -> VerificationResult:
    """Deterministic grounding checks of ``answer`` against the passages it was given."""
    text = _plain_text(answer).strip()
    if not text:
        return VerificationResult(True, False, "empty_answer")
    joined = _plain_text("\n".join(c for c in contexts if c))
    known = _numbers(joined) | _numbers(query)
    context_prices = _prices(joined)

    unsupported_prices = [
        _fmt(v) for v in dict.fromkeys(_prices(text)) if not _supported_price(v, known, context_prices)
    ]
    answer_prices = {round(v, 2) for v in _prices(text)}
    unsupported_plain = [
        _fmt(v)
        for v in sorted(_numbers(text))
        if v >= _MIN_PLAIN_VALUE and v not in known and v not in answer_prices
    ]
    if unsupported_prices:
        return VerificationResult(True, False, "unsupported_price", unsupported_prices, unsupported_plain)
    if len(unsupported_plain) > MAX_UNSUPPORTED_PLAIN:
        return VerificationResult(True, False, "unsupported_numbers", [], unsupported_plain)
    if _cross_source(cited_metadatas, hard_source_ids):
        return VerificationResult(True, False, "cross_source_citation")
    from ..source_display_policy import user_query_asks_geographic_location

    if user_query_asks_geographic_location(query):
        context_lower = joined.lower()
        unsupported_places = [
            span for span in extract_place_spans(text) if not _place_supported(span, context_lower)
        ]
        if unsupported_places:
            return VerificationResult(
                True,
                False,
                "unsupported_place",
                unsupported_places=unsupported_places,
            )
    return VerificationResult(True, True, "ok", [], unsupported_plain)


def strict_instruction(result: VerificationResult) -> str:
    """Extra instruction for the single regeneration attempt."""
    figures = ", ".join(result.unsupported[:6]) or "some figures"
    return (
        "\n\nIMPORTANT CORRECTION: A previous draft stated figures that do not appear in the "
        f"passages ({figures}). Answer again using ONLY prices, numbers and facts that appear "
        "verbatim in the passages above. If a requested figure is not in the passages, say it "
        "is not listed instead of estimating it."
    )


def redact_unsupported(answer: str, result: VerificationResult) -> Optional[str]:
    """Drop sentences/lines carrying unsupported figures; ``None`` when too much would go."""
    if not result.unsupported or not answer:
        return None
    bad = set(result.unsupported)
    parts = [p for p in _SENTENCE_SPLIT_RX.split(answer) if p.strip()]
    kept = [
        p for p in parts
        if not ({_fmt(v) for v in _numbers(_plain_text(p))} | {_fmt(v) for v in _prices(_plain_text(p))}) & bad
    ]
    if not kept or len(kept) < len(parts) / 2:
        return None
    joiner = "\n" if "\n" in answer else " "
    return joiner.join(kept).strip()
