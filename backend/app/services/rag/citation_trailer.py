"""Passage labels and the hidden ``SOURCES_USED`` trailer for answer-grounded citations.

The prompt labels each context passage ``[S1]``, ``[S2]``… and asks the model to end
with ``SOURCES_USED: S1,S3`` (or ``SOURCES_USED: none``). The trailer is stripped from
everything shown to users; the parsed indices select exactly the cited passages as the
response's Sources. A missing/unparseable trailer yields ``None`` so callers fall back
to heuristic source selection.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

TRAILER_LABEL = "SOURCES_USED"
_MARKER = "sources_used:"
_HOLDBACK_WINDOW = 48

_NOISE_PREFIX_RE = re.compile(r"^(?:\s|\*|_|#|>|`|<[a-zA-Z/]{0,4}>?)*")
_TRAILER_RE = re.compile(
    r"(?:\s|\*|_|#|(?m:^>)|`|<[a-zA-Z]{1,4}>)*SOURCES[_ ]USED\s*\**\s*[:：]\s*(?P<body>.*)$",
    re.IGNORECASE | re.DOTALL,
)
_INLINE_LABEL_RE = re.compile(r"\s?\[(?:S\d+)(?:\s*[,;]\s*S?\d+)*\]")
_PARTIAL_LABEL_RE = re.compile(r"\s?\[(?:S\d{0,3}(?:\s*[,;]\s*S?\d{0,3})*)?$")
_INDEX_RE = re.compile(r"S?\s*(\d{1,3})", re.IGNORECASE)


def passage_label(index: int) -> str:
    return f"[S{index + 1}]"


def label_passages(contexts: Sequence[str], metas: Sequence[Any], url_line_fn) -> List[str]:
    """Header each passage with ``[S{n}]`` plus its source URL line."""
    labelled: List[str] = []
    for i, ctx in enumerate(contexts):
        meta = metas[i] if i < len(metas) else {}
        url_line = url_line_fn(meta)
        header = passage_label(i)
        labelled.append(f"{header}\n{url_line}{ctx}" if url_line else f"{header}\n{ctx}")
    return labelled


def prompt_instruction() -> str:
    return (
        "CITATIONS: Each DOCUMENTS passage starts with a label like [S1]. "
        "Do not write these labels inside the answer. After the answer, on its own final line, "
        f"write `{TRAILER_LABEL}:` followed by the labels of the passages you actually used "
        f"(e.g. `{TRAILER_LABEL}: S1, S3`). If you could not answer from the documents, write "
        f"`{TRAILER_LABEL}: none`."
    )


def _parse_body(body: str) -> Optional[List[int]]:
    text = re.sub(r"<[^>]+>", " ", body or "").strip().strip("`*_ ").lower()
    if text.startswith("none") or text.startswith("n/a") or text in ("", "-"):
        return [] if text.startswith(("none", "n/a")) else None
    indices: List[int] = []
    for match in _INDEX_RE.finditer(text):
        idx = int(match.group(1)) - 1
        if idx >= 0 and idx not in indices:
            indices.append(idx)
    return indices or None


def strip_inline_labels(text: str) -> str:
    return _INLINE_LABEL_RE.sub("", text or "")


def parse_and_strip(text: Optional[str]) -> Tuple[str, Optional[List[int]]]:
    """Return (answer without trailer/labels, used passage indices or None)."""
    raw = text or ""
    match = _TRAILER_RE.search(raw)
    if not match:
        return strip_inline_labels(raw).rstrip(), None
    used = _parse_body(match.group("body"))
    answer = raw[: match.start()]
    answer = re.sub(r"(?:\s|\*|_|#|`)+$", "", answer) if answer.strip() else ""
    return strip_inline_labels(answer).rstrip(), used


def _could_start_marker(tail: str) -> bool:
    rest = _NOISE_PREFIX_RE.sub("", tail, count=1)
    if not rest:
        return bool(tail)
    normalized = rest.lower().replace(" ", "_")
    return _MARKER.startswith(normalized) or normalized.startswith(_MARKER)


class CitationTrailerFilter:
    """Streaming filter: emits answer text, swallows the trailer even when split across deltas."""

    def __init__(self, hold_tokens: Sequence[str] = ()) -> None:
        """``hold_tokens``: exact strings (e.g. the OOC sentinel) whose partial prefix at
        the end of the buffer is held back so a half-written sentinel never streams."""
        self._buffer = ""
        self._done = False
        self._hold_tokens = tuple(t for t in hold_tokens if t)

    @property
    def trailer_started(self) -> bool:
        return self._done

    def feed(self, delta: str) -> str:
        if self._done or not delta:
            return ""
        self._buffer += delta
        match = _TRAILER_RE.search(self._buffer)
        if match:
            self._done = True
            out = self._buffer[: match.start()]
            self._buffer = ""
            return strip_inline_labels(out)
        hold_from = len(self._buffer)
        for start in range(max(0, len(self._buffer) - _HOLDBACK_WINDOW), len(self._buffer)):
            if _could_start_marker(self._buffer[start:]):
                hold_from = start
                break
        partial = _PARTIAL_LABEL_RE.search(self._buffer)
        if partial and partial.start() < hold_from:
            hold_from = partial.start()
        hold_from = min(hold_from, self._hold_token_start())
        out = self._buffer[:hold_from]
        self._buffer = self._buffer[hold_from:]
        return strip_inline_labels(out)

    def _hold_token_start(self) -> int:
        """Start of the earliest buffer suffix that is a prefix of (or contains) a hold token."""
        buf = self._buffer
        start = len(buf)
        for token in self._hold_tokens:
            found = buf.find(token)
            if found != -1:
                start = min(start, found)
                continue
            for size in range(min(len(token) - 1, len(buf)), 0, -1):
                if buf.endswith(token[:size]):
                    start = min(start, len(buf) - size)
                    break
        return start

    def flush(self) -> str:
        if self._done:
            return ""
        out, self._buffer = self._buffer, ""
        return strip_inline_labels(out)


def cited_metadatas(
    passage_metadatas: Optional[Sequence[Any]],
    used_indices: Optional[Sequence[int]],
) -> Optional[List[Dict[str, Any]]]:
    """Metadata of cited passages; ``None`` when the model gave no usable trailer."""
    if used_indices is None or passage_metadatas is None:
        return None
    metas = list(passage_metadatas)
    out: List[Dict[str, Any]] = []
    for idx in used_indices:
        if isinstance(idx, int) and 0 <= idx < len(metas) and isinstance(metas[idx], dict):
            out.append(metas[idx])
    if used_indices and not out:
        return None
    return out


def cited_metadatas_from_result(result: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(result, dict):
        return None
    return cited_metadatas(result.get("llm_passage_metadatas"), result.get("used_passage_indices"))
