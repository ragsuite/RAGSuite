"""HTML helpers for RAG-friendly text extraction."""
from __future__ import annotations

import re
from urllib.parse import unquote

_GENERIC_MAIL_LABELS = re.compile(
    r"^(e-?mail\s*(senden|schreiben)?|send\s*e?-?mail|email|kontakt(\s*per\s*e-?mail)?)$",
    re.IGNORECASE,
)


def _normalize_mailto(href: str) -> str:
    href = unquote((href or "").strip())
    if not href.lower().startswith("mailto:"):
        return ""
    address = href[7:].split("?")[0].strip()
    return address if "@" in address else ""


def _normalize_tel(href: str) -> str:
    href = unquote((href or "").strip())
    if not href.lower().startswith("tel:"):
        return ""
    return href[4:].split("?")[0].strip()


def _digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def enrich_contact_links(soup) -> None:
    """Ensure mailto:/tel: targets are visible in plain-text extraction for RAG."""
    if soup is None:
        return

    for tag in soup.find_all("a", href=True):
        href = tag.get("href", "")
        link_text = tag.get_text(strip=True)

        email = _normalize_mailto(href)
        if email:
            if email.lower() not in link_text.lower():
                if not link_text or _GENERIC_MAIL_LABELS.match(link_text):
                    tag.clear()
                    tag.append(email)
                else:
                    tag.clear()
                    tag.append(f"{link_text} ({email})")
            continue

        phone = _normalize_tel(href)
        if not phone:
            continue

        phone_digits = _digits_only(phone)
        link_digits = _digits_only(link_text)
        if phone_digits and phone_digits in link_digits:
            continue

        if not link_text or len(link_digits) < 6:
            tag.clear()
            tag.append(phone)
        else:
            tag.clear()
            tag.append(f"{link_text} ({phone})")


def extract_canonical_page_url(soup, page_url: str) -> str:
    """Return same-host canonical URL from ``<link rel=\"canonical\">`` when present."""
    from urllib.parse import urljoin, urlparse

    if soup is None or not (page_url or "").strip():
        return (page_url or "").strip()

    page = (page_url or "").strip()
    page_host = (urlparse(page).netloc or "").lower()
    if not page_host:
        return page

    for tag in soup.find_all("link", rel=True):
        rel = tag.get("rel") or []
        if isinstance(rel, str):
            rel = [rel]
        if not any(str(r).lower() == "canonical" for r in rel):
            continue
        href = (tag.get("href") or "").strip()
        if not href:
            continue
        canonical = urljoin(page, href)
        parsed = urlparse(canonical)
        if parsed.scheme not in ("http", "https"):
            continue
        if (parsed.netloc or "").lower() != page_host:
            continue
        return canonical
    return page
