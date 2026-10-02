"""Helpers for chatbot FAQ suggested questions (empty-session chips)."""
from __future__ import annotations

from typing import Any, List, Optional

from .faq_common import normalize_faq_answer, normalize_for_match

FAQ_QUESTION_LIMIT_MIN = 1
FAQ_QUESTION_LIMIT_MAX = 5
FAQ_QUESTION_LIMIT_DEFAULT = 3
FAQ_QUESTION_MAX_LENGTH = 500


def clamp_faq_question_limit(value: Optional[int]) -> int:
    if value is None or not isinstance(value, (int, float)) or isinstance(value, bool):
        return FAQ_QUESTION_LIMIT_DEFAULT
    try:
        n = int(value)
    except (TypeError, ValueError):
        return FAQ_QUESTION_LIMIT_DEFAULT
    return max(FAQ_QUESTION_LIMIT_MIN, min(FAQ_QUESTION_LIMIT_MAX, n))


def _read_field(item: Any, *names: str) -> Any:
    for name in names:
        value = item.get(name) if isinstance(item, dict) else getattr(item, name, None)
        if value is not None and str(value).strip():
            return value
    return None


def normalize_faq_questions(raw: Any, limit: Optional[int] = None) -> List[dict]:
    """Normalize FAQ payloads to [{id, text, order, answer}, ...] capped by limit."""
    capped = clamp_faq_question_limit(limit if limit is not None else FAQ_QUESTION_LIMIT_DEFAULT)
    if not raw:
        return []
    if not isinstance(raw, list):
        return []

    out: List[dict] = []
    for index, item in enumerate(raw):
        if len(out) >= capped:
            break
        qid = f"faq_{index + 1}"
        answer = ""
        if isinstance(item, str):
            text = item.strip()
        else:
            text = str(_read_field(item, "text", "question") or "").strip()
            answer = normalize_faq_answer(_read_field(item, "answer"))
            raw_id = _read_field(item, "id")
            if raw_id is not None:
                qid = str(raw_id).strip()
        if not text:
            continue
        out.append({
            "id": qid,
            "text": text[:FAQ_QUESTION_MAX_LENGTH],
            "order": len(out) + 1,
            "answer": answer,
        })
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


def find_faq_answer(settings: Any, faq_id: Optional[str], message: Optional[str]) -> Optional[dict]:
    """Return the configured FAQ (with a non-empty answer) matching a chip click, else None.

    Both the id and the question text must match so stale or forged ids fall through to RAG.
    """
    if settings is None or not faq_id or not str(faq_id).strip() or not message:
        return None
    faq = faq_settings_from_row(settings)
    if not faq["enabled"]:
        return None
    wanted_id = str(faq_id).strip()
    wanted_text = normalize_for_match(message)
    for question in faq["questions"]:
        if question["id"] != wanted_id:
            continue
        if normalize_for_match(question["text"]) != wanted_text:
            return None
        return question if question.get("answer") else None
    return None
