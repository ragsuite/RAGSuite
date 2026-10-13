"""Table-aware chunking for crawled page text.

Large runs of table rows (``a | b``, ``Label: value; Label: value``) and spec lists
(``Label: value`` lines) are packed into chunks by whole rows, and every chunk of a run
repeats the short heading line just above the table. Everything else goes through the
normal sentence splitter, so pages without large tables chunk exactly as before.
"""
from __future__ import annotations

import re
from typing import Callable, List, Tuple

MIN_TABLE_ROWS = 3
MAX_ROW_CHARS = 600
MAX_LEAD_CHARS = 80
# Smaller tables rarely straddle a chunk boundary; they stay with the surrounding prose.
LARGE_TABLE_SHARE = 0.5

_PIPE_ROW_RE = re.compile(r"\S \| \S")
_LABELLED_ROW_RE = re.compile(r"^[^:;|]{1,60}: [^;]+(?:; [^:;|]{1,60}: [^;]+)+$")
_KEY_VALUE_RE = re.compile(r"^[^:;|.!?]{1,40}: [^\n]{1,160}$")

Chunker = Callable[[str, int], List[str]]
Segment = Tuple[bool, List[str]]


def _is_row(line: str) -> bool:
    if len(line) > MAX_ROW_CHARS:
        return False
    return bool(_PIPE_ROW_RE.search(line) or _LABELLED_ROW_RE.match(line) or _KEY_VALUE_RE.match(line))


def split_segments(lines: List[str]) -> List[Segment]:
    """Group lines into (is_table, lines) segments; short row runs stay prose."""
    segments: List[Segment] = []
    run: List[str] = []

    def push(is_table: bool, block: List[str]) -> None:
        if not block:
            return
        if segments and segments[-1][0] == is_table:
            segments[-1][1].extend(block)
        else:
            segments.append((is_table, list(block)))

    for line in lines + [""]:
        if line and _is_row(line):
            run.append(line)
            continue
        push(len(run) >= MIN_TABLE_ROWS, run)
        run = []
        if line:
            push(False, [line])
    return segments


def _pack_rows(rows: List[str], lead: str, chunk_size: int) -> List[str]:
    chunks: List[str] = []
    current: List[str] = [lead] if lead else []
    size = len(lead)
    for row in rows:
        has_rows = len(current) > (1 if lead else 0)
        if has_rows and size + len(row) + 1 > chunk_size:
            chunks.append("\n".join(current))
            current, size = ([lead] if lead else []), len(lead)
        current.append(row)
        size += len(row) + 1
    if len(current) > (1 if lead else 0):
        chunks.append("\n".join(current))
    return chunks


def _is_large(block: List[str], chunk_size: int) -> bool:
    return sum(len(row) + 1 for row in block) >= chunk_size * LARGE_TABLE_SHARE


def chunk_with_tables(text: str, chunk_size: int, chunker: Chunker) -> List[str]:
    """Chunk ``text``; tables too large to stay whole in one chunk are packed by rows."""
    lines = [ln.strip() for ln in (text or "").split("\n")]
    segments = split_segments([ln for ln in lines if ln])
    if not any(is_table and _is_large(block, chunk_size) for is_table, block in segments):
        return chunker(text, chunk_size)
    chunks: List[str] = []
    prose: List[str] = []
    for is_table, block in segments:
        if not (is_table and _is_large(block, chunk_size)):
            prose.extend(block)
            continue
        lead = prose[-1] if prose and len(prose[-1]) <= MAX_LEAD_CHARS else ""
        if prose:
            chunks.extend(chunker("\n".join(prose), chunk_size))
            prose = []
        chunks.extend(_pack_rows(block, lead, chunk_size))
    if prose:
        chunks.extend(chunker("\n".join(prose), chunk_size))
    return [c for c in chunks if c.strip()]
