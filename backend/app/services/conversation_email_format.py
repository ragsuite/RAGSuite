"""Formatting helpers for chat conversation transcript emails."""

from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from typing import Any, List, Mapping, Optional, Sequence, Tuple

_MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)

_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
_CODE_RE = re.compile(r"`([^`]+)`")
_HEADING_RE = re.compile(r"^#{1,6}\s+")
_UL_RE = re.compile(r"^[-*+]\s+")
_OL_RE = re.compile(r"^\d+\.\s+")


def format_conversation_timestamp(value: Any) -> str:
    """Human-readable UTC stamp, e.g. '17 Sep 2026, 04:48 UTC'."""
    if value is None:
        return ""
    dt: Optional[datetime] = None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return ""
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return raw
    else:
        return str(value).strip()

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    return f"{dt.day} {_MONTHS[dt.month - 1]} {dt.year}, {dt.hour:02d}:{dt.minute:02d} UTC"


def markdown_to_plain_text(text: str) -> str:
    """Strip common markdown markers while preserving line structure."""
    if not text:
        return ""
    lines: List[str] = []
    for line in text.replace("\r\n", "\n").split("\n"):
        line = _HEADING_RE.sub("", line)
        line = _UL_RE.sub("• ", line)
        line = _LINK_RE.sub(r"\1 (\2)", line)
        line = _BOLD_RE.sub(r"\1", line)
        line = re.sub(r"__([^_]+)__", r"\1", line)
        line = _ITALIC_RE.sub(r"\1", line)
        line = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"\1", line)
        line = _CODE_RE.sub(r"\1", line)
        lines.append(line.rstrip())
    return "\n".join(lines).strip()


def markdown_to_email_html(text: str) -> str:
    """Convert limited markdown to email-safe HTML (escape + safe tags)."""
    if not text:
        return ""

    raw_lines = text.replace("\r\n", "\n").split("\n")
    parts: List[str] = []
    list_type: Optional[str] = None  # "ul" | "ol"

    def close_list() -> None:
        nonlocal list_type
        if list_type:
            parts.append(f"</{list_type}>")
            list_type = None

    def inline_html(raw: str) -> str:
        placeholders: List[str] = []

        def _stash(html_snippet: str) -> str:
            placeholders.append(html_snippet)
            return f"@@PH{len(placeholders) - 1}@@"

        def _stash_code(m: re.Match[str]) -> str:
            return _stash(f"<code>{html.escape(m.group(1))}</code>")

        def _stash_link(m: re.Match[str]) -> str:
            label = html.escape(m.group(1))
            url_raw = m.group(2).strip()
            if not re.match(r"^(?:https?:|mailto:)", url_raw, re.I):
                return _stash(label)
            return _stash(
                f'<a href="{html.escape(url_raw, quote=True)}">{label}</a>'
            )

        work = _CODE_RE.sub(_stash_code, raw)
        work = _LINK_RE.sub(_stash_link, work)
        work = html.escape(work)
        work = _BOLD_RE.sub(r"<strong>\1</strong>", work)
        work = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", work)
        work = _ITALIC_RE.sub(r"<em>\1</em>", work)
        work = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"<em>\1</em>", work)
        for i, ph in enumerate(placeholders):
            work = work.replace(f"@@PH{i}@@", ph)
        return work

    for line in raw_lines:
        stripped = line.strip()
        if not stripped:
            close_list()
            parts.append("<br/>")
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            close_list()
            level = min(len(heading.group(1)) + 2, 6)  # h3–h6
            parts.append(
                f'<h{level} style="margin:12px 0 6px;font-size:15px;">'
                f"{inline_html(heading.group(2))}</h{level}>"
            )
            continue

        ul = _UL_RE.match(stripped)
        ol = _OL_RE.match(stripped)
        if ul or ol:
            kind = "ul" if ul else "ol"
            if list_type != kind:
                close_list()
                list_type = kind
                parts.append(f'<{kind} style="margin:8px 0 8px 20px;padding:0;">')
            item = _UL_RE.sub("", stripped) if ul else _OL_RE.sub("", stripped)
            parts.append(f'<li style="margin:0 0 4px;">{inline_html(item)}</li>')
            continue

        close_list()
        parts.append(f'<p style="margin:0 0 8px;">{inline_html(stripped)}</p>')

    close_list()
    return "".join(parts)


def normalize_email_sources(sources: Any) -> List[Tuple[str, str]]:
    """Return (title, url) pairs from ChatMessage.sources JSON."""
    if not sources or not isinstance(sources, (list, tuple)):
        return []
    out: List[Tuple[str, str]] = []
    seen: set[str] = set()
    for item in sources:
        if not isinstance(item, Mapping):
            continue
        url = str(
            item.get("url")
            or item.get("source_url")
            or item.get("source_link")
            or item.get("link")
            or ""
        ).strip()
        if not url or url in seen:
            continue
        title = str(item.get("title") or item.get("name") or url).strip() or url
        seen.add(url)
        out.append((title, url))
    return out


def render_sources_plain(sources: Sequence[Tuple[str, str]]) -> List[str]:
    if not sources:
        return []
    lines = ["Sources:"]
    for i, (title, url) in enumerate(sources, start=1):
        lines.append(f"{i}. {title}")
        lines.append(f"   {url}")
    return lines


def render_sources_html(sources: Sequence[Tuple[str, str]]) -> str:
    if not sources:
        return ""
    items = []
    for i, (title, url) in enumerate(sources, start=1):
        items.append(
            f'<li style="margin:0 0 6px;">'
            f'<strong>{html.escape(title)}</strong><br/>'
            f'<a href="{html.escape(url, quote=True)}" style="color:#2E6A4E;word-break:break-all;">'
            f"{html.escape(url)}</a></li>"
        )
    return (
        '<div style="margin:8px 0 16px;padding:10px 12px;background:#F4F1EA;'
        'border:1px solid #DED7C7;border-radius:8px;">'
        '<p style="margin:0 0 8px;font-size:13px;font-weight:600;">Sources</p>'
        f'<ol style="margin:0;padding-left:20px;font-size:13px;">{"".join(items)}</ol>'
        "</div>"
    )
