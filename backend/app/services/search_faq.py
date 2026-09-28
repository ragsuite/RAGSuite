"""Search FAQ questions: normalization for storage and answer lookup for card clicks.

Stored in `search_settings.search_questions` as legacy strings or objects. Normalized rows
always carry a stable id so a clicked card can be matched on the server.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .faq_common import FAQ_ANSWER_MAX_LENGTH, normalize_for_match

SEARCH_FAQ_LIMIT_MIN = 1
SEARCH_FAQ_LIMIT_MAX = 50
SEARCH_FAQ_LIMIT_DEFAULT = 5
SEARCH_FAQ_ID_MAX_LENGTH = 128

_LEGACY_ID_PREFIX = "pq_"


def clamp_search_faq_limit(value: Any) -> int:
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
        return SEARCH_FAQ_LIMIT_DEFAULT
    return max(SEARCH_FAQ_LIMIT_MIN, min(SEARCH_FAQ_LIMIT_MAX, int(value)))


def _read(item: Any, name: str) -> Any:
    if isinstance(item, dict):
        return item.get(name)
    return getattr(item, name, None)


def _question_text(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    for name in ("question", "text"):
        value = _read(item, name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _answer_text(item: Any) -> str:
    value = None if isinstance(item, str) else _read(item, "answer")
    if not isinstance(value, str):
        return ""
    return value.strip()[:FAQ_ANSWER_MAX_LENGTH]


def _requested_id(item: Any) -> str:
    value = None if isinstance(item, str) else _read(item, "id")
    if value is None:
        return ""
    return str(value).strip()[:SEARCH_FAQ_ID_MAX_LENGTH]


def _next_legacy_id(used: set) -> str:
    n = 1
    while f"{_LEGACY_ID_PREFIX}{n}" in used:
        n += 1
    return f"{_LEGACY_ID_PREFIX}{n}"


def normalize_search_faq_questions(raw: Any, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Return `[{id, question, answer, order}]`, dropping blank questions.

    Rows without an id (legacy strings/objects) get `pq_<n>`; duplicate ids are replaced so
    every id is unique. `limit` truncates after normalization (None keeps all rows).
    """
    if not isinstance(raw, list):
        return []
    rows: List[Dict[str, Any]] = []
    used: set = set()
    for item in raw:
        question = _question_text(item)
        if not question:
            continue
        faq_id = _requested_id(item)
        if not faq_id or faq_id in used:
            faq_id = _next_legacy_id(used)
        used.add(faq_id)
        rows.append({
            "id": faq_id,
            "question": question,
            "answer": _answer_text(item),
            "order": len(rows),
        })
    if limit is not None:
        rows = rows[: max(0, limit)]
    return rows


def find_search_faq_answer(settings: Any, faq_id: Optional[str], query: str) -> Optional[Dict[str, Any]]:
    """Return the FAQ row for a clicked card when it is enabled, visible and answered."""
    wanted_id = (faq_id or "").strip()
    if not wanted_id or settings is None:
        return None
    if not getattr(settings, "search_predefined_questions", False):
        return None
    visible = normalize_search_faq_questions(
        getattr(settings, "search_questions", None),
        limit=clamp_search_faq_limit(getattr(settings, "search_questions_limit", None)),
    )
    wanted_text = normalize_for_match(query)
    for row in visible:
        if row["id"] != wanted_id:
            continue
        if normalize_for_match(row["question"]) != wanted_text or not row["answer"]:
            return None
        return row
    return None
