"""Which discovered links a site crawl should follow, and in what canonical form.

Storefronts and CMSs expose many URLs that are not pages a visitor reads:
cart permalinks, oEmbed / feed endpoints, analytics-tagged duplicates of the
same page and ``#fragment`` anchors. Following them burns the page / runtime
budget on duplicates and keeps real pages (FAQ, policies) from being reached.
"""
from __future__ import annotations

import re
from typing import Callable, Iterable, List, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Query parameters that only tag a visit (campaign, click id, recommendation
# tracking) and never change the page content.
_TRACKING_PARAM_PREFIXES = ("utm_", "pr_", "_ga", "_gl")
_TRACKING_PARAMS = frozenset({
    "gclid", "fbclid", "msclkid", "dclid", "yclid", "mc_cid", "mc_eid",
    "_pos", "_sid", "_ss", "_psq", "_fid",
})

# Feed / embed endpoints that mirror a page in a machine format.
_MACHINE_SUFFIXES = (".oembed", ".atom", ".rss")
_MACHINE_SEGMENTS = frozenset({".well-known", "cdn-cgi"})

# Shop flows: never content, and every cart link is a unique URL.
_TRANSACTIONAL_ROOTS = frozenset({"cart", "checkout", "checkouts"})
_AUTH_LEAVES = frozenset({"login", "logout", "register", "recover", "signin", "sign-in", "signup", "sign-up"})

_LOCALE_SEGMENT = re.compile(r"^[a-z]{2}([-_][a-z]{2,4})?$", re.IGNORECASE)

# ``<link rel=…>`` values that point at another readable page.
_PAGE_LINK_RELS = frozenset({"alternate", "next", "prev", "previous", "canonical"})
_PAGE_LINK_TYPES = frozenset({"", "text/html", "application/xhtml+xml"})


def _is_tracking_param(name: str) -> bool:
    lowered = name.lower()
    return lowered in _TRACKING_PARAMS or lowered.startswith(_TRACKING_PARAM_PREFIXES)


def normalize_discovered_url(url: str) -> str:
    """Drop ``#fragment`` and tracking query parameters; keep everything else."""
    if not url:
        return url
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return url
    query = parts.query
    if query:
        kept = [(k, v) for k, v in parse_qsl(query, keep_blank_values=True) if not _is_tracking_param(k)]
        query = urlencode(kept, doseq=True)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


def non_content_reason(url: str) -> Optional[str]:
    """Return a skip reason when ``url`` is a machine or shop-flow endpoint, else ``None``."""
    path = urlsplit(url).path.lower()
    if path.endswith(_MACHINE_SUFFIXES):
        return "machine_endpoint"
    segments = [segment for segment in path.split("/") if segment]
    if any(segment in _MACHINE_SEGMENTS for segment in segments):
        return "machine_endpoint"
    if segments and _LOCALE_SEGMENT.match(segments[0]) and len(segments) > 1:
        segments = segments[1:]
    if not segments:
        return None
    if segments[0] in _TRANSACTIONAL_ROOTS:
        return "transactional_path"
    if segments[0] == "account" and (len(segments) == 1 or segments[-1] in _AUTH_LEAVES):
        return "transactional_path"
    if len(segments) == 1 and segments[0] in _AUTH_LEAVES:
        return "transactional_path"
    return None


def is_page_link_tag(tag) -> bool:
    """``<a>`` / ``<area>`` always; ``<link>`` only when it names another HTML page."""
    if getattr(tag, "name", None) != "link":
        return True
    rel = tag.get("rel") or []
    rels = {str(value).lower() for value in ([rel] if isinstance(rel, str) else rel)}
    if not rels & _PAGE_LINK_RELS:
        return False
    return str(tag.get("type") or "").split(";")[0].strip().lower() in _PAGE_LINK_TYPES


def collect_page_links(
    content_links: Iterable,
    chrome_links: Iterable,
    *,
    resolve: Callable[[str], str],
    max_links: int,
    is_excluded: Callable[[object], bool],
) -> List[str]:
    """Normalized URLs to follow from one page.

    ``content_links`` honour ``is_excluded`` and the ``max_links`` cap; a URL repeated
    on the page (product cards link image and title) counts once. Site header/footer
    ``chrome_links`` (FAQ, policies, contact) are always kept and uncapped: chrome text
    is stripped from pages, not its navigation.
    """
    def _url(tag) -> Optional[str]:
        href = tag.get("href", "")
        if not href or not is_page_link_tag(tag):
            return None
        return normalize_discovered_url(resolve(href))

    urls: List[str] = []
    seen: set = set()
    for tag in content_links:
        if len(urls) >= max_links:
            break
        if is_excluded(tag):
            continue
        url = _url(tag)
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    for tag in chrome_links:
        url = _url(tag)
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls
