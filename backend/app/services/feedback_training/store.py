"""Train / untrain a feedback and report its training state (DB side of the reward memory)."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from ...models import ChatMessage, FeedbackTrainingExample
from ..rag import kb_generation
from . import memory

GUIDANCE_MAX_CHARS = 1000
COMMENT_MAX_CHARS = 1000
MAX_CITED_URLS = 12

_LIST_RX = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+", re.MULTILINE)
_HEADING_RX = re.compile(r"^\s*#{1,6}\s+\S|<h[1-6][\s>]", re.MULTILINE | re.IGNORECASE)
_TAG_RX = re.compile(r"<[^>]+>")


class TrainingNotEligible(ValueError):
    """The feedback predates admin training or carries no vote."""


def is_eligible(message: ChatMessage) -> bool:
    return message.feedback is not None and message.feedback_at is not None


def answer_profile(text: str) -> Dict[str, Any]:
    body = text or ""
    words = len(_TAG_RX.sub(" ", body).split())
    return {
        "words": words,
        "has_list": bool(_LIST_RX.search(body) or "<li" in body.lower()),
        "has_headings": bool(_HEADING_RX.search(body)),
    }


def cited_urls(sources: Any) -> List[str]:
    urls: List[str] = []
    for source in sources if isinstance(sources, list) else []:
        url = source.get("url") if isinstance(source, dict) else None
        if isinstance(url, str) and url.strip() and url.strip() not in urls:
            urls.append(url.strip())
        if len(urls) >= MAX_CITED_URLS:
            break
    return urls


def _clip(text: Optional[str], limit: int) -> Optional[str]:
    cleaned = (text or "").strip()
    return cleaned[:limit] if cleaned else None


def _changed() -> None:
    kb_generation.bump()
    memory.invalidate()


def train(
    db: Session, message: ChatMessage, *, user_id: Optional[int], guidance: Optional[str]
) -> FeedbackTrainingExample:
    """Create or refresh the example for ``message``; always active afterwards."""
    if not is_eligible(message):
        raise TrainingNotEligible("Only feedback given after admin training was enabled can be trained.")
    example = (
        db.query(FeedbackTrainingExample)
        .filter(FeedbackTrainingExample.message_id == message.message_id)
        .first()
    )
    query_text = (message.user_message or "").strip()
    if example is None:
        example = FeedbackTrainingExample(id=uuid.uuid4(), message_id=message.message_id, project_id=message.project_id)
        db.add(example)
    elif example.query_text != query_text:
        example.embeddings = None
    example.reward = 1 if message.feedback else -1
    example.query_text = query_text
    example.reason_tags = list(message.context_tags or []) or None
    example.user_comment = _clip(message.feedback_text, COMMENT_MAX_CHARS)
    example.guidance = _clip(guidance, GUIDANCE_MAX_CHARS)
    example.cited_urls = cited_urls(message.sources) or None
    example.answer_profile = answer_profile(message.assistant_response or "")
    example.is_active = True
    example.trained_by_user_id = user_id
    example.trained_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(example)
    _changed()
    return example


def untrain(db: Session, message: ChatMessage) -> Optional[FeedbackTrainingExample]:
    """Deactivate (keep for history); ``None`` when the feedback was never trained."""
    example = (
        db.query(FeedbackTrainingExample)
        .filter(FeedbackTrainingExample.message_id == message.message_id)
        .first()
    )
    if example is None:
        return None
    if example.is_active:
        example.is_active = False
        db.commit()
        db.refresh(example)
        _changed()
    return example


def examples_by_message(db: Session, message_ids: Iterable[uuid.UUID]) -> Dict[uuid.UUID, FeedbackTrainingExample]:
    ids = list({mid for mid in message_ids if mid is not None})
    if not ids:
        return {}
    rows = db.query(FeedbackTrainingExample).filter(FeedbackTrainingExample.message_id.in_(ids)).all()
    return {row.message_id: row for row in rows}


def training_state(message: ChatMessage, example: Optional[FeedbackTrainingExample]) -> Dict[str, Any]:
    """Payload for the moderation UI (``training`` field of a feedback row)."""
    active = bool(example is not None and example.is_active)
    return {
        "eligible": is_eligible(message),
        "active": active,
        "reward": int(example.reward) if active else None,
        "guidance": example.guidance if example is not None else None,
        "trained_at": example.trained_at if active else None,
        "trained_by_user_id": example.trained_by_user_id if active else None,
    }
