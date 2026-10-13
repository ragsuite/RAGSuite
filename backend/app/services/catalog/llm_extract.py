"""Model gap-fill for records the page text left incomplete (background job only).

The model may only fill missing brand / category / price; every value it returns must
appear in the page text, so a guess can never become a catalog fact.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Callable, Dict, Optional

from ..llm_json import load_json_object
from .answer_checks import price_spellings
from .normalize import fold, parse_amount

logger = logging.getLogger(__name__)

PAGE_CHARS = 3000


def max_calls_per_job() -> int:
    try:
        return max(0, int(os.getenv("RAG_CATALOG_LLM_MAX_PER_JOB", "200")))
    except ValueError:
        return 200


def build_prompt(title: str, text: str) -> str:
    return (
        "Read this web page and describe the single item it is about.\n"
        f"<title>{title}</title>\n<page>\n{text[:PAGE_CHARS]}\n</page>\n"
        'Reply with JSON only: {"single_item": true|false, "brand": "...", "category": "...", '
        '"price": "...", "currency": "ISO code"}. Use null for anything the page does not state. '
        "Copy values exactly as written on the page; do not guess."
    )


def _in_text(value: str, page: str) -> bool:
    return bool(value) and fold(value) in page


def verified_fields(reply: Optional[Dict[str, Any]], text: str) -> Dict[str, Any]:
    """Only values that are literally present in the page."""
    if not isinstance(reply, dict) or reply.get("single_item") is False:
        return {}
    page = fold(text)
    out: Dict[str, Any] = {}
    for key in ("brand", "category"):
        value = str(reply.get(key) or "").strip()
        if value and len(value) <= 80 and _in_text(value, page):
            out[key] = value
    price = parse_amount(str(reply.get("price") or ""))
    if price and any(p in text for p in price_spellings(price)):
        out["price"] = price
        currency = str(reply.get("currency") or "").strip().upper()
        if 2 <= len(currency) <= 4 and currency.isalpha():
            out["currency"] = currency
    return out


def fill(title: str, text: str, complete: Callable[[str], str]) -> Dict[str, Any]:
    try:
        reply = load_json_object(complete(build_prompt(title or "", text or "")) or "")
    except Exception as exc:
        logger.info("catalog model fill failed: %s", exc)
        return {}
    return verified_fields(reply, text or "")
