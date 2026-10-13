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
# Hidden trailer lines: citations, and the chat next-step marker (see answer_next_step).
_MARKERS = ("sources_used:", "next_step:")
_HOLDBACK_WINDOW = 48

_NOISE_PREFIX_RE = re.compile(r"^(?:\s|\*|_|#|>|`|<[a-zA-Z/]{0,4}>?)*")
_TRAILER_RE = re.compile(
    r"(?:\s|\*|_|#|(?m:^>)|`|<[a-zA-Z]{1,4}>)*SOURCES[_ ]USED\s*\**\s*[:：]\s*(?P<body>.*)$",
    re.IGNORECASE | re.DOTALL,
)
_STREAM_STOP_RE = re.compile(
    r"(?:\s|\*|_|#|(?m:^>)|`|<[a-zA-Z]{1,4}>)*(?:SOURCES[_ ]USED|NEXT[_ ]STEP)\s*\**\s*[:：]",
    re.IGNORECASE,
)
_INLINE_LABEL_RE = re.compile(r"\s?\[(?:S\d+)(?:\s*[,;]\s*S?\d+)*\]")
_PARTIAL_LABEL_RE = re.compile(r"\s?\[(?:S\d{0,3}(?:\s*[,;]\s*S?\d{0,3})*)?$")
_LABEL = r"\[(?:S\d+)(?:\s*[,;]\s*S?\d+)*\]"
_CONNECTOR = r"\b(?:from|see|source|sources|via|in|and|or|und|oder|aus|von|siehe|quelle|quellen)\b"
# "(from [S1] and [S3])": once the labels go, the rest of the parenthesis is meaningless.
_LABEL_PAREN_RE = re.compile(
    rf"\s?\((?=[^()]*{_LABEL})(?:[\s,;&]|{_LABEL}|{_CONNECTOR})*\)", re.IGNORECASE
)
# Unclosed parenthesis at the end of a stream buffer that may still become a label group.
_OPEN_PAREN_TAIL_RE = re.compile(r"\s?\([^()\n]{0,40}$")
_INDEX_RE = re.compile(r"S?\s*(\d{1,3})", re.IGNORECASE)
_TRAILING_NOISE_RE = re.compile(r"(?:\s|\*|_|#|`)+$")
_EMPHASIS_RUN_RE = re.compile(r"[*_`]+")
_LIST_PREFIX_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
_LOOSE_UNDERSCORE_RE = re.compile(r"(?<!\w)_|_(?!\w)")
_LINE_TAIL_MAX = 2000


def passage_label(index: int) -> str:
    return f"[S{index + 1}]"


def label_passages(contexts: Sequence[str], metas: Sequence[Any], url_line_fn) -> List[str]:
    """Header each passage with ``[S{n}]``, its page context and its source URL line."""
    from .chunk_context import passage_line

    labelled: List[str] = []
    for i, ctx in enumerate(contexts):
        meta = metas[i] if i < len(metas) else {}
        labelled.append(f"{passage_label(i)}\n{passage_line(meta)}{url_line_fn(meta)}{ctx}")
    return labelled


def prompt_instruction() -> str:
    return (
        "CITATIONS: Each DOCUMENTS passage starts with a label like [S1]. "
        "A `Page:` line under the label names the page or document section the passage comes "
        "from; use it to tell which product or topic the passage is about, but do not copy it. "
        "Do not write these labels inside the answer. After the answer, on its own final line, "
        f"write `{TRAILER_LABEL}:` followed by the labels of the passages you actually used "
        f"(e.g. `{TRAILER_LABEL}: S1, S3`). When the asked detail is missing but you give related "
        "facts about the same item or topic, list the passages those facts come from. Only when "
        f"your answer uses nothing from the documents, write `{TRAILER_LABEL}: none`."
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
    return _INLINE_LABEL_RE.sub("", _LABEL_PAREN_RE.sub("", text or ""))


def _emphasis_balanced(line: str, markers: str) -> bool:
    line = _LIST_PREFIX_RE.sub("", line, count=1)
    if "*" in markers and (line.count("**") % 2 or line.replace("**", "").count("*") % 2):
        return False
    if "_" in markers and (line.count("__") % 2 or len(_LOOSE_UNDERSCORE_RE.findall(line.replace("__", ""))) % 2):
        return False
    return not ("`" in markers and line.count("`") % 2)


def restore_closing_emphasis(answer: str, removed: str) -> str:
    """Give back the markers closing the answer's last line ("**11.10.07.44**") that were
    cut off together with a hidden trailer line written right after them."""
    run = _EMPHASIS_RUN_RE.match(removed or "")
    if not run or not answer or answer[-1].isspace():
        return answer
    last = answer.rsplit("\n", 1)[-1]
    markers = run.group(0)
    if _emphasis_balanced(last, markers):
        return answer
    for size in range(1, len(markers) + 1):
        if _emphasis_balanced(last + markers[:size], markers):
            return answer + markers[:size]
    return answer


def parse_and_strip(text: Optional[str]) -> Tuple[str, Optional[List[int]]]:
    """Return (answer without trailer/labels, used passage indices or None)."""
    raw = text or ""
    match = _TRAILER_RE.search(raw)
    if not match:
        return strip_inline_labels(raw).rstrip(), None
    used = _parse_body(match.group("body"))
    head = raw[: match.start()]
    answer = _TRAILING_NOISE_RE.sub("", head) if head.strip() else ""
    answer = restore_closing_emphasis(answer, raw[len(answer):])
    return strip_inline_labels(answer).rstrip(), used


def _could_start_marker(tail: str) -> bool:
    rest = _NOISE_PREFIX_RE.sub("", tail, count=1)
    if not rest:
        return bool(tail)
    normalized = rest.lower().replace(" ", "_")
    return any(m.startswith(normalized) or normalized.startswith(m) for m in _MARKERS)


class CitationTrailerFilter:
    """Streaming filter: emits answer text, swallows the trailer (``SOURCES_USED`` /
    ``NEXT_STEP`` lines) even when split across deltas."""

    def __init__(self, hold_tokens: Sequence[str] = ()) -> None:
        """``hold_tokens``: exact strings (e.g. the OOC sentinel) whose partial prefix at
        the end of the buffer is held back so a half-written sentinel never streams."""
        self._buffer = ""
        self._done = False
        self._hold_tokens = tuple(t for t in hold_tokens if t)
        self._line_tail = ""

    @property
    def trailer_started(self) -> bool:
        return self._done

    def feed(self, delta: str) -> str:
        if self._done or not delta:
            return ""
        self._buffer += delta
        match = _STREAM_STOP_RE.search(self._buffer)
        if match:
            self._done = True
            head = self._buffer[: match.start()]
            restored = restore_closing_emphasis(self._line_tail + head, self._buffer[match.start():])
            self._buffer = ""
            return self._emit(head + restored[len(self._line_tail) + len(head):])
        hold_from = len(self._buffer)
        for start in range(max(0, len(self._buffer) - _HOLDBACK_WINDOW), len(self._buffer)):
            if _could_start_marker(self._buffer[start:]):
                hold_from = start
                break
        partial = _PARTIAL_LABEL_RE.search(self._buffer)
        if partial and partial.start() < hold_from:
            hold_from = partial.start()
        open_paren = _OPEN_PAREN_TAIL_RE.search(self._buffer)
        if open_paren and open_paren.start() < hold_from:
            hold_from = open_paren.start()
        hold_from = min(hold_from, self._hold_token_start())
        out = self._buffer[:hold_from]
        self._buffer = self._buffer[hold_from:]
        return self._emit(out)

    def _emit(self, out: str) -> str:
        """Visible text for ``out``; remembers the current line for emphasis balance."""
        text = strip_inline_labels(out)
        self._line_tail = (self._line_tail + text).rsplit("\n", 1)[-1][-_LINE_TAIL_MAX:]
        return text

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
        return self._emit(out)


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
