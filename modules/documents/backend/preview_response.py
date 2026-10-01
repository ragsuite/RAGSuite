"""Build ``?preview=1`` responses for the tokenized document content stream."""
from __future__ import annotations

from typing import Optional
from urllib.parse import quote

from fastapi.responses import HTMLResponse, Response

from app.services.document_preview_html import (
    KIND_HTML,
    KIND_NATIVE,
    PREVIEW_CSP,
    SANDBOXED_HTML_CSP,
    preview_kind,
    render_preview_html,
)

_NO_STORE = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}


def download_url_for(token: str) -> str:
    """Relative link from ``…/{id}/content-stream`` back to the same file as an attachment."""
    return f"content-stream?token={quote(token, safe='')}&download=1"


def build_preview_response(
    content: bytes,
    *,
    title: str,
    media_type: str,
    token: str,
    embedded: bool = False,
) -> Optional[Response]:
    """Return an inline preview, or ``None`` when the browser can render the raw bytes itself."""
    kind = preview_kind(media_type, title)
    if kind == KIND_NATIVE:
        return None
    if kind == KIND_HTML:
        return Response(
            content,
            media_type="text/html",
            headers={**_NO_STORE, "Content-Security-Policy": SANDBOXED_HTML_CSP},
        )
    page = render_preview_html(
        content, title=title, kind=kind, download_url=download_url_for(token), embedded=embedded
    )
    return HTMLResponse(page, headers={**_NO_STORE, "Content-Security-Policy": PREVIEW_CSP})
