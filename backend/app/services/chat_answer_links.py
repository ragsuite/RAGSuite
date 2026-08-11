"""Ensure verified source URLs appear in chat answers when the user seeks access."""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from .rag.utils_rag import normalize_url

# Whole-line denials (legacy).
_NO_LINK_DENIAL_LINE_RE = re.compile(
    r"(?i)^[^\n]*(?:"
    r"cannot provide (?:a )?direct link|"
    r"can't provide (?:a )?direct link|"
    r"unable to provide (?:a )?direct link|"
    r"cannot provide (?:a )?link(?!\s+to\s+the\s+resource)|"
    r"can't provide (?:a )?link(?!\s+to\s+the\s+resource)|"
    r"no direct link (?:is )?available|"
    r"link is not available|"
    r"do not include a direct link|"
    r"does not include a direct link|"
    r"documents do not include a direct link|"
    r"kein(?:en)? direkten link|"
    r"kann (?:ich )?keinen direkten link|"
    r"link ist nicht verfügbar"
    r")[^\n]*\.?\s*$",
    re.MULTILINE,
)

# Sentence-level denials and “go find it on the main site” workarounds.
_NO_LINK_DENIAL_SENTENCE_RE = [
    re.compile(
        r"(?is)\bunfortunately,?\s+the documents do not include a direct link[^.!?]*[.!?]\s*"
    ),
    re.compile(
        r"(?is)[^.!?]*\bdocuments do not include a direct link[^.!?]*[.!?]\s*"
    ),
    re.compile(
        r"(?is)[^.!?]*\bdo not include a direct link to[^.!?]*[.!?]\s*"
    ),
    re.compile(
        r"(?is)\bvisit the (?:main |organization(?:'s)? |company(?:'s)? )?website:\s*(?:https?://)?www\.[^\s.!?]+[^.!?]*[.!?]\s*"
    ),
    re.compile(
        r"(?is)\bnavigate to the [\"']?[\w\s]+[\"']? section[^.!?]*[.!?]\s*"
    ),
    re.compile(
        r"(?is)\bfor further assistance:\s*visit (?:the |our )?(?:main )?website[^.!?]*[.!?]\s*"
    ),
]

# Multilingual “user wants a link / page / URL” — not every “give me …” question.
# Geographic “where is X located?” is NOT access-seeking (see user_asks_geographic_location).
_USER_SEEKS_ACCESS_RE = [
    # “Where can I find …” / “Wo finde ich …” → looking for a page or resource
    re.compile(r"(?i)\b(where|wo)\b.{0,100}\b(find|finde)\b"),
    # “Where … locate/location” only when clearly about an online resource
    re.compile(
        r"(?i)\b(where|wo)\b.{0,100}\b(locate|location)\b.{0,60}\b"
        r"(online|page|link|url|website|webseite|webpage|pdf|document|seite)\b"
    ),
    re.compile(
        r"(?i)\b(gib mir|give me|send me|show me|zeig mir|schick mir)\b"
        r".{0,80}\b(link|url|website|webseite|page|seite|webpage)\b"
    ),
    re.compile(r"(?i)\b(link|url|website|webseite|page|seite|webpage)\b"),
    re.compile(r"(?i)\b(how do i get|how to get|wie komme ich|directions|anfahrt|weg dorthin)\b"),
    re.compile(r"(?i)\b(which page|welche seite)\b"),
    re.compile(
        r"(?i)\b(open|visit|besuchen|navigate)\b.{0,50}\b(site|website|page|seite)\b"
    ),
]

# Geographic / HQ location questions — answer with facts, do not inject arbitrary page links.
_GEOGRAPHIC_LOCATION_RE = [
    re.compile(
        r"(?i)\b(where|wo)\b.{0,100}\b("
        r"located|location|gelegen|liegt|ansässig|ansassig|based|"
        r"headquarter|headquarters|hq|office|standort|adresse|address"
        r")\b"
    ),
    re.compile(
        r"(?i)\b("
        r"headquarter|headquarters|hq|office location|company location|"
        r"standort|adresse|registered office|corporate office"
        r")\b"
    ),
]

_MAX_INJECTED_LINKS = 1
_JUNK_SOURCE_TITLES = frozenset({"no title", "no title found", "untitled"})
_MIN_SIGNIFICANT_PATH_LEN = 2
_QUERY_TOKEN_STOPWORDS = frozenset(
    {
        "about", "and", "can", "could", "das", "dem", "den", "der", "des", "die",
        "ein", "eine", "einer", "eines", "for", "from", "give", "gib", "how",
        "ich", "ist", "link", "me", "mir", "mit", "not", "please", "should",
        "that", "the", "this", "und", "url", "what", "when", "where", "which",
        "who", "why", "with", "would", "you", "your", "finde", "find", "dazu",
    }
)
_PRACTICAL_LINE_HINTS = (
    "address", "straße", "strasse", "str.", "street", "phone", "tel", "email",
    "@", "tram", "bus", "direction", "anfahrt", "route", "contact", "kontakt",
    "leipziger", "postleitzahl", "plz", "+49", "http", "www.", "öffnung", "offnung",
    "hours", "öffnungszeiten", "offnungszeiten", "location", "standort", "adresse",
)


def source_url_line_for_context(meta: Any) -> str:
    """Optional ``Source URL:`` line for a retrieved chunk shown to the LLM."""
    if not isinstance(meta, dict):
        return ""
    url = (meta.get("url") or "").strip()
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return f"Source URL: {url}\n"
    return ""


_CHAT_SOURCE_URL_INSTRUCTION = (
    "SOURCE URLS: Source URLs in DOCUMENTS are for your grounding only. "
    "Do NOT include URLs, markdown links, or 'Link:' lines in your answer unless "
    "the user explicitly asks for a link, URL, webpage, or where to find something online. "
    "Geographic questions (where is X located / headquarters / address) are NOT link requests — "
    "answer with the place/address only; never append unrelated Link: lines. "
    "For normal questions, answer with facts only; users can open sources from the Sources panel. "
    "When the user explicitly asks for a link or page: answer in the SAME language as "
    "the user's question, give the main details first, then put one exact Source URL "
    "markdown link at the bottom. "
    "Never say a direct link is missing, unavailable, or not in the documents when "
    "Source URL is present in DOCUMENTS. "
    "Never send the user to a generic homepage to hunt for a page when the exact Source URL is shown. "
    "Do NOT describe medical conditions, services, or specialties beyond what was asked."
)

_CHAT_DIRECT_ANSWER_INSTRUCTION = (
    "OPENING: Never start with filler such as 'Based on the provided documents', "
    "'According to the documents', or 'Here is the relevant information'. Answer directly."
)

# Robotic RAG preambles to strip from user-visible chat answers.
_BOILERPLATE_OPENER_RE = [
    re.compile(
        r"(?is)^\s*based on the provided documents,?\s*here is (?:the )?(?:direct )?"
        r"(?:information|details)(?: regarding| about)?[^:\n]*:\s*"
    ),
    re.compile(
        r"(?is)^\s*based on the provided documents,?\s*"
    ),
    re.compile(
        r"(?is)^\s*according to the (?:provided )?documents,?\s*"
    ),
    re.compile(
        r"(?is)^\s*here is the (?:direct )?(?:relevant )?information(?: regarding| about)?[^:\n]*:\s*"
    ),
]


def chat_source_url_prompt_instruction() -> str:
    return f"{_CHAT_DIRECT_ANSWER_INSTRUCTION}\n{_CHAT_SOURCE_URL_INSTRUCTION}"


def strip_rag_boilerplate_openers(answer: str) -> str:
    """Remove robotic 'Based on the provided documents…' preambles."""
    if not (answer or "").strip():
        return answer or ""
    text = answer.strip()
    for pattern in _BOILERPLATE_OPENER_RE:
        text = pattern.sub("", text)
    return text.strip()


def user_asks_geographic_location(user_query: Optional[str]) -> bool:
    """True when the user asks where an entity is geographically located (not for a webpage)."""
    q = (user_query or "").strip()
    if not q:
        return False
    if not any(pattern.search(q) for pattern in _GEOGRAPHIC_LOCATION_RE):
        return False
    # Explicit online/page intent wins over geographic phrasing.
    online_explicit = re.search(
        r"(?i)\b(link|url|website|webseite|webpage|page|seite|pdf|online)\b",
        q,
    )
    if online_explicit and any(pattern.search(q) for pattern in _USER_SEEKS_ACCESS_RE):
        return False
    return True


def user_seeks_resource_access(user_query: Optional[str]) -> bool:
    """True when the user likely wants a page to open — without hardcoding only “link”/“url”."""
    q = (user_query or "").strip()
    if not q:
        return False
    # Geographic “where is X located?” must not inject arbitrary page links.
    if user_asks_geographic_location(q):
        return False
    return any(pattern.search(q) for pattern in _USER_SEEKS_ACCESS_RE)


def _fold_accents(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in folded if not unicodedata.combining(ch)).lower()


def _query_topic_tokens(user_query: Optional[str]) -> List[str]:
    if not (user_query or "").strip():
        return []
    folded = _fold_accents(user_query or "")
    words = re.findall(r"[\w]{3,}", folded, flags=re.UNICODE)
    out: List[str] = []
    seen: set = set()
    for word in words:
        if word in _QUERY_TOKEN_STOPWORDS or word in seen:
            continue
        seen.add(word)
        out.append(word)
    return out


def _source_relevance_score(user_query: Optional[str], source: Dict[str, str]) -> int:
    tokens = _query_topic_tokens(user_query)
    if not tokens:
        return 0
    url = (source.get("url") or "").strip()
    title = (source.get("title") or "").strip()
    hay = _fold_accents(f"{title} {_source_url_path(url).replace('/', ' ')}")
    score = 0
    for token in tokens:
        if token in hay:
            score += 3
            continue
        # Require meaningful length on both sides to avoid "is" matching inside "orthopadische".
        if len(token) >= 5:
            for hay_part in hay.split():
                if len(hay_part) < 5:
                    continue
                if hay_part in token or token in hay_part:
                    score += 1
                    break
    return score


def rank_sources_for_user_query(
    sources: List[Dict[str, str]],
    user_query: Optional[str],
) -> List[Dict[str, str]]:
    if not sources:
        return []
    ranked = sorted(
        sources,
        key=lambda s: (-_source_relevance_score(user_query, s), sources.index(s)),
    )
    return ranked


def _markdown_link_targets(answer: str) -> List[str]:
    return re.findall(r"\]\((https?://[^)\s]+)\)", answer or "", flags=re.IGNORECASE)


def _answer_has_correct_verified_url(answer: str, url: str) -> bool:
    """True only when the answer includes this exact source URL (not another page on same site)."""
    if answer_contains_verified_url(answer, url):
        return True
    targets = _markdown_link_targets(answer)
    want = _normalize_url_key(url)
    return any(_normalize_url_key(t) == want for t in targets)


def _answer_has_preferred_verified_source_url(
    answer: str,
    sources: List[Dict[str, str]],
    *,
    user_query: Optional[str] = None,
) -> bool:
    """True only when the answer already includes the best-ranked source URL."""
    best, score = _pick_best_source_for_access(sources, user_query)
    if not best or score <= 0:
        best = _best_source_for_answer_link(sources)
    if not best:
        return False
    url = (best.get("url") or "").strip()
    return bool(url) and _answer_has_correct_verified_url(answer, url)


def _line_without_urls(line: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line or "")
    return re.sub(r"https?://\S+|www\.\S+", "", text).strip()


def _line_looks_practical(line: str) -> bool:
    stripped = _line_without_urls(line)
    if not stripped:
        return False
    lower = _fold_accents(stripped)
    if stripped.startswith(("#", "-", "*")) and not any(h in lower for h in _PRACTICAL_LINE_HINTS):
        return False
    if any(h in lower for h in _PRACTICAL_LINE_HINTS):
        return True
    if re.search(r"\b\d{4,5}\b", stripped) and any(
        x in lower for x in ("straße", "strasse", "str.", "street", "road", "allee")
    ):
        return True
    return False


def _answer_has_access_filler(answer: str) -> bool:
    """True when the answer contains non-practical paragraphs beyond a link/location."""
    for line in (answer or "").split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if _line_looks_practical(stripped):
            continue
        body = _line_without_urls(stripped)
        if len(body) >= 25:
            return True
    return False


def _extract_practical_lines(answer: str) -> List[str]:
    """Keep short address/contact/direction lines; drop medical or specialty content."""
    lines: List[str] = []
    for line in (answer or "").split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if _line_looks_practical(stripped):
            lines.append(stripped)
    return lines[:6]


def build_access_focused_answer(
    best_source: Dict[str, str],
    original_answer: str,
    *,
    sources: Any = None,
    context_metadatas: Any = None,
    db: Any = None,
    project_id: Any = None,
) -> str:
    """Short answer for “where / link” questions: exact URL first, optional practical details only."""
    raw_url = (best_source.get("url") or "").strip()
    url = normalize_verified_source_url(
        raw_url,
        sources=sources,
        context_metadatas=context_metadatas,
        db=db,
        project_id=project_id,
    )
    title = (best_source.get("title") or "").strip() or url
    link = _format_markdown_link(title, url)
    cleaned = strip_rag_boilerplate_openers(
        strip_contradictory_no_link_denials(original_answer or "")
    )
    practical = _extract_practical_lines(cleaned)
    if practical:
        return f"{link}\n\n" + "\n".join(practical)
    return link


def _pick_best_source_for_access(
    sources: List[Dict[str, str]],
    user_query: Optional[str],
) -> Tuple[Optional[Dict[str, str]], int]:
    ranked = rank_sources_for_user_query(sources, user_query)
    if not ranked:
        return None, 0
    best = ranked[0]
    return best, _source_relevance_score(user_query, best)


def _normalize_url_key(url: str) -> str:
    u = normalize_url((url or "").strip()).rstrip("/").lower()
    if u.startswith("https://www."):
        return "https://" + u[12:]
    if u.startswith("http://www."):
        return "http://" + u[11:]
    return u


def _source_url_path(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.path or "").rstrip("/").lower()


def _has_significant_url_path(url: str) -> bool:
    path = _source_url_path(url).lstrip("/")
    return len(path) >= _MIN_SIGNIFICANT_PATH_LEN


def _url_variants_for_match(url: str) -> List[str]:
    """Fragments for full-URL presence checks (homepage sources only)."""
    raw = (url or "").strip()
    if not raw:
        return []

    keys: List[str] = []
    seen: set = set()

    def _add(value: str) -> None:
        v = (value or "").strip().lower()
        if v and v not in seen:
            seen.add(v)
            keys.append(v)

    _add(raw)
    _add(_normalize_url_key(raw))

    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    if parsed.netloc:
        path = (parsed.path or "").rstrip("/")
        _add(f"{parsed.netloc}{path}".lower())

    return keys


def _path_appears_in_answer(haystack: str, url: str) -> bool:
    path = _source_url_path(url).lstrip("/")
    if not path:
        return False
    if f"/{path}" in haystack:
        return True
    if path not in haystack:
        return False
    # Single short segments (e.g. /clinic) collide with common words — require domain too.
    if "/" not in path and len(path) < 12:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        host = (parsed.netloc or "").lower()
        if host and host in haystack:
            return True
        return False
    return True


def answer_contains_verified_url(answer: Optional[str], url: str) -> bool:
    """
    True when the answer already includes this source URL.
    A generic domain (e.g. www.heh-bs.de) does NOT count as having a deeper page URL.
    """
    if not (answer or "").strip() or not (url or "").strip():
        return False
    haystack = (answer or "").lower()

    for fragment in _url_variants_for_match(url):
        if fragment in haystack:
            if _has_significant_url_path(url):
                path = _source_url_path(url).lstrip("/")
                if path and path in fragment:
                    return _path_appears_in_answer(haystack, url)
            return True

    if _has_significant_url_path(url):
        return _path_appears_in_answer(haystack, url)

    return False


def answer_claims_link_unavailable(answer: Optional[str]) -> bool:
    text = (answer or "").strip()
    if not text:
        return False
    lower = text.lower()
    if any(
        phrase in lower
        for phrase in (
            "do not include a direct link",
            "does not include a direct link",
            "documents do not include a direct link",
            "cannot provide a direct link",
            "can't provide a direct link",
            "no direct link",
            "keinen direkten link",
        )
    ):
        return True
    if "main website" in lower and "navigate" in lower:
        return True
    return False


def should_inject_verified_links(
    user_query: Optional[str],
    answer: Optional[str],
    sources: Any,
) -> bool:
    if not sources or not isinstance(sources, list):
        return False
    if user_seeks_resource_access(user_query):
        return True
    if answer_claims_link_unavailable(answer):
        return True
    return False


def strip_contradictory_no_link_denials(answer: str) -> str:
    """Remove lines/sentences that deny a link or push users to the generic homepage."""
    if not (answer or "").strip():
        return answer or ""

    lines = answer.split("\n")
    kept = [line for line in lines if not _NO_LINK_DENIAL_LINE_RE.match(line.strip())]
    text = "\n".join(kept)
    for pattern in _NO_LINK_DENIAL_SENTENCE_RE:
        text = pattern.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _is_injectable_source_url(url: str) -> bool:
    u = (url or "").strip()
    return bool(u) and u.startswith(("http://", "https://"))


def _final_path_slug(url: str) -> str:
    parts = [p for p in _source_url_path(url).split("/") if p]
    return _fold_accents(parts[-1]) if parts else ""


def collect_http_urls_from_sources_and_metadatas(
    sources: Any,
    context_metadatas: Any,
) -> List[str]:
    urls: List[str] = []
    seen: set = set()
    for item in sources or []:
        if isinstance(item, dict):
            u = (item.get("url") or "").strip()
            if _is_injectable_source_url(u) and u not in seen:
                seen.add(u)
                urls.append(u)
    meta_list = context_metadatas if isinstance(context_metadatas, list) else list(context_metadatas or [])
    for meta in meta_list:
        if not isinstance(meta, dict):
            continue
        u = (meta.get("url") or "").strip()
        if _is_injectable_source_url(u) and u not in seen:
            seen.add(u)
            urls.append(u)
    return urls


def resolve_preferred_page_url(url: str, candidates: List[str]) -> str:
    """
    Prefer the longest same-host URL with the same page slug (fixes shortened crawl paths).
    """
    if not (url or "").strip():
        return url or ""
    want_slug = _final_path_slug(url)
    if not want_slug:
        return url
    host = urlparse(url if "://" in url else f"https://{url}").netloc.lower()
    matches: List[str] = []
    for cand in set([url] + list(candidates or [])):
        cu = (cand or "").strip()
        if not _is_injectable_source_url(cu):
            continue
        parsed = urlparse(cu)
        if (parsed.netloc or "").lower() != host:
            continue
        cand_slug = _final_path_slug(cu)
        path_folded = _fold_accents(parsed.path or "")
        if cand_slug == want_slug or want_slug in path_folded:
            matches.append(cu)
    if not matches:
        return url
    return max(matches, key=lambda u: len(urlparse(u).path or ""))


def resolve_crawl_url_from_db(
    db: Any,
    url: str,
    *,
    project_id: Any = None,
) -> str:
    """Look up crawled documents and return the most specific stored URL for this page slug."""
    if db is None or not project_id or not (url or "").strip():
        return url
    slug = _final_path_slug(url)
    if not slug:
        return url
    try:
        from ..models import CrawlSource, Document

        rows = (
            db.query(Document.url)
            .join(CrawlSource, Document.source_id == CrawlSource.id)
            .filter(CrawlSource.project_id == project_id)
            .filter(Document.url.ilike(f"%{slug}%"))
            .all()
        )
    except Exception:
        return url
    db_urls = [row[0] for row in rows if row and row[0]]
    host = urlparse(url).netloc.lower()
    db_urls = [u for u in db_urls if urlparse(u).netloc.lower() == host]
    if not db_urls:
        return url
    return resolve_preferred_page_url(url, db_urls)


def normalize_verified_source_url(
    url: str,
    *,
    sources: Any = None,
    context_metadatas: Any = None,
    db: Any = None,
    project_id: Any = None,
) -> str:
    """
    Keep source URLs stable and exact to retrieved metadata.
    Avoid slug-based URL rewrites that can map to a sibling page.
    """
    candidates = collect_http_urls_from_sources_and_metadatas(sources, context_metadatas)
    want = _normalize_url_key(url)
    for cand in candidates:
        if _normalize_url_key(cand) == want:
            return cand
    return url


def _normalize_source_list_urls(
    sources: List[Dict[str, str]],
    *,
    context_metadatas: Any = None,
    db: Any = None,
    project_id: Any = None,
) -> List[Dict[str, str]]:
    """Keep source URLs exactly as retrieved — no slug/DB rewrites (stable across turns)."""
    return [dict(item) for item in sources if isinstance(item, dict)]


def _is_junk_source_title(title: str) -> bool:
    t = (title or "").strip().lower()
    if not t:
        return True
    if t in _JUNK_SOURCE_TITLES:
        return True
    return bool(re.match(r"^source\s+\d+$", t))


def _title_from_url(url: str) -> str:
    slug = _final_path_slug(url)
    if slug:
        return slug.replace("-", " ").replace("_", " ").title()
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = (parsed.netloc or "").replace("www.", "")
    return host.split(".")[0].title() if host else (url or "")


def _resolve_source_display_title(item: Dict[str, str]) -> str:
    from .source_display_titles import clean_doc_title

    raw = (item.get("title") or "").strip()
    cleaned = clean_doc_title(raw, strip_extension=True) if raw else ""
    if cleaned and not _is_junk_source_title(cleaned):
        return cleaned
    url = (item.get("url") or "").strip()
    derived = _title_from_url(url)
    return derived or url or "Source"


def _format_markdown_link(title: str, url: str) -> str:
    label = (title or "").strip()
    if _is_junk_source_title(label):
        label = _title_from_url(url)
    label = label or url
    safe_label = label.replace("[", "(").replace("]", ")")
    return f"[{safe_label}]({url})"


def _normalized_host(url: str) -> str:
    host = urlparse(url if "://" in url else f"https://{url}").netloc.lower()
    if host.startswith("www."):
        return host[4:]
    return host


def _registrable_host(host: str) -> str:
    """Map host to registrable domain (e.g. patientenportal.heh-bs.de -> heh-bs.de)."""
    parts = (host or "").split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host or ""


def _primary_source_host(sources: List[Dict[str, str]]) -> str:
    """Registrable domain shared by most sources (main crawl site)."""
    counts: Dict[str, int] = {}
    for item in sources:
        url = (item.get("url") or "").strip()
        if not url:
            continue
        root = _registrable_host(_normalized_host(url))
        counts[root] = counts.get(root, 0) + 1
    if not counts:
        return ""
    return max(counts.items(), key=lambda x: (x[1], x[0]))[0]


def _subdomain_penalty(host: str, primary_root: str) -> int:
    if not primary_root:
        return 0
    root = _registrable_host(host)
    if root != primary_root:
        return 3
    if host in {primary_root, f"www.{primary_root}"}:
        return 0
    suffix = f".{primary_root}"
    if host.endswith(suffix):
        prefix = host[: -len(suffix)]
        return 1 + (prefix.count(".") if prefix else 0)
    return 2


def _url_rank_for_link(item: Dict[str, str], primary_host: str) -> tuple:
    """
    Lower tuple = better answer link.
    Prefer main crawl host, deep content paths; deprioritize subdomain homepages.
    """
    url = (item.get("url") or "").strip()
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = _normalized_host(url)
    junk = 1 if _is_junk_source_title((item.get("title") or "").strip()) else 0
    host_penalty = _subdomain_penalty(host, primary_host)
    path = (parsed.path or "").rstrip("/")
    segments = [p for p in path.split("/") if p]
    root_only = 1 if not segments else 0
    return (junk, host_penalty, root_only, -len(segments), -len(path))


def _best_source_for_answer_link(sources: List[Dict[str, str]]) -> Optional[Dict[str, str]]:
    injectable = _injectable_sources(sources)
    if not injectable:
        return None
    primary_host = _primary_source_host(injectable)
    return sorted(injectable, key=lambda s: _url_rank_for_link(s, primary_host))[0]


def _format_bottom_link_from_sources(sources: List[Dict[str, str]]) -> str:
    best = _best_source_for_answer_link(sources)
    if not best:
        return ""
    url = (best.get("url") or "").strip()
    title = _resolve_source_display_title(best)
    return f"- **Link:** {_format_markdown_link(title, url)}"


def citations_from_context_metadatas(
    metadatas: Any,
    *,
    max_items: int = _MAX_INJECTED_LINKS,
) -> List[Dict[str, str]]:
    """Build minimal title/url citations from retrieval metadata (injection fallback)."""
    if not metadatas:
        return []
    meta_list = metadatas if isinstance(metadatas, list) else list(metadatas)
    out: List[Dict[str, str]] = []
    seen: set = set()
    for idx, meta in enumerate(meta_list):
        if len(out) >= max_items:
            break
        if not isinstance(meta, dict):
            continue
        url = (meta.get("url") or "").strip()
        if not _is_injectable_source_url(url):
            continue
        key = _normalize_url_key(url)
        if key in seen:
            continue
        seen.add(key)
        item = {"title": (meta.get("title") or "").strip() or f"Source {idx + 1}", "url": url}
        item["title"] = _resolve_source_display_title(item)
        out.append(item)
    return out


def append_missing_verified_source_links(
    answer: Optional[str],
    sources: Any,
    *,
    user_query: Optional[str] = None,
    context_metadatas: Any = None,
    db: Any = None,
    project_id: Any = None,
    max_links: int = _MAX_INJECTED_LINKS,
) -> Optional[str]:
    """Append or rebuild with verified source URLs when the user seeks access."""
    text = (answer or "").strip()
    if not text or not sources or not isinstance(sources, list):
        return answer
    if not should_inject_verified_links(user_query, text, sources):
        return answer

    normalized_sources = _normalize_source_list_urls(
        [s for s in sources if isinstance(s, dict)],
        context_metadatas=context_metadatas,
        db=db,
        project_id=project_id,
    )

    injectable = [
        item
        for item in normalized_sources
        if _is_injectable_source_url((item.get("url") or "").strip())
    ]
    if not injectable:
        return answer

    if _answer_has_preferred_verified_source_url(text, injectable, user_query=user_query):
        cleaned = strip_contradictory_no_link_denials(text)
        return strip_rag_boilerplate_openers(cleaned)

    best, rel_score = _pick_best_source_for_access(injectable, user_query)
    topic_tokens = _query_topic_tokens(user_query)
    # When the query has topical tokens, refuse to inject an unrelated page.
    # When the query is only “give me link”, fall back to structural URL ranking.
    if topic_tokens:
        if not best or rel_score <= 0:
            cleaned = strip_contradictory_no_link_denials(text)
            return strip_rag_boilerplate_openers(cleaned)
    else:
        best = _best_source_for_answer_link(injectable)
        if not best:
            return answer

    url = normalize_verified_source_url(
        (best.get("url") or "").strip(),
        sources=normalized_sources,
        context_metadatas=context_metadatas,
        db=db,
        project_id=project_id,
    )
    if not _is_injectable_source_url(url) or _answer_has_correct_verified_url(text, url):
        cleaned = strip_contradictory_no_link_denials(text)
        return strip_rag_boilerplate_openers(cleaned)

    title = _resolve_source_display_title(best)
    link_line = f"- **Link:** {_format_markdown_link(title, url)}"

    cleaned = strip_contradictory_no_link_denials(text)
    cleaned = strip_rag_boilerplate_openers(cleaned)
    return f"{cleaned.rstrip()}\n\n{link_line}".strip()


def enrich_chat_answer_with_verified_links(
    answer: Optional[str],
    sources: Any,
    *,
    user_query: Optional[str] = None,
    context_metadatas: Any = None,
    db: Any = None,
    project_id: Any = None,
) -> Optional[str]:
    """Final chat answer pass: links in answer body only when the user asked for access."""
    if not answer or not str(answer).strip():
        return answer

    effective_sources = sources
    if not effective_sources or not isinstance(effective_sources, list):
        effective_sources = citations_from_context_metadatas(context_metadatas)
    elif isinstance(effective_sources, list) and len(effective_sources) == 0:
        effective_sources = citations_from_context_metadatas(context_metadatas)

    if not effective_sources:
        return strip_rag_boilerplate_openers(strip_answer_links_from_text(answer))

    if not should_inject_verified_links(user_query, answer, effective_sources):
        cleaned = strip_answer_links_from_text(answer)
        return strip_rag_boilerplate_openers(cleaned)

    enriched = append_missing_verified_source_links(
        answer,
        effective_sources,
        user_query=user_query,
        context_metadatas=context_metadatas,
        db=db,
        project_id=project_id,
    )
    fixed = enforce_answer_urls_from_sources(
        enriched,
        effective_sources,
        user_query=user_query,
    )
    return move_source_links_to_bottom(fixed, sources=effective_sources)


_SOURCE_URL_LINE_RE = re.compile(r"(?i)^\s*(\*+\s*)?source\s*url\s*:")
_LINK_BULLET_RE = re.compile(r"(?i)^\s*[-*]\s*\**\s*link\s*\**:")


def _line_is_link_only_line(line: str) -> bool:
    """True when a line is only a link citation (drop entirely when stripping links)."""
    stripped = (line or "").strip()
    if not stripped:
        return False
    if _SOURCE_URL_LINE_RE.match(stripped):
        return True
    if _LINK_BULLET_RE.match(stripped):
        return True
    if re.match(r"^\s*(?:https?://|www\.)\S+\s*$", stripped, flags=re.IGNORECASE):
        return True
    return bool(re.match(r"^\s*\[.+\]\(https?://[^)]+\)\s*$", stripped))


def strip_answer_links_from_text(answer: str) -> str:
    """Remove URLs and link-only lines when the user did not ask for a link."""
    if not (answer or "").strip():
        return answer or ""

    content_lines: List[str] = []
    for line in answer.split("\n"):
        if _line_is_link_only_line(line):
            continue
        cleaned = re.sub(
            r"\[([^\]]+)\]\((?:https?://|www\.)[^)]+\)",
            r"\1",
            line,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"(?:https?://|www\.)\S+", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).rstrip()
        if cleaned.strip():
            content_lines.append(cleaned)

    text = "\n".join(content_lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _parse_link_from_line(line: str) -> Optional[Tuple[str, str]]:
    """Extract (label, url) from a dedicated link line."""
    stripped = (line or "").strip()
    if not stripped:
        return None
    md = re.search(r"\[([^\]]+)\]\((https?://[^)]+)\)", stripped, flags=re.IGNORECASE)
    if md:
        return md.group(1).strip(), md.group(2).strip()
    bare = re.match(r"^\s*((?:https?://|www\.)\S+)\s*$", stripped, flags=re.IGNORECASE)
    if bare:
        url = bare.group(1).strip()
        if url.lower().startswith("www."):
            url = f"https://{url}"
        return _title_from_url(url), url
    return None


def _consolidate_link_lines_to_one(
    link_lines: List[str],
    *,
    sources: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Keep a single best link line — prefer main-site content pages over portal homepages."""
    if sources:
        formatted = _format_bottom_link_from_sources(sources)
        if formatted:
            return formatted

    injectable = _injectable_sources(sources or [])
    primary_host = _primary_source_host(injectable) if injectable else ""
    candidates: List[Tuple[str, str, tuple]] = []
    seen_url_keys: set = set()
    for line in link_lines:
        parsed = _parse_link_from_line(line)
        if not parsed:
            continue
        label, url = parsed
        key = _normalize_url_key(url)
        if key in seen_url_keys:
            continue
        seen_url_keys.add(key)
        item = {"title": label, "url": url}
        candidates.append((label, url, _url_rank_for_link(item, primary_host)))

    if not candidates:
        return "\n".join(link_lines).strip()

    candidates.sort(key=lambda c: c[2])
    label, url, _ = candidates[0]
    if _is_junk_source_title(label):
        label = _title_from_url(url)
    return f"- **Link:** {_format_markdown_link(label, url)}"


def _line_is_dedicated_link_line(line: str) -> bool:
    """True for lines whose main purpose is a source/link citation (safe to move to bottom)."""
    stripped = (line or "").strip()
    if not stripped:
        return False
    if _SOURCE_URL_LINE_RE.match(stripped):
        return True
    if _LINK_BULLET_RE.match(stripped):
        return True
    if re.match(r"^\s*(?:https?://|www\.)\S+\s*$", stripped, flags=re.IGNORECASE):
        return True
    if re.match(r"^\s*\[.+\]\(https?://", stripped):
        return True
    if re.search(r"\[([^\]]+)\]\(https?://[^)]+\)", stripped):
        remainder = re.sub(r"\[([^\]]+)\]\([^)]+\)", "", stripped)
        remainder = re.sub(r"https?://\S+", "", remainder)
        remainder = re.sub(r"[*_#]", "", remainder).strip(" -:()")
        if len(remainder) <= 80:
            return True
    return False


def move_source_links_to_bottom(
    answer: Optional[str],
    *,
    sources: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    """Move dedicated source/link lines to the end of the answer."""
    text = (answer or "").strip()
    if not text:
        return answer

    content_lines: List[str] = []
    link_lines: List[str] = []
    seen: set = set()

    for line in text.split("\n"):
        if _line_is_dedicated_link_line(line):
            key = re.sub(r"\s+", " ", line.strip().lower())
            if key not in seen:
                seen.add(key)
                link_lines.append(line)
        else:
            content_lines.append(line)

    if not link_lines:
        return answer

    while content_lines and not content_lines[-1].strip():
        content_lines.pop()

    body = "\n".join(content_lines).rstrip()
    links = _consolidate_link_lines_to_one(link_lines, sources=sources)
    if body:
        return f"{body}\n\n{links}".strip()
    return links


def _answer_urls(answer: str) -> List[str]:
    urls: List[str] = []
    seen: set = set()
    for u in _markdown_link_targets(answer):
        if u not in seen:
            seen.add(u)
            urls.append(u)
    for u in re.findall(r"https?://[^\s<>)\]]+", answer or "", flags=re.IGNORECASE):
        if u not in seen:
            seen.add(u)
            urls.append(u)
    return urls


def _injectable_sources(sources: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return [
        s
        for s in sources
        if isinstance(s, dict) and _is_injectable_source_url((s.get("url") or "").strip())
    ]


def _most_specific_source_url(sources: List[Dict[str, str]]) -> str:
    """Prefer deepest page path among sources (avoids generic listing-page links)."""
    injectable = _injectable_sources(sources)
    if not injectable:
        return ""

    def _specificity(url: str) -> tuple:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        return (len(parsed.path or ""), url)

    return max(((s.get("url") or "").strip() for s in injectable), key=_specificity)


def _should_upgrade_to_more_specific(url: str, sources: List[Dict[str, str]]) -> Optional[str]:
    """
    When answer uses a generic parent page URL that is in sources, upgrade to the
    deepest matching child URL from the same host (stable, not query-dependent).
    """
    canonical = _most_specific_source_url(sources)
    if not canonical or not url:
        return None
    parsed_u = urlparse(url if "://" in url else f"https://{url}")
    parsed_c = urlparse(canonical if "://" in canonical else f"https://{canonical}")
    if (parsed_u.netloc or "").lower() != (parsed_c.netloc or "").lower():
        return None
    path_u = (parsed_u.path or "").rstrip("/").lower()
    path_c = (parsed_c.path or "").rstrip("/").lower()
    if not path_c or path_u == path_c:
        return None
    if path_c.startswith(path_u):
        return canonical
    return None


def _replacement_url_for_answer(answer: str, sources: List[Dict[str, str]]) -> str:
    """Canonical URL for fixing bad links — best content page from sources."""
    injectable = _injectable_sources(sources)
    best = _best_source_for_answer_link(injectable)
    if best:
        return (best.get("url") or "").strip()
    return _most_specific_source_url(injectable)


def enforce_answer_urls_from_sources(
    answer: Optional[str],
    sources: Any,
    *,
    user_query: Optional[str] = None,
) -> Optional[str]:
    """
    Universal guard: answer URLs must come from retrieved sources only.
    Wrong/hallucinated links are replaced with one stable canonical source URL.
    """
    text = (answer or "").strip()
    if not text or not isinstance(sources, list):
        return answer
    injectable = [s for s in sources if isinstance(s, dict)]
    source_urls = [
        (s.get("url") or "").strip()
        for s in injectable
        if _is_injectable_source_url((s.get("url") or "").strip())
    ]
    if not source_urls:
        return answer

    source_keys = {_normalize_url_key(u): u for u in source_urls}
    replacement = _replacement_url_for_answer(text, injectable) or source_urls[0]
    primary_host = _primary_source_host(injectable)
    best = _best_source_for_answer_link(injectable)
    if not replacement:
        return answer

    def _safe_replace(url: str) -> str:
        key = _normalize_url_key(url)
        if key in source_keys:
            current = source_keys[key]
            upgraded = _should_upgrade_to_more_specific(current, injectable)
            current = upgraded or current
            if best and _url_rank_for_link(
                {"url": current, "title": ""}, primary_host
            ) > _url_rank_for_link(best, primary_host):
                return (best.get("url") or "").strip()
            return current
        return replacement

    updated = re.sub(
        r"\]\((https?://[^)\s]+)\)",
        lambda m: f"]({_safe_replace(m.group(1))})",
        text,
        flags=re.IGNORECASE,
    )
    updated = re.sub(
        r"https?://[^\s<>)\]]+",
        lambda m: _safe_replace(m.group(0)),
        updated,
        flags=re.IGNORECASE,
    )
    return updated
