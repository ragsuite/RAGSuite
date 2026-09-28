"""
Shared contract for user-authored textual sources (Text and Q&A pairs).

Rows live in ``uploaded_documents`` and train through the normal document
ingest pipeline. Their chunks carry ``source_type`` metadata so the citation
layer can use them as grounding without ever listing them as sources.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Mapping, Optional, Union

TEXT_SOURCE_LABEL = "text"
QA_SOURCE_LABEL = "qa_pairs"
TEXTUAL_SOURCE_LABELS = frozenset({TEXT_SOURCE_LABEL, QA_SOURCE_LABEL})

TEXT_MIME = "text/x-ragsuite-text"
QA_MIME = "application/x-ragsuite-qa+json"

TEXT_EXT = ".rstext"
QA_EXT = ".rsqa"
TEXTUAL_EXTS = frozenset({TEXT_EXT, QA_EXT})

CHUNK_SOURCE_TYPE_TEXT = "text"
CHUNK_SOURCE_TYPE_QA = "qa"
NON_CITABLE_SOURCE_TYPES = frozenset({CHUNK_SOURCE_TYPE_TEXT, CHUNK_SOURCE_TYPE_QA})

_MIME_TO_EXT = {TEXT_MIME: TEXT_EXT, QA_MIME: QA_EXT}
# Saved but never trained (or edited since training). Training is started explicitly.
NOT_TRAINED_STATUS = "Not Trained"


def is_untrained_textual_draft(status: Optional[str], chunks: Optional[int]) -> bool:
    """True for a saved Text/Q&A source that has never been trained (no vectors exist)."""
    return (status or "") == NOT_TRAINED_STATUS and not (chunks or 0)


def staging_ext_for_mime(mime: Optional[str]) -> Optional[str]:
    """Staging extension for a textual-source MIME type, else None."""
    key = (mime or "").split(";")[0].strip().lower()
    return _MIME_TO_EXT.get(key)


def is_non_citable_meta(meta: Any) -> bool:
    """True when a chunk came from a Text or Q&A source (never shown as a citation)."""
    if not isinstance(meta, Mapping):
        return False
    value = str(meta.get("source_type") or "").strip().lower()
    return value in NON_CITABLE_SOURCE_TYPES


def serialize_qa_pairs(pairs: List[Mapping[str, str]]) -> bytes:
    payload = {
        "pairs": [
            {"question": str(p.get("question") or ""), "answer": str(p.get("answer") or "")}
            for p in pairs
        ]
    }
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def parse_qa_pairs(raw: Union[bytes, str, None]) -> List[Dict[str, str]]:
    """Parse stored Q&A JSON; returns only pairs with both a question and an answer."""
    if raw is None:
        return []
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return []
    items = data.get("pairs") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []
    out: List[Dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if question and answer:
            out.append({"question": question, "answer": answer})
    return out


def format_qa_chunk(question: str, answer: str) -> str:
    return f"Question: {question.strip()}\nAnswer: {answer.strip()}"
