"""Helpers for chatbot FAQ suggested questions (empty-session chips)."""
from __future__ import annotations

from typing import Any, List, Optional

FAQ_QUESTION_LIMIT_MIN = 1
FAQ_QUESTION_LIMIT_MAX = 5
FAQ_QUESTION_LIMIT_DEFAULT = 3


def clamp_faq_question_limit(value: Optional[int]) -> int:
    if value is None or not isinstance(value, (int, float)) or isinstance(value, bool):
        return FAQ_QUESTION_LIMIT_DEFAULT
    try:
        n = int(value)
    except (TypeError, ValueError):
        return FAQ_QUESTION_LIMIT_DEFAULT
    return max(FAQ_QUESTION_LIMIT_MIN, min(FAQ_QUESTION_LIMIT_MAX, n))


def normalize_faq_questions(raw: Any, limit: Optional[int] = None) -> List[dict]:
    """Normalize FAQ question payloads to [{id, text, order}, ...] capped by limit."""
    capped = clamp_faq_question_limit(limit if limit is not None else FAQ_QUESTION_LIMIT_DEFAULT)
    if not raw:
        return []
    if not isinstance(raw, list):
        return []

    out: List[dict] = []
    for index, item in enumerate(raw):
        if len(out) >= capped:
            break
        text = ""
        qid = f"faq_{index + 1}"
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = str(item.get("text") or item.get("question") or "").strip()
            raw_id = item.get("id")
            if raw_id is not None and str(raw_id).strip():
                qid = str(raw_id).strip()
        else:
            text = str(getattr(item, "text", "") or "").strip()
            raw_id = getattr(item, "id", None)
            if raw_id is not None and str(raw_id).strip():
                qid = str(raw_id).strip()
        if not text:
            continue
        out.append({"id": qid, "text": text[:500], "order": len(out) + 1})
    return out


def faq_settings_from_row(settings: Any) -> dict:
    """Build FAQ settings dict from a ChatbotSettings row or None."""
    if settings is None:
        return {
            "enabled": False,
            "questionsLimit": FAQ_QUESTION_LIMIT_DEFAULT,
            "questions": [],
        }
    limit = clamp_faq_question_limit(getattr(settings, "faq_questions_limit", None))
    return {
        "enabled": bool(getattr(settings, "faq_enabled", False)),
        "questionsLimit": limit,
        "questions": normalize_faq_questions(getattr(settings, "faq_questions", None), limit),
    }
