"""Map chunks to the nearest heading of their page or document.

Headings come from the page outline captured at crawl time (``h1``–``h4``), a PDF
outline, DOCX heading styles or PPTX slide titles. Each heading is located in the
extracted text, each chunk's start is located the same way, and a chunk inherits the
last heading that starts before it (or early inside it).
"""
from __future__ import annotations

import re
from typing import Iterable, List, Optional, Sequence, Tuple

PAGE_OUTLINE_KEY = "headings"
PAGE_BREADCRUMB_KEY = "breadcrumb"
# A heading this far into a chunk still names what the chunk is mostly about.
HEADING_LEAD_CHARS = 200
_PROBE_CHARS = 60
_WS_RE = re.compile(r"\s+")


def _norm(text: str) -> str:
    return _WS_RE.sub(" ", text or "").strip().lower()


def heading_anchors(text: str, headings: Optional[Iterable[str]]) -> List[Tuple[int, str]]:
    """``(offset, heading)`` for headings found in ``text``, in reading order."""
    lowered = (text or "").lower()
    anchors: List[Tuple[int, str]] = []
    cursor = 0
    for heading in headings or []:
        label = _WS_RE.sub(" ", str(heading or "")).strip()
        needle = _norm(label)
        if not needle:
            continue
        pos = lowered.find(needle, cursor)
        if pos < 0:
            continue
        anchors.append((pos, label))
        cursor = pos + len(needle)
    return anchors


def chunk_offsets(text: str, chunks: Sequence[str]) -> List[int]:
    """Start offset of each chunk in ``text`` (chunks overlap, so search moves forward)."""
    offsets: List[int] = []
    cursor = 0
    last = 0
    for chunk in chunks:
        probe = (chunk or "").strip()[:_PROBE_CHARS]
        pos = text.find(probe, cursor) if probe else -1
        if pos < 0 and probe:
            pos = text.find(probe)
        if pos < 0:
            pos = last
        offsets.append(pos)
        last = pos
        cursor = pos + 1
    return offsets


def sections_for_chunks(text: str, chunks: Sequence[str], anchors: Sequence[Tuple[int, str]]) -> List[str]:
    if not anchors:
        return ["" for _ in chunks]
    sections: List[str] = []
    for offset, chunk in zip(chunk_offsets(text or "", chunks), chunks):
        limit = offset + min(HEADING_LEAD_CHARS, max(1, len(chunk or "") // 3))
        current = ""
        for pos, label in anchors:
            if pos > limit:
                break
            current = label
        sections.append(current)
    return sections


def sections_for_page(text: str, chunks: Sequence[str], headings: Optional[Iterable[str]]) -> List[str]:
    """Nearest heading per chunk; empty strings when the page has no outline."""
    if not headings:
        return ["" for _ in chunks]
    return sections_for_chunks(text or "", chunks, heading_anchors(text or "", headings))
