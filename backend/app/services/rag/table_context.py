"""Prepend/append neighbouring sentences around tables and captions (Custom only)."""
from __future__ import annotations

import re
from typing import List, Sequence, Tuple

from .table_chunks import MIN_TABLE_ROWS, _is_row

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_CAPTION_RE = re.compile(
    r"^(?:figure|fig\.|image|caption|table)\s*\d*\s*[:.\-–—)]",
    re.IGNORECASE,
)
_MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")
_MD_TABLE_RE = re.compile(r"^\s*\|.+\|\s*$")
_HTML_TABLE_RE = re.compile(r"</?(?:table|tr|td|th|thead|tbody|caption)\b", re.IGNORECASE)

Kind = str
Tagged = Tuple[Kind, List[str]]


def wrap_table_context(text: str, n: int) -> str:
    """Return ``text`` unchanged unless ``n`` is 1 or 2 and a table/caption exists."""
    if n not in (1, 2):
        return text
    body = text if text is not None else ""
    if not body.strip():
        return text
    lines = body.split("\n")
    tagged = _tag_runs(lines)
    if not any(kind in ("table", "caption") for kind, _ in tagged):
        return text
    out: List[str] = []
    for index, (kind, block) in enumerate(tagged):
        if kind not in ("table", "caption"):
            out.extend(block)
            continue
        prefix = _last_sentences(_prose_at(tagged, index - 1), n)
        suffix = _first_sentences(_prose_at(tagged, index + 1), n)
        wrapped = block
        if prefix:
            wrapped = [prefix, *wrapped]
        if suffix:
            wrapped = [*wrapped, suffix]
        out.extend(wrapped)
    return "\n".join(out)


def _tag_runs(lines: Sequence[str]) -> List[Tagged]:
    raw: List[Tagged] = []
    for line in lines:
        kind = _line_kind(line)
        if raw and raw[-1][0] == kind:
            raw[-1][1].append(line)
        else:
            raw.append((kind, [line]))
    merged: List[Tagged] = []
    for kind, block in raw:
        if kind == "blank":
            if merged:
                merged[-1][1].extend(block)
            else:
                merged.append(("prose", list(block)))
            continue
        if kind == "table" and not _is_table_run(block):
            kind = "prose"
        if merged and merged[-1][0] == kind:
            merged[-1][1].extend(block)
        else:
            merged.append((kind, list(block)))
    return merged


def _line_kind(line: str) -> Kind:
    stripped = line.strip()
    if not stripped:
        return "blank"
    if _is_caption(stripped) or _MD_IMAGE_RE.search(stripped):
        return "caption"
    if _MD_TABLE_RE.match(stripped) or _HTML_TABLE_RE.search(stripped) or _is_row(stripped):
        return "table"
    return "prose"


def _is_caption(line: str) -> bool:
    return bool(_CAPTION_RE.match(line)) or line.lower().startswith("figcaption")


def _is_table_run(block: Sequence[str]) -> bool:
    filled = [line for line in block if line.strip()]
    if not filled:
        return False
    if any(_MD_TABLE_RE.match(line.strip()) or _HTML_TABLE_RE.search(line) for line in filled):
        return True
    return len(filled) >= MIN_TABLE_ROWS


def _prose_at(tagged: Sequence[Tagged], index: int) -> str:
    if index < 0 or index >= len(tagged):
        return ""
    kind, block = tagged[index]
    if kind != "prose":
        return ""
    return "\n".join(block)


def _sentences(text: str) -> List[str]:
    body = (text or "").strip()
    if not body:
        return []
    parts = [part.strip() for part in _SENTENCE_RE.split(body) if part.strip()]
    return parts or [body]


def _last_sentences(text: str, n: int) -> str:
    parts = _sentences(text)
    return " ".join(parts[-n:]) if parts else ""


def _first_sentences(text: str, n: int) -> str:
    parts = _sentences(text)
    return " ".join(parts[:n]) if parts else ""
