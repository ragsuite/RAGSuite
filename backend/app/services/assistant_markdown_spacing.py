"""Light spacing fix for jammed assistant markdown (lists / fences)."""

from __future__ import annotations

import re
from typing import Callable, Optional

# A fenced block, or an unclosed fence running to the end (mid-stream text).
_FENCED_RE = re.compile(r"```[\s\S]*?(?:```|\Z)")
# "### A" split as "#" + blank line + "## A" by older normalizer versions; rejoined.
_SPLIT_HEADING_RE = re.compile(r"(?m)^(#{1,6})[ \t]*\n(?:[ \t]*\n)*(#{1,6})([ \t]+)")
# A heading marker after text on the same line ("EE #### 1. Title"); the whole marker
# moves, and "C# is" (no space before "#") is left alone.
_MID_LINE_HEADING_RE = re.compile(r"(?<=\S)[ \t]+(#{1,6}[ \t]+)")


def _outside_fences(text: str, fn: Callable[[str], str]) -> str:
    """Apply ``fn`` to the prose between code fences; code stays byte-identical."""
    parts, last = [], 0
    for match in _FENCED_RE.finditer(text):
        parts.append(fn(text[last:match.start()]))
        parts.append(match.group(0))
        last = match.end()
    parts.append(fn(text[last:]))
    return "".join(parts)


def _rejoin_split_heading(match: "re.Match[str]") -> str:
    level = min(6, len(match.group(1)) + len(match.group(2)))
    return "#" * level + match.group(3)


def _space_headings(prose: str) -> str:
    prose = _SPLIT_HEADING_RE.sub(_rejoin_split_heading, prose)
    # Mid-line ATX headers "### A #### B" → each heading on its own block
    # (before list unjam so "#### 1. Title" stays a heading, not an ordered list).
    return _MID_LINE_HEADING_RE.sub(r"\n\n\1", prose)


def _blank_line_before_headings(prose: str) -> str:
    return re.sub(r"([^\n])\n(#{1,6}[ \t]+)", r"\1\n\n\2", prose)


def _bullet_outside_bold(match: "re.Match[str]") -> str:
    """" - " inside a bold name ("**Lip Balm - Set of 2**") is part of the name."""
    text = match.string
    line_start = text.rfind("\n", 0, match.start()) + 1
    if text.count("**", line_start, match.start()) % 2:
        return match.group(0)
    return "\n- "


def normalize_assistant_markdown_spacing(text: Optional[str]) -> Optional[str]:
    """
    Turn jammed inline lists and code fences into Markdown-friendly line breaks.

    Does not rewrite wording. Safe for None / empty.
    """
    if text is None:
        return None
    if not str(text).strip():
        return text

    t = str(text).replace("\r\n", "\n").replace("\r", "\n")
    t = _outside_fences(t, _space_headings)
    # "Section: - item" / "**Steps:** - item" → section then list on new lines
    t = re.sub(r":(\*\*)?[ \t]*-[ \t]+", r":\1\n\n- ", t)
    # Jammed inline list markers " - next" → newline + bullet (not already at BOL)
    t = re.sub(r"(?<!\n)[ \t]+-[ \t]+", _bullet_outside_bold, t)
    # Jammed ordered markers " 1. next" / " 2. next" (not ATX "#### 1. Title")
    t = re.sub(r"(?<![#\n])[ \t]+(\d+)\.[ \t]+", r"\n\1. ", t)
    # Any fence glued to prior text (open or close) → start on its own line
    t = re.sub(r"([^\n])```", r"\1\n\n```", t)
    # ```lang jammed content on same line → language on fence line, body next
    t = re.sub(r"```([a-zA-Z0-9_-]+)[ \t]+", r"```\1\n", t)
    # Blank line before AT headers when already on their own line after prior text
    t = _outside_fences(t, _blank_line_before_headings)
    # Blank line after a paragraph before a section label that opens a list
    t = re.sub(
        r"([^\n])\n([^\n]{1,80}:\n\n- )",
        r"\1\n\n\2",
        t,
    )
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()
