"""Readable plain text of a crawled HTML page for chunking and keyword search.

``get_text()`` without a separator glues neighbouring blocks and table cells together
("102510.00.00.36…", "Sole-Master-DryDie"), which hurts both embeddings and full-text
matching. This extractor keeps one line per block, writes table rows as
``cell | cell``, separates layout spans, and drops UI noise that is never page content:
dialogs and lightbox templates, data-entry forms (search, contact, share-by-email) and
form controls. Exact repeats of long lines (carousel captions) are kept once.

Works on a copy, so the caller's soup (used afterwards for link discovery) is unchanged.
"""
from __future__ import annotations

import copy
import logging
import re
from typing import List

from bs4 import BeautifulSoup
from bs4.element import Comment, Declaration, Doctype, NavigableString, ProcessingInstruction, Tag

logger = logging.getLogger(__name__)

BLOCK_TAGS = frozenset(
    "address article aside blockquote body caption dd details dialog div dl dt fieldset "
    "figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre "
    "section summary table tbody tfoot thead ul".split()
)
# Layout wrappers that sites style as blocks/flex items; a space between neighbours is
# always safe for them, unlike formatting tags (b, em, sup) used inside words.
SOFT_BREAK_TAGS = frozenset("span label a time data output font cite small".split())
NOISE_TAGS = ("script", "style", "noscript", "template", "svg", "canvas", "iframe", "object",
              "embed", "select", "option", "textarea", "input", "datalist")
HIDDEN_SELECTOR = "[hidden]:not([hidden=until-found])"
DIALOG_SELECTOR = "dialog, [role=dialog], [role=alertdialog], .modal, .mfp-hide"
# Data-entry controls only: a close <button> does not make a long dialog UI noise.
CONTROL_TAGS = ("form", "input", "select", "textarea")
TEXT_INPUT_TYPES = frozenset({"", "text", "email", "tel", "password", "search", "number", "url"})
# Notices and prompts are short; a long dialog (team bio, product details) is kept.
MAX_DIALOG_TEXT_CHARS = 800
# A data-entry form is short; a form wrapping the whole page (ASP.NET) is never dropped.
MAX_FORM_TEXT_CHARS = 2000
MIN_REPEAT_LINE_CHARS = 25
_SKIP_STRINGS = (Comment, Declaration, Doctype, ProcessingInstruction)
_WS_RE = re.compile(r"\s+")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([.,;:!?%)\]])")
_SPACE_AFTER_OPEN_RE = re.compile(r"([(\[])\s+")


def _text_len(node: Tag) -> int:
    return len(node.get_text(" ", strip=True))


def _is_ui_dialog(node: Tag) -> bool:
    return node.find(CONTROL_TAGS) is not None or _text_len(node) <= MAX_DIALOG_TEXT_CHARS


def _is_data_entry_form(form: Tag) -> bool:
    if form.find(["table", "main", "article", "h1"]):
        return False
    has_text_field = form.find("textarea") is not None or any(
        (inp.get("type") or "").strip().lower() in TEXT_INPUT_TYPES for inp in form.find_all("input")
    )
    return has_text_field and _text_len(form) <= MAX_FORM_TEXT_CHARS


def _decompose_where(nodes, keep_if=None) -> None:
    for node in list(nodes):
        if node.decomposed or (keep_if is not None and not keep_if(node)):
            continue
        node.decompose()


def strip_page_noise(root: Tag) -> None:
    """Remove hidden nodes, UI dialogs, data-entry forms and form controls (in place)."""
    _decompose_where(root.select(HIDDEN_SELECTOR))
    _decompose_where(root.select(DIALOG_SELECTOR), keep_if=_is_ui_dialog)
    _decompose_where(root.find_all("form"), keep_if=_is_data_entry_form)
    _decompose_where(root.find_all(NOISE_TAGS))


class _LineBuilder:
    def __init__(self) -> None:
        self.lines: List[str] = []
        self._parts: List[str] = []

    def text(self, value: str) -> None:
        if value:
            self._parts.append(value)

    def soft_break(self) -> None:
        if self._parts and not self._parts[-1].endswith(" "):
            self._parts.append(" ")

    def line_break(self) -> None:
        line = _WS_RE.sub(" ", "".join(self._parts)).strip()
        line = _SPACE_AFTER_OPEN_RE.sub(r"\1", _SPACE_BEFORE_PUNCT_RE.sub(r"\1", line))
        if line:
            self.lines.append(line)
        self._parts = []

    def finish(self) -> List[str]:
        self.line_break()
        return self.lines


def _cell_text(cell: Tag) -> str:
    builder = _LineBuilder()
    _walk(cell, builder)
    pieces: List[str] = []
    for line in builder.finish():
        if not pieces or pieces[-1] != line:
            pieces.append(line)
    return " ".join(pieces)


def _row_text(row: Tag) -> str:
    cells: List[str] = []
    for cell in row.find_all(["td", "th"], recursive=False):
        value = _cell_text(cell)
        if value:
            cells.append(value)
    return " | ".join(cells)


def _walk(node: Tag, out: _LineBuilder) -> None:
    for child in node.children:
        if isinstance(child, NavigableString):
            if not isinstance(child, _SKIP_STRINGS):
                out.text(str(child))
            continue
        if not isinstance(child, Tag):
            continue
        name = child.name
        if name == "br":
            out.line_break()
        elif name == "tr":
            out.line_break()
            out.text(_row_text(child))
            out.line_break()
        elif name in BLOCK_TAGS:
            out.line_break()
            _walk(child, out)
            out.line_break()
        elif name in SOFT_BREAK_TAGS:
            out.soft_break()
            _walk(child, out)
            out.soft_break()
        else:
            _walk(child, out)


def _drop_repeats(lines: List[str]) -> List[str]:
    seen = set()
    kept: List[str] = []
    for line in lines:
        if kept and kept[-1] == line:
            continue
        if len(line) >= MIN_REPEAT_LINE_CHARS:
            if line in seen:
                continue
            seen.add(line)
        kept.append(line)
    return kept


def extract_page_text(root: Tag) -> str:
    """Newline-separated readable text of ``root`` (a soup, ``<body>`` or content element)."""
    if root is None:
        return ""
    work = copy.copy(root)
    try:
        strip_page_noise(work)
        builder = _LineBuilder()
        _walk(work, builder)
        lines = builder.finish()
    except RecursionError:
        logger.warning("html_page_text: document too deeply nested; using flat text")
        lines = [ln for ln in (_WS_RE.sub(" ", s).strip() for s in work.get_text("\n").split("\n")) if ln]
    return "\n".join(_drop_repeats(lines))


def html_to_page_text(html: str) -> str:
    """Convenience wrapper for raw HTML strings."""
    return extract_page_text(BeautifulSoup(html or "", "html.parser"))
