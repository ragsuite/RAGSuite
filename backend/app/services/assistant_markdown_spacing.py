"""Light spacing fix for jammed assistant markdown (lists / fences)."""

from __future__ import annotations

import re
from typing import Optional


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
    # Mid-line ATX headers "### A #### B" → each heading on its own block
    # (before list unjam so "#### 1. Title" stays a heading, not an ordered list).
    t = re.sub(r"(?<!\n)(#{1,6}[ \t]+)", r"\n\n\1", t)
    # "Section: - item" / "**Steps:** - item" → section then list on new lines
    t = re.sub(r":(\*\*)?[ \t]*-[ \t]+", r":\1\n\n- ", t)
    # Jammed inline list markers " - next" → newline + bullet (not already at BOL)
    t = re.sub(r"(?<!\n)[ \t]+-[ \t]+", "\n- ", t)
    # Jammed ordered markers " 1. next" / " 2. next" (not ATX "#### 1. Title")
    t = re.sub(r"(?<![#\n])[ \t]+(\d+)\.[ \t]+", r"\n\1. ", t)
    # Any fence glued to prior text (open or close) → start on its own line
    t = re.sub(r"([^\n])```", r"\1\n\n```", t)
    # ```lang jammed content on same line → language on fence line, body next
    t = re.sub(r"```([a-zA-Z0-9_-]+)[ \t]+", r"```\1\n", t)
    # Blank line before AT headers when already on their own line after prior text
    t = re.sub(r"([^\n])\n(#{1,6}[ \t]+)", r"\1\n\n\2", t)
    # Blank line after a paragraph before a section label that opens a list
    t = re.sub(
        r"([^\n])\n([^\n]{1,80}:\n\n- )",
        r"\1\n\n\2",
        t,
    )
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()
