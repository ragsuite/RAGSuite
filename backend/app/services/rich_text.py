"""Rich text (editor HTML) helpers for FAQ answers and Text / Q&A sources.

The allowlist mirrors ``frontend/src/shared/utils/rich-text/rich-text-schema.ts``;
keep both in sync. Plain-text values are never rewritten, so legacy data and
non-editor callers behave exactly as before.
"""
from __future__ import annotations

import html
import re
from typing import List, Optional

import nh3
from bs4 import BeautifulSoup, NavigableString, Tag

ALLOWED_TAGS = frozenset({
    "p", "br", "strong", "b", "em", "i", "sub", "sup", "code", "pre", "mark", "span",
    "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "hr", "a",
    "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td",
})
_GLOBAL_ATTRS = {"class", "style"}
ALLOWED_ATTRIBUTES = {
    "*": _GLOBAL_ATTRS,
    "a": _GLOBAL_ATTRS | {"href", "target"},
    "ol": _GLOBAL_ATTRS | {"start"},
    "td": _GLOBAL_ATTRS | {"colspan", "rowspan"},
    "th": _GLOBAL_ATTRS | {"colspan", "rowspan"},
}
ALLOWED_STYLE_PROPERTIES = frozenset({"text-align", "width", "min-width"})
LINK_SCHEMES = frozenset({"http", "https", "mailto", "tel"})
STYLE_CLASSES = frozenset({"rs-lead", "rs-small", "rs-muted"})
MAX_INDENT = 6

_HTML_TAG_RE = re.compile(
    r"</?(?:p|div|span|br|hr|h[1-6]|ul|ol|li|table|colgroup|col|thead|tbody|tr|th|td|strong|b|em|i|"
    r"sub|sup|mark|a|code|pre|blockquote|section|article|header|footer|nav|main|img|figure|figcaption)"
    r"(?:\s[^>]*)?/?>",
    re.IGNORECASE,
)
_EDITOR_HTML_RE = re.compile(r"^\s*<(?:p|h[1-6]|ul|ol|blockquote|pre|table|hr)\b", re.IGNORECASE)
_ANY_TAG_RE = re.compile(r"<[^>]*>")
_WS_RE = re.compile(r"\s+")
_INDENT_CLASS_RE = re.compile(r"^rs-indent-(\d)$")
_SOFT_HYPHEN = "\u00ad"
_BLOCK_TAGS = frozenset({
    "p", "div", "section", "article", "header", "footer", "nav", "main", "figure", "figcaption",
    "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "ul", "ol", "table", "hr", "li",
})


def is_rich_html(value: Optional[str]) -> bool:
    """True when *value* contains intentional HTML (same rule as the frontend ``isHtmlContent``)."""
    return bool(value) and bool(_HTML_TAG_RE.search(value.strip()))


def is_editor_html(value: Optional[str]) -> bool:
    """True for rich-editor output, which always opens with a block element.

    Stricter than ``is_rich_html`` so legacy plain text that merely mentions a tag
    keeps its exact indexing; mirrors the frontend ``isEditorHtml``.
    """
    return bool(value) and bool(_EDITOR_HTML_RE.match(value))


def editor_html_to_text(value: Optional[str]) -> str:
    """Index text for Text / Q&A sources: editor HTML becomes plain text, anything else is unchanged."""
    if not value:
        return ""
    return rich_html_to_text(value) if is_editor_html(value) else value


def _allowed_class(value: str) -> bool:
    if value in STYLE_CLASSES:
        return True
    match = _INDENT_CLASS_RE.match(value)
    return bool(match) and 1 <= int(match.group(1)) <= MAX_INDENT


def _attribute_filter(tag: str, attr: str, value: str) -> Optional[str]:
    if attr == "class":
        kept = " ".join(part for part in value.split() if _allowed_class(part))
        return kept or None
    if attr == "target":
        return value if value == "_blank" else None
    return value


def sanitize_rich_html(value: str) -> str:
    """Allowlist-sanitize editor HTML (scripts, handlers, unsafe URLs and unknown markup removed)."""
    if not value:
        return ""
    return nh3.clean(
        value,
        tags=set(ALLOWED_TAGS),
        attributes={tag: set(attrs) for tag, attrs in ALLOWED_ATTRIBUTES.items()},
        attribute_filter=_attribute_filter,
        filter_style_properties=set(ALLOWED_STYLE_PROPERTIES),
        url_schemes=set(LINK_SCHEMES),
        link_rel="noopener noreferrer",
        strip_comments=True,
    ).strip()


def rich_text_length(value: Optional[str]) -> int:
    """Visible characters used for limits (mirrors the frontend ``richTextLength``)."""
    if not value:
        return 0
    text = html.unescape(_ANY_TAG_RE.sub(" ", value)) if is_rich_html(value) else value
    return len(_WS_RE.sub(" ", text.replace(_SOFT_HYPHEN, "")).strip())


def normalize_rich_text(value: Optional[str]) -> str:
    """Sanitize HTML values, keep plain text as-is; empty editor output (``<p></p>``) becomes ``""``."""
    cleaned = (value or "").strip()
    if not cleaned or not is_rich_html(cleaned):
        return cleaned
    sanitized = sanitize_rich_html(cleaned)
    return sanitized if rich_text_length(sanitized) else ""


def validate_rich_text(value: Optional[str], *, field: str, max_visible: int, required: bool) -> str:
    """Pydantic-friendly check: visible length within *max_visible*; raises ``ValueError``.

    Raw size is bounded separately by the caller's ``max_length``.
    """
    cleaned = (value or "").strip()
    length = rich_text_length(cleaned)
    if required and length == 0:
        raise ValueError(f"{field} is required")
    if length > max_visible:
        raise ValueError(f"{field} must be {max_visible:,} characters or fewer")
    return cleaned


def _inline_text(node: Tag) -> str:
    parts: List[str] = []
    for child in node.descendants:
        if isinstance(child, NavigableString):
            if not any(parent.name == "pre" for parent in child.parents if isinstance(parent, Tag)):
                parts.append(_WS_RE.sub(" ", str(child)))
            else:
                parts.append(str(child))
        elif isinstance(child, Tag) and child.name == "br":
            parts.append("\n")
    text = "".join(parts).replace(_SOFT_HYPHEN, "")
    return "\n".join(line.strip() for line in text.split("\n")).strip()


def _list_lines(node: Tag, depth: int) -> List[str]:
    ordered = node.name == "ol"
    try:
        number = int(node.get("start") or 1)
    except (TypeError, ValueError):
        number = 1
    lines: List[str] = []
    for item in node.find_all("li", recursive=False):
        nested = [child for child in item.find_all(["ul", "ol"], recursive=False)]
        for child in nested:
            child.extract()
        marker = f"{number}." if ordered else "-"
        text = _inline_text(item)
        if text:
            lines.append(f"{'  ' * depth}{marker} {text}")
        for child in nested:
            lines.extend(_list_lines(child, depth + 1))
        number += 1
    return lines


def _table_lines(node: Tag) -> List[str]:
    rows: List[str] = []
    for row in node.find_all("tr"):
        cells = [_inline_text(cell) for cell in row.find_all(["th", "td"], recursive=False)]
        if any(cells):
            rows.append(" | ".join(cells))
    return rows


def _collect_blocks(node: Tag, out: List[str]) -> None:
    inline: List[str] = []

    def flush() -> None:
        text = "".join(inline)
        inline.clear()
        text = "\n".join(_WS_RE.sub(" ", line).strip() for line in text.replace(_SOFT_HYPHEN, "").split("\n"))
        if text.strip():
            out.append(text.strip())

    for child in list(node.children):
        if isinstance(child, NavigableString):
            inline.append(str(child))
            continue
        if not isinstance(child, Tag):
            continue
        name = child.name
        if name == "br":
            inline.append("\n")
            continue
        if name not in _BLOCK_TAGS:
            inline.append(_inline_text(child))
            continue
        flush()
        if name in ("ul", "ol"):
            lines = _list_lines(child, 0)
            if lines:
                out.append("\n".join(lines))
        elif name == "table":
            lines = _table_lines(child)
            if lines:
                out.append("\n".join(lines))
        elif name == "blockquote":
            quoted: List[str] = []
            _collect_blocks(child, quoted)
            if quoted:
                out.append("\n".join(f"> {line}" for block in quoted for line in block.split("\n")))
        elif name in ("div", "section", "article", "header", "footer", "nav", "main", "figure", "li"):
            _collect_blocks(child, out)
        elif name != "hr":
            text = _inline_text(child)
            if text:
                out.append(text)
    flush()


def rich_html_to_text(value: Optional[str]) -> str:
    """Readable plain text for embeddings, lexical search and LLM history.

    Headings and paragraphs become blocks, lists use ``-`` / ``1.`` markers,
    tables become ``a | b`` rows and blockquotes ``>`` lines. Plain text is returned unchanged.
    """
    if not value:
        return ""
    if not is_rich_html(value):
        return value.strip()
    soup = BeautifulSoup(value, "html.parser")
    blocks: List[str] = []
    _collect_blocks(soup, blocks)
    return "\n\n".join(blocks).strip()
