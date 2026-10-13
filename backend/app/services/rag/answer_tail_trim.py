"""Trim the half-written end of a markdown answer that was stopped at the token cap."""
from __future__ import annotations

import re
from typing import List, Optional

TERMINAL_CHARS = ".!?…。！？؟)\"'”’»"
_MIN_KEEP_RATIO = 0.4
_SENTENCE_END_RE = re.compile(r"[.!?…。！？؟](?:[*_)\"'”’»]*)(?=\s|$)")
# Short tokens whose trailing period is not a sentence end ("Rs. 72,990", "z. B.", "No. 5").
_ABBREVIATIONS = frozenset({
    "rs", "no", "nr", "nos", "dr", "mr", "mrs", "ms", "st", "vs", "ca", "approx", "art",
    "ref", "inkl", "bzw", "z", "b", "u", "a", "e", "g", "i", "etc", "fig", "max", "min",
})
_WORD_BEFORE_RE = re.compile(r"([^\W\d_]+)$")
_HEADING_RE = re.compile(r"^#{1,6}(?:[ \t].*)?$")
_BOLD_LABEL_RE = re.compile(r"^(?:\*\*|__)[^*_]+(?:\*\*|__):?$")
_LIST_MARKER_ONLY_RE = re.compile(r"^(?:[-*+]|\d+[.)])$")
_LIST_PREFIX_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
_TOP_LEVEL_ITEM_RE = re.compile(r"^(?:[-*+]|\d+[.)])\s+")


def _strip_emphasis(line: str) -> str:
    return line.rstrip().rstrip("*_`~ \t")


def _line_complete(line: str) -> bool:
    s = line.rstrip()
    if not s:
        return True
    if s.count("**") % 2 or s.count("`") % 2:
        return False
    if s.lstrip().startswith("|"):
        return s.endswith("|")
    if _HEADING_RE.match(s.strip()) or s.endswith(":"):
        return False
    core = _strip_emphasis(s)
    return bool(core) and core[-1] in TERMINAL_CHARS


def _is_abbreviation(text: str, dot_index: int) -> bool:
    if text[dot_index] != ".":
        return False
    word = _WORD_BEFORE_RE.search(text[:dot_index])
    return bool(word) and word.group(1).lower() in _ABBREVIATIONS


def _cut_to_sentence(text: str) -> str:
    """Text up to (and including) its last complete sentence, or ``""``."""
    last = None
    for match in _SENTENCE_END_RE.finditer(text):
        if not _is_abbreviation(text, match.start()):
            last = match
    if last is None:
        return ""
    cut = text[: last.end()].rstrip()
    if cut.count("**") % 2 or cut.count("`") % 2:
        return ""
    if len(_LIST_PREFIX_RE.sub("", cut).strip()) < 3:
        return ""
    return cut


def _is_orphan(line: str) -> bool:
    s = line.strip()
    if not s:
        return True
    if _HEADING_RE.match(s) or _LIST_MARKER_ONLY_RE.match(s):
        return True
    if s.endswith(":") or s.endswith(":**") or s.endswith(":__"):
        return True
    return bool(_BOLD_LABEL_RE.match(s))


def _drop_last_list_item(lines: List[str]) -> List[str]:
    """Remove the last top-level list item together with its nested lines."""
    for idx in range(len(lines) - 1, -1, -1):
        if _TOP_LEVEL_ITEM_RE.match(lines[idx]):
            return lines[:idx]
        if lines[idx].strip() and not lines[idx][:1].isspace():
            break
    return lines[:-1]


def trim_incomplete_tail(text: Optional[str]) -> str:
    """Drop the half-written end of an answer that was stopped at the token cap.

    A cut inside a list drops that whole item (a product without its price is worse
    than one item fewer); a cut inside prose keeps the last complete sentence.
    """
    original = (text or "").rstrip()
    if not original:
        return original
    body = original
    if body.count("```") % 2:
        body = body[: body.rfind("```")].rstrip()

    lines = body.split("\n")
    if lines and not _line_complete(lines[-1]):
        if _LIST_PREFIX_RE.match(lines[-1]) or lines[-1][:1].isspace():
            lines = _drop_last_list_item(lines)
        else:
            lines[-1] = _cut_to_sentence(lines[-1])
    while lines and _is_orphan(lines[-1]):
        lines.pop()
    out = "\n".join(lines).rstrip()

    if len(out) >= _MIN_KEEP_RATIO * len(original):
        return out
    best = max(out, _cut_to_sentence(body), key=len)
    return best or original
