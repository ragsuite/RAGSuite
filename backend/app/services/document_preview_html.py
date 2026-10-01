"""
Browser-viewable previews for stored documents.

Browsers download Office / JSON files instead of showing them, so "Open" on a
spreadsheet or deck used to trigger a download. ``render_preview_html`` turns
stored bytes into a self-contained HTML page (escaped text, no scripts); file
types without a renderer get a page that explains why and offers a Download link.
"""
from __future__ import annotations

import html
import logging
import os
from typing import Callable, Dict, Optional, Tuple

from app.services.document_preview_renderers import (
    render_delimited,
    render_presentation,
    render_spreadsheet,
    render_text,
    render_word,
)

logger = logging.getLogger(__name__)

KIND_NATIVE = "native"  # PDF, images, plain text — the browser renders raw bytes inline
KIND_HTML = "html"  # uploaded HTML — served raw but sandboxed (no scripts)
KIND_SPREADSHEET = "spreadsheet"
KIND_DELIMITED = "delimited"  # CSV / TSV (Chrome downloads text/csv)
KIND_PRESENTATION = "presentation"
KIND_WORD = "word"
KIND_TEXT = "text"
KIND_UNSUPPORTED = "unsupported"

PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
SANDBOXED_HTML_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: https:"

_EXT_KINDS = {
    ".xlsx": KIND_SPREADSHEET,
    ".xlsm": KIND_SPREADSHEET,
    ".pptx": KIND_PRESENTATION,
    ".docx": KIND_WORD,
    ".html": KIND_HTML,
    ".htm": KIND_HTML,
    ".json": KIND_TEXT,
    ".xml": KIND_TEXT,
    ".md": KIND_TEXT,
    ".csv": KIND_DELIMITED,
    ".tsv": KIND_DELIMITED,
    ".pdf": KIND_NATIVE,
    ".txt": KIND_NATIVE,
}

Renderer = Callable[[bytes], Tuple[str, Optional[str]]]
_RENDERERS: Dict[str, Renderer] = {
    KIND_SPREADSHEET: render_spreadsheet,
    KIND_DELIMITED: render_delimited,
    KIND_PRESENTATION: render_presentation,
    KIND_WORD: render_word,
    KIND_TEXT: render_text,
}

_UNSUPPORTED_MESSAGE = "A preview isn't available for this file type. Download the file to open it."
_FAILED_MESSAGE = "This file couldn't be previewed. Download it to open it in its app."


def _kind_from_media_type(mt: str) -> Optional[str]:
    if "spreadsheetml" in mt:
        return KIND_SPREADSHEET
    if "presentationml" in mt:
        return KIND_PRESENTATION
    if "wordprocessingml" in mt:
        return KIND_WORD
    if mt in ("text/html", "application/xhtml+xml"):
        return KIND_HTML
    if mt in ("text/csv", "text/tab-separated-values"):
        return KIND_DELIMITED
    if mt.startswith(("application/pdf", "image/")) or mt == "text/plain":
        return KIND_NATIVE
    if mt.startswith("text/") or mt in ("application/json", "application/xml") or mt.endswith(("+json", "+xml")):
        return KIND_TEXT
    return None


def preview_kind(media_type: str, filename: str) -> str:
    """Classify how a document can be shown in a browser tab."""
    mt = (media_type or "").split(";")[0].strip().lower()
    kind = _kind_from_media_type(mt)
    if kind:
        return kind
    ext = os.path.splitext((filename or "").strip().lower())[1]
    return _EXT_KINDS.get(ext, KIND_UNSUPPORTED)


_PAGE_CSS = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1f2328; background: #f7f7f5; }
header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; background: #fff; border-bottom: 1px solid #e3e3df; }
header h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.download { padding: 6px 14px; border: 1px solid #d0d0cb; border-radius: 8px; color: #1f2328;
  background: #fff; text-decoration: none; font-weight: 500; white-space: nowrap; }
.download:hover { background: #f0f0ec; }
main { padding: 16px; }
.notice { margin: 0 0 12px; padding: 8px 12px; border-radius: 8px; background: #fff6db; color: #6b5100; }
.empty { max-width: 32rem; margin: 15vh auto; text-align: center; color: #57606a; }
.empty .download { display: inline-block; margin-top: 12px; }
nav.sheets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
nav.sheets a { padding: 4px 10px; border-radius: 999px; background: #fff; border: 1px solid #e3e3df;
  color: #1f2328; text-decoration: none; }
section.sheet { margin-bottom: 24px; }
section.sheet h2, section.slide h2 { margin: 0 0 8px; font-size: 15px; }
.grid { overflow: auto; max-height: 75vh; background: #fff; border: 1px solid #e3e3df; border-radius: 8px; }
table { border-collapse: collapse; font-size: 13px; }
th, td { border: 1px solid #e6e6e2; padding: 4px 8px; text-align: left; vertical-align: top;
  min-width: 7rem; max-width: 28rem; white-space: pre-wrap; overflow-wrap: break-word; }
th.rownum { min-width: 0; }
thead th { position: sticky; top: 0; background: #f2f2ee; font-weight: 600; color: #57606a; }
th.rownum { background: #f2f2ee; color: #8c959f; font-weight: 400; text-align: right; }
section.slide { max-width: 60rem; margin: 0 auto 16px; padding: 20px 24px; background: #fff;
  border: 1px solid #e3e3df; border-radius: 10px; }
.slide-num { font-size: 12px; color: #8c959f; margin-bottom: 4px; }
.slide img { max-width: 100%; height: auto; margin: 8px 0; }
.notes { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #d0d0cb; color: #57606a; }
article.doc { max-width: 52rem; margin: 0 auto; padding: 24px 32px; background: #fff;
  border: 1px solid #e3e3df; border-radius: 10px; }
pre { margin: 0; padding: 16px; background: #fff; border: 1px solid #e3e3df; border-radius: 8px;
  overflow: auto; white-space: pre-wrap; word-break: break-word; font: 13px/1.5 ui-monospace, Menlo, monospace; }
"""


def _download_link(download_url: Optional[str]) -> str:
    if not download_url:
        return ""
    return f'<a class="download" href="{html.escape(download_url, quote=True)}" download>Download</a>'


def render_preview_html(
    data: bytes,
    *,
    title: str,
    kind: str,
    download_url: Optional[str] = None,
    embedded: bool = False,
) -> str:
    """Return a full HTML page previewing ``data`` (always succeeds).

    ``embedded`` drops the title bar for hosts that already show title and Download (the inspector).
    """
    body: Optional[str] = None
    notice: Optional[str] = None
    message = _UNSUPPORTED_MESSAGE
    renderer = _RENDERERS.get(kind)
    if renderer is not None:
        try:
            body, notice = renderer(data)
        except Exception as exc:  # corrupt or password-protected files
            logger.info("Document preview failed (%s): %s", kind, exc)
            message = _FAILED_MESSAGE
    if body is None:
        body = f'<div class="empty"><p>{html.escape(message)}</p>{_download_link(download_url)}</div>'

    safe_title = html.escape(title or "Document")
    notice_html = f'<p class="notice">{html.escape(notice)}</p>' if notice else ""
    header = "" if embedded else f"<header><h1>{safe_title}</h1>{_download_link(download_url)}</header>"
    return (
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        f"<title>{safe_title}</title><style>{_PAGE_CSS}</style></head><body>"
        f"{header}<main>{notice_html}{body}</main></body></html>"
    )
