"""Load dashboard route labels from frontend navigation + i18n (read UI at runtime)."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_FALLBACK_ROUTES: tuple[dict[str, str], ...] = (
    {"route": "index", "label": "Analytics", "section": "Application"},
    {"route": "crawl-management", "label": "Sources", "section": "Application"},
    {"route": "ai-assistant", "label": "AI Assistant", "section": "Application"},
    {"route": "chatbot-config", "label": "Chatbot Configuration", "section": "Application"},
    {"route": "search-config", "label": "Search Configuration", "section": "Application"},
    {"route": "compare-models", "label": "Compare Models", "section": "Application"},
    {"route": "history", "label": "History", "section": "Application"},
    {"route": "configuration", "label": "Integrations", "section": "Application"},
    {"route": "projects", "label": "All Projects", "section": "Management"},
    {"route": "system-health", "label": "System Health", "section": "Settings"},
)

_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "to",
        "of",
        "in",
        "on",
        "for",
        "and",
        "or",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "what",
        "where",
        "when",
        "how",
        "can",
        "i",
        "me",
        "my",
        "we",
        "our",
        "you",
        "your",
        "this",
        "that",
        "these",
        "those",
        "do",
        "does",
        "did",
        "see",
        "show",
        "tell",
        "please",
        "current",
        "now",
        "about",
        "with",
        "from",
        "into",
        "open",
        "go",
        "get",
        "find",
        "check",
        "view",
        "look",
    }
)

# Minimum token-overlap score to accept a route match.
MIN_ROUTE_MATCH_SCORE = 2

_PLATFORM_INTEGRATIONS_ROUTE = "configuration"

# Embed/widget script surfaces (route slug → i18n metadata keys only).
EMBED_SURFACE_BY_ROUTE: dict[str, dict[str, Any]] = {
    "chatbot-config": {
        "workflow_key": "chatbot_embed_integrations",
        "tab_label_key": "chatbot.tabs.integrations",
        "token_prefixes": ("chatbot.integrations.", "integrations.credentials.", "chatbot.tabs."),
        "product_prefixes": ("chatbot.", "nav.chatbot"),
    },
    "search-config": {
        "workflow_key": "search_embed_integrations",
        "tab_label_key": "search.tabs.integrations",
        "token_prefixes": ("search.integrations.", "integrations.credentials.", "search.tabs."),
        "product_prefixes": ("search.", "nav.search"),
    },
}


@dataclass(frozen=True)
class RouteMatch:
    route: str
    label: str
    score: int
    record: dict[str, Any]


def _repo_root() -> Path:
    # modules/ai_assistant/backend/ui_catalog.py -> repo root
    return Path(__file__).resolve().parents[3]


def _parse_en_labels(en_path: Path) -> dict[str, str]:
    labels: dict[str, str] = {}
    if not en_path.is_file():
        return labels
    text = en_path.read_text(encoding="utf-8")
    for match in re.finditer(r'"([^"]+)":\s*"((?:\\.|[^"\\])*)"', text):
        key, raw = match.group(1), match.group(2)
        value = raw.encode("utf-8").decode("unicode_escape") if "\\" in raw else raw
        labels[key] = value.replace("\\n", " ").strip()
    return labels


@lru_cache(maxsize=1)
def _en_labels() -> dict[str, str]:
    en_path = _repo_root() / "frontend" / "src" / "i18n" / "locales" / "en.ts"
    return _parse_en_labels(en_path)


def _parse_drawer_routes(nav_path: Path) -> list[dict[str, str]]:
    if not nav_path.is_file():
        return []
    text = nav_path.read_text(encoding="utf-8")
    sections = re.split(r"titleKey:\s*'([^']+)'", text)
    # sections[0] is preamble; then pairs titleKey, body
    parsed: list[dict[str, str]] = []
    i = 1
    while i + 1 < len(sections):
        section_key = sections[i]
        body = sections[i + 1]
        i += 2
        for route, label_key in re.findall(
            r"route:\s*'([^']+)',\s*labelKey:\s*'([^']+)'",
            body,
        ):
            parsed.append(
                {
                    "route": route,
                    "label_key": label_key,
                    "section_key": section_key,
                }
            )
    return parsed


def _tokenize(text: str) -> set[str]:
    parts = re.split(r"[^a-z0-9]+", (text or "").lower())
    raw = {p for p in parts if p and p not in _STOPWORDS and len(p) > 1}
    return _expand_stems(raw)


# Closed singular/plural pairs used for catalog overlap (not free-form English phrases).
_STEM_PAIRS: tuple[tuple[str, str], ...] = (
    ("project", "projects"),
    ("source", "sources"),
    ("query", "queries"),
    ("model", "models"),
    ("job", "jobs"),
    ("document", "documents"),
    ("integration", "integrations"),
    ("color", "colors"),
    ("colour", "colours"),
)


def _expand_stems(tokens: set[str]) -> set[str]:
    out = set(tokens)
    for a, b in _STEM_PAIRS:
        if a in out:
            out.add(b)
        if b in out:
            out.add(a)
    return out


def _raw_tokens(text: str) -> set[str]:
    """All alphanumeric tokens including stopwords (for status/howto markers)."""
    parts = re.split(r"[^a-z0-9]+", (text or "").lower())
    return {p for p in parts if p and len(p) > 1}


@lru_cache(maxsize=1)
def load_dashboard_routes() -> tuple[dict[str, Any], ...]:
    root = _repo_root()
    nav_path = root / "frontend" / "src" / "config" / "navigation.ts"
    labels = _en_labels()
    drawer = _parse_drawer_routes(nav_path)

    if not drawer:
        logger.warning("AI Assistant ui_catalog: could not parse navigation.ts; using fallback routes")
        return _FALLBACK_ROUTES

    routes: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in drawer:
        route = item["route"]
        if route in seen:
            continue
        seen.add(route)
        label_key = item["label_key"]
        section_key = item.get("section_key") or ""
        routes.append(
            {
                "route": route,
                "label": labels.get(label_key, label_key),
                "section": labels.get(section_key, section_key),
                "label_key": label_key,
            }
        )
    return tuple(routes) if routes else _FALLBACK_ROUTES


def route_catalog_for_planner() -> list[dict[str, str]]:
    """Compact route list for intent planner prompts."""
    return [
        {"route": r["route"], "label": str(r.get("label") or r["route"]), "section": str(r.get("section") or "")}
        for r in load_dashboard_routes()
    ]


def allowed_route_labels() -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for r in load_dashboard_routes():
        label = str(r.get("label") or "").strip()
        if label and label not in seen:
            seen.add(label)
            out.append(label)
    return out


def resolve_label(label_key: str, default: str) -> str:
    labels = _en_labels()
    return labels.get(label_key, default)


def workflow_route_index() -> dict[str, str]:
    """Map navigation route slug → sidebar label."""
    return {
        str(r["route"]): str(r.get("label") or r["route"])
        for r in load_dashboard_routes()
        if r.get("route")
    }


def route_search_tokens(route_record: dict[str, Any]) -> set[str]:
    """Tokens derived from slug, label, and related i18n keys (no hand-written phrases)."""
    tokens: set[str] = set()
    route = str(route_record.get("route") or "")
    label = str(route_record.get("label") or "")
    label_key = str(route_record.get("label_key") or "")
    tokens |= _tokenize(route.replace("-", " ").replace("_", " "))
    tokens |= _tokenize(label)
    labels = _en_labels()
    for key in (label_key, f"{route}.title", f"{route}.description"):
        if key and key in labels:
            tokens |= _tokenize(labels[key])
    return tokens


def tokens_from_i18n_prefixes(*prefixes: str) -> set[str]:
    """Tokenize en.ts string values for keys starting with any prefix."""
    labels = _en_labels()
    tokens: set[str] = set()
    for key, value in labels.items():
        if not any(key.startswith(p) for p in prefixes if p):
            continue
        tokens |= _tokenize(value)
    return tokens


def embed_surface_for_route(route_slug: str) -> Optional[dict[str, Any]]:
    meta = EMBED_SURFACE_BY_ROUTE.get(route_slug)
    if not meta:
        return None
    prefixes = tuple(meta.get("token_prefixes") or ())
    product_prefixes = tuple(meta.get("product_prefixes") or ())
    return {
        **meta,
        "route": route_slug,
        "embed_tokens": tokens_from_i18n_prefixes(*prefixes) if prefixes else set(),
        "product_tokens": tokens_from_i18n_prefixes(*product_prefixes) if product_prefixes else set(),
    }


def embed_match_tokens(route_slug: str) -> set[str]:
    """Union of route label/slug tokens and i18n embed vocabulary for a product config route."""
    surface = embed_surface_for_route(route_slug)
    if not surface:
        return set()
    tokens: set[str] = set(surface.get("embed_tokens") or [])
    tokens |= surface.get("product_tokens") or set()
    for record in load_dashboard_routes():
        if str(record.get("route")) == route_slug:
            tokens |= route_search_tokens(record)
            break
    tab_key = str(surface.get("tab_label_key") or "")
    if tab_key:
        tokens |= _tokenize(resolve_label(tab_key, tab_key))
    return tokens


def query_has_embed_signal(query: str) -> bool:
    """True when query has an embed/script anchor (credentials alone are not enough)."""
    return _query_embed_intent(query)


_EMBED_INTENT_ANCHORS = frozenset(
    {"integrate", "integration", "integrations", "script", "snippet", "embed", "embedded", "widget"}
)


def _query_embed_intent(query: str) -> bool:
    """True when the ask is about embed/snippet integration (not generic project/crawl ops)."""
    q = _tokenize(query) | _raw_tokens(query)
    # Require an explicit embed/script anchor — "project" alone must not match Project ID.
    return bool(q & _EMBED_INTENT_ANCHORS)


def detect_embed_routes(query: str, *, min_score: int = 3) -> list[str]:
    """
    Return ordered route slugs (chatbot-config, search-config) when the ask is about embed scripts.
    """
    q_tokens = _tokenize(query)
    if not q_tokens or not _query_embed_intent(query):
        return []

    chatbot_product = _tokenize("chatbot") | _tokenize(
        resolve_label("nav.chatbot-configuration", "Chatbot Configuration")
    )
    search_product = _tokenize("search") | _tokenize(
        resolve_label("nav.search-configuration", "Search Configuration")
    )
    wants_chatbot = bool(q_tokens & chatbot_product)
    wants_search = bool(q_tokens & search_product)
    dual_product = wants_chatbot and wants_search

    scored: list[tuple[int, str]] = []
    for route_slug in EMBED_SURFACE_BY_ROUTE:
        if route_slug == "chatbot-config" and wants_search and not wants_chatbot:
            continue
        if route_slug == "search-config" and wants_chatbot and not wants_search:
            continue
        if not dual_product and not wants_chatbot and not wants_search:
            # Generic embed ask: include both product config routes.
            pass
        surface_tokens = embed_match_tokens(route_slug)
        if not surface_tokens:
            continue
        overlap = q_tokens & surface_tokens
        if not overlap:
            continue
        score = len(overlap) * 2
        surface = embed_surface_for_route(route_slug) or {}
        embed_only = tokens_from_i18n_prefixes(*(surface.get("token_prefixes") or ()))
        if q_tokens & embed_only:
            score += 4
        if score >= min_score:
            scored.append((score, route_slug))
    scored.sort(key=lambda x: (-x[0], x[1]))
    routes = [route for _, route in scored]
    if dual_product and len(routes) >= 2:
        return routes[:2]
    return routes


def best_route_match(query: str, *, min_score: int = MIN_ROUTE_MATCH_SCORE) -> Optional[RouteMatch]:
    """Score query against catalog routes by token overlap; highest score wins."""
    q_tokens = _tokenize(query)
    if not q_tokens:
        return None
    embed_routes = detect_embed_routes(query)
    embed_product_query = bool(embed_routes) and query_has_embed_signal(query)
    best: Optional[RouteMatch] = None
    for record in load_dashboard_routes():
        route = str(record.get("route") or "")
        if not route:
            continue
        if embed_product_query and route == _PLATFORM_INTEGRATIONS_ROUTE:
            continue
        r_tokens = route_search_tokens(record)
        if not r_tokens:
            continue
        overlap = q_tokens & r_tokens
        if not overlap:
            continue
        # Prefer multi-token label hits (e.g. system+health) over single shared words.
        score = len(overlap) * 2
        label = str(record.get("label") or route)
        label_tokens = _tokenize(label)
        if label_tokens and label_tokens <= q_tokens:
            score += len(label_tokens) * 3
        # Slug tokens (e.g. projects) outweigh incidental vocabulary on other routes.
        slug_tokens = _tokenize(route.replace("-", " ").replace("_", " "))
        if slug_tokens and (q_tokens & slug_tokens):
            score += len(q_tokens & slug_tokens) * 4
        # Exact phrase of label inside query boosts strongly.
        label_norm = " ".join(label.lower().split())
        q_norm = " ".join((query or "").lower().split())
        if label_norm and label_norm in q_norm:
            score += 10
        if score < min_score:
            continue
        if best is None or score > best.score:
            best = RouteMatch(route=route, label=label, score=score, record=dict(record))
    return best
