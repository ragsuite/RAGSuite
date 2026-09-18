"""Config settings surfaces for AI Assistant (module → Settings tab → section → feature).

Derived from frontend nav TS + i18n labels — no English phrase hardcoding per feature.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from .ui_catalog import (
    _en_labels,
    _raw_tokens,
    _repo_root,
    _tokenize,
    query_has_embed_signal,
    resolve_label,
)

logger = logging.getLogger(__name__)

# Integration sections are covered by embed workflows, not settings how-tos.
_EXCLUDED_SECTION_IDS = frozenset(
    {
        "integrations",
        "web-integration",
        "mobile-integration",
        "integrations-scripts",
        "search-test",
    }
)

# Feature group ids that are UI chrome / dialogs, not settings panels.
_SKIP_FEATURE_GROUPS = frozenset(
    {
        "unavailable",
        "loading",
        "toast",
        "save",
        "preview",
        "app",
        "layout2",
        "confirm",
        "error",
        "empty",
        "always",
        "description",
        "subtitle",
        "helper",
    }
)

# Generic verbs that must not alone select a feature panel (labels like "Turn on …").
_FEATURE_NOISE_TOKENS = frozenset(
    {
        "on",
        "off",
        "turn",
        "enable",
        "disable",
        "enabled",
        "disabled",
        "show",
        "hide",
        "use",
        "set",
        "change",
        "update",
        "manage",
        "configure",
        "add",
        "remove",
        "save",
        "apply",
        "both",
        "always",
        "label",
        "title",
        "count",
        "px",
    }
)

# Stable search synonyms when UI copy is friendlier than user wording (keyed by i18n group id).
_FEATURE_GROUP_ALIASES: dict[str, frozenset[str]] = {
    "avatar": frozenset({"avatar", "face"}),
    "colour": frozenset({"color", "colour", "colors", "colours", "gradient", "brand"}),
    "logo": frozenset({"logo"}),
    "theme": frozenset({"theme", "background", "writing"}),
    "position": frozenset({"position", "side"}),
    "options": frozenset(
        {
            "overlay",
            "backdrop",
            "dark",
            "darken",
            "speech",
            "voice",
            "microphone",
            "speaker",
            "talk",
            "listen",
            "speak",
        }
    ),
    "disclaimer": frozenset({"disclaimer", "footer", "safety", "note"}),
    "settings": frozenset({"size", "width", "height", "radius", "spacing", "corners"}),
}

# Structural product metadata (i18n keys only — labels resolved at runtime).
_PRODUCT_META: dict[str, dict[str, Any]] = {
    "chatbot-config": {
        "route_path": "/(app)/chatbot-config",
        "nav_label_key": "nav.chatbot-configuration",
        "nav_label_default": "Chatbot Configuration",
        "title_key": "chatbot.title",
        "settings_tab_key": "chatbot.tabs.settings",
        "settings_tab_default": "Settings",
        "sidebar_group_key": "chatbot.settings.title",
        "nav_file": "frontend/src/features/chatbot-config/utils/chatbot-config-nav.ts",
        "product_tokens": ("chatbot",),
        "section_feature_prefixes": {
            "widget-customization": ("chatbot.widget.",),
            "widget-config": ("chatbot.config.",),
            "model": ("chatbot.models.", "chatbot.settings.models"),
            "domains": ("chatbot.domains.", "chatbot.settings.domains"),
            "faq": ("chatbot.faq.", "chatbot.settings.faq"),
            "feedback": ("chatbot.settings.feedback", "chatbot.config.feedbackEnabled."),
            "privacy": ("chatbot.config.privacy.", "chatbot.settings.privacy"),
            "privacy-policy": ("chatbot.privacyNotice.", "chatbot.settings.privacyPolicy"),
            "overview": ("chatbot.settings.overview",),
        },
        "preview_label_key": "chatbot.widget.preview.title",
    },
    "search-config": {
        "route_path": "/(app)/search-config",
        "nav_label_key": "nav.search-configuration",
        "nav_label_default": "Search Configuration",
        "title_key": "search.title",
        "settings_tab_key": "search.tabs.settings",
        "settings_tab_default": "Settings",
        "sidebar_group_key": "search.settings.title",
        "nav_file": "frontend/src/features/search-config/utils/search-config-nav.ts",
        "product_tokens": ("search",),
        "section_feature_prefixes": {
            "search-customization": ("search.customisation.",),
            "search-box": ("search.config.",),
            "model": ("search.models.", "search.settings.models"),
            "domains": ("search.domains.", "search.settings.domains"),
            "predefined": ("search.questions.", "search.settings.questions"),
            "privacy": ("search.config.privacy.", "search.settings.privacy"),
            "overview": ("search.settings.overview",),
        },
        "preview_label_key": None,
    },
}


@dataclass(frozen=True)
class ConfigSection:
    route: str
    section_id: str
    title_key: str
    subtitle_key: str
    nav_title_key: Optional[str]
    detail_route: Optional[str]
    feature_prefixes: tuple[str, ...]


@dataclass(frozen=True)
class ConfigFeatureGroup:
    group_id: str
    title_key: str
    title: str
    prefixes: tuple[str, ...]
    tokens: frozenset[str]


def _parse_settings_section_meta(nav_path: Path) -> list[dict[str, str]]:
    """Parse SETTINGS_SECTION_META entries: section id → title/subtitle/navTitle/route i18n keys."""
    if not nav_path.is_file():
        return []
    text = nav_path.read_text(encoding="utf-8")
    # Isolate SETTINGS_SECTION_META object (skip TypeScript type braces).
    start = text.find("SETTINGS_SECTION_META")
    if start < 0:
        return []
    assign = text.find("=", start)
    if assign < 0:
        return []
    brace = text.find("{", assign)
    if brace < 0:
        return []
    depth = 0
    end = brace
    for i, ch in enumerate(text[brace:], start=brace):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    block = text[brace:end]
    sections: list[dict[str, str]] = []
    # Match section keys then nested t('...') calls.
    for m in re.finditer(
        r"(?:'([^']+)'|([a-zA-Z_][\w-]*))\s*:\s*\{([^}]+)\}",
        block,
        re.DOTALL,
    ):
        section_id = m.group(1) or m.group(2)
        body = m.group(3)
        if not section_id or section_id in _EXCLUDED_SECTION_IDS:
            continue
        title_m = re.search(r"title:\s*t\('([^']+)'\)", body)
        subtitle_m = re.search(r"subtitle:\s*t\('([^']+)'\)", body)
        nav_m = re.search(r"navTitle:\s*t\('([^']+)'\)", body)
        route_m = re.search(r"route:\s*'([^']+)'", body)
        if not title_m:
            continue
        sections.append(
            {
                "section_id": section_id,
                "title_key": title_m.group(1),
                "subtitle_key": subtitle_m.group(1) if subtitle_m else "",
                "nav_title_key": nav_m.group(1) if nav_m else "",
                "detail_route": route_m.group(1) if route_m else "",
            }
        )
    return sections


def _parse_settings_nav_section_ids(nav_path: Path) -> list[str]:
    """Prefer SETTINGS_NAV_SECTIONS / SETTINGS_NAV_GROUPS order when present."""
    if not nav_path.is_file():
        return []
    text = nav_path.read_text(encoding="utf-8")
    # Flat array: SETTINGS_NAV_SECTIONS: SettingsSection[] = [ ... ]
    flat = re.search(
        r"SETTINGS_NAV_SECTIONS[^=]*=\s*\[([^\]]+)\]",
        text,
        re.DOTALL,
    )
    if flat:
        ids = re.findall(r"'([^']+)'", flat.group(1))
        return [i for i in ids if i not in _EXCLUDED_SECTION_IDS]
    # Grouped: sections: ['overview', ...]
    grouped = re.search(
        r"SETTINGS_NAV_GROUPS[\s\S]*?sections:\s*\[([^\]]+)\]",
        text,
    )
    if grouped:
        ids = re.findall(r"'([^']+)'", grouped.group(1))
        return [i for i in ids if i not in _EXCLUDED_SECTION_IDS]
    return []


def _sections_from_nav_files() -> list[ConfigSection]:
    root = _repo_root()
    out: list[ConfigSection] = []
    for route, meta in _PRODUCT_META.items():
        nav_path = root / str(meta["nav_file"])
        parsed = {s["section_id"]: s for s in _parse_settings_section_meta(nav_path)}
        order = _parse_settings_nav_section_ids(nav_path) or list(parsed.keys())
        feature_map: dict[str, tuple[str, ...]] = dict(meta.get("section_feature_prefixes") or {})
        for section_id in order:
            raw = parsed.get(section_id)
            if not raw:
                continue
            out.append(
                ConfigSection(
                    route=route,
                    section_id=section_id,
                    title_key=raw["title_key"],
                    subtitle_key=raw.get("subtitle_key") or "",
                    nav_title_key=raw.get("nav_title_key") or None,
                    detail_route=raw.get("detail_route") or None,
                    feature_prefixes=feature_map.get(section_id, ()),
                )
            )
    return out


def _sections_from_snapshot() -> list[ConfigSection]:
    from .ui_surface_snapshot import snapshot_config_sections

    out: list[ConfigSection] = []
    for raw in snapshot_config_sections():
        route = str(raw.get("route") or "")
        section_id = str(raw.get("section_id") or "")
        title_key = str(raw.get("title_key") or "")
        if not route or not section_id or not title_key:
            continue
        prefixes_raw = raw.get("feature_prefixes") or ()
        if isinstance(prefixes_raw, (list, tuple)):
            feature_prefixes = tuple(str(p) for p in prefixes_raw if str(p).strip())
        else:
            feature_prefixes = ()
        nav_title = str(raw.get("nav_title_key") or "").strip() or None
        detail = str(raw.get("detail_route") or "").strip() or None
        out.append(
            ConfigSection(
                route=route,
                section_id=section_id,
                title_key=title_key,
                subtitle_key=str(raw.get("subtitle_key") or ""),
                nav_title_key=nav_title,
                detail_route=detail,
                feature_prefixes=feature_prefixes,
            )
        )
    return out


@lru_cache(maxsize=1)
def load_config_sections() -> tuple[ConfigSection, ...]:
    """Load Settings sections from frontend nav TS, else shipped module snapshot."""
    out = _sections_from_nav_files()
    if out:
        return tuple(out)
    snap = _sections_from_snapshot()
    if snap:
        logger.warning(
            "AI Assistant ui_config_surfaces: frontend nav unavailable; "
            "using shipped ui_surface_snapshot config sections (%s)",
            len(snap),
        )
        return tuple(snap)
    logger.error(
        "AI Assistant ui_config_surfaces: no config sections from nav or snapshot — "
        "catalog inventory will omit Settings modules"
    )
    return tuple()


def _feature_group_id_from_key(key: str, prefix: str) -> Optional[str]:
    """e.g. chatbot.widget.colour.title → colour; search.customisation.showSpeech.label → showSpeech."""
    if not key.startswith(prefix):
        return None
    rest = key[len(prefix) :]
    if not rest:
        return None
    parts = rest.split(".")
    if not parts:
        return None
    return parts[0]


def _camel_to_tokens(value: str) -> set[str]:
    """Tokenize camelCase / kebab group ids into catalog tokens."""
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value or "")
    spaced = spaced.replace("-", " ").replace("_", " ")
    return _tokenize(spaced)


def _is_panel_title_key(title_key: str) -> bool:
    """Real UI panel headers end with .title or .label (not placeholders/helpers)."""
    key = (title_key or "").lower()
    if not key:
        return False
    if any(part in key for part in (".confirm", ".toast", ".error", ".helper", "placeholder")):
        return False
    return key.endswith(".title") or key.endswith(".label")


def score_feature_group(
    group: ConfigFeatureGroup,
    *,
    signal: set[str],
    product: set[str],
) -> int:
    """Quality-aware score for a feature panel against query signal tokens."""
    if group.group_id in _SKIP_FEATURE_GROUPS:
        return 0
    if not _is_panel_title_key(group.title_key):
        return 0
    id_tokens = _camel_to_tokens(group.group_id) | set(_FEATURE_GROUP_ALIASES.get(group.group_id, ()))
    group_tokens = ((set(group.tokens) | id_tokens) - product) - _FEATURE_NOISE_TOKENS
    title_tokens = (_tokenize(group.title) - product) - _FEATURE_NOISE_TOKENS
    overlap = signal & group_tokens
    # Allow group_id / alias stem hits (e.g. query "avatar" vs panel title "Chat face").
    if not overlap and not (id_tokens & signal):
        return 0
    score = len(overlap) * 2 + len(signal & title_tokens) * 4
    # Exact panel-name ask (e.g. signal={avatar}, title={avatar}).
    if title_tokens and title_tokens <= signal:
        score += 20
    # group_id / alias stem overlap (avatar, colour, showSpeech → speech).
    if id_tokens & signal:
        score += 12
    return score


@lru_cache(maxsize=32)
def feature_groups_for_prefixes(prefixes: tuple[str, ...]) -> tuple[ConfigFeatureGroup, ...]:
    """Group i18n keys under prefixes into feature panels (by first segment after prefix)."""
    if not prefixes:
        return ()
    labels = _en_labels()
    buckets: dict[str, dict[str, Any]] = {}
    for key, value in labels.items():
        for prefix in prefixes:
            gid = _feature_group_id_from_key(key, prefix)
            if not gid:
                continue
            # Skip meta/unavailable/toast noise for grouping identity.
            if gid in _SKIP_FEATURE_GROUPS:
                continue
            bucket = buckets.setdefault(
                gid,
                {"title_key": None, "title": None, "prefixes": set(), "tokens": set()},
            )
            bucket["prefixes"].add(prefix + gid + ".")
            bucket["tokens"] |= _tokenize(value)
            bucket["tokens"] |= _camel_to_tokens(gid)
            bucket["tokens"] |= set(_FEATURE_GROUP_ALIASES.get(gid, ()))
            # Prefer *.title or *.label as the panel title only.
            if key.endswith(".title") or key.endswith(".label"):
                if bucket["title_key"] is None or key.endswith(".title"):
                    bucket["title_key"] = key
                    bucket["title"] = value
    groups: list[ConfigFeatureGroup] = []
    for gid, data in buckets.items():
        title_key = str(data["title_key"] or "")
        if not _is_panel_title_key(title_key):
            # Require a real panel header; drop placeholder-only leaves.
            continue
        title = str(data["title"] or "")
        if not title:
            continue
        groups.append(
            ConfigFeatureGroup(
                group_id=gid,
                title_key=title_key,
                title=title,
                prefixes=tuple(sorted(data["prefixes"])),
                tokens=frozenset(data["tokens"]),
            )
        )
    return tuple(groups)


def match_config_feature(
    route: str,
    query: str,
    *,
    section_id: Optional[str] = None,
) -> Optional[ConfigFeatureGroup]:
    """Best feature panel for a product config route / optional section (i18n token overlap)."""
    q_tokens = _tokenize(query)
    if not q_tokens:
        return None
    # Product tokens (e.g. "chatbot" in "Chatbot Color") must not dominate feature ranking.
    product = product_tokens_for_route(route)
    signal = (q_tokens - product) - _FEATURE_NOISE_TOKENS
    if not signal:
        return None
    sections = [s for s in load_config_sections() if s.route == route]
    if section_id:
        sections = [s for s in sections if s.section_id == section_id]
    best: Optional[ConfigFeatureGroup] = None
    best_score = 0
    for section in sections:
        if not section.feature_prefixes:
            continue
        for group in feature_groups_for_prefixes(tuple(section.feature_prefixes)):
            score = score_feature_group(group, signal=signal, product=product)
            if score > best_score:
                best_score = score
                best = group
    return best if best_score >= 2 else None


def feature_match_score(
    route: str,
    query: str,
    *,
    section_id: Optional[str] = None,
) -> int:
    """Numeric quality score for the best feature panel in a section (0 if none)."""
    q_tokens = _tokenize(query)
    if not q_tokens:
        return 0
    product = product_tokens_for_route(route)
    signal = (q_tokens - product) - _FEATURE_NOISE_TOKENS
    if not signal:
        return 0
    group = match_config_feature(route, query, section_id=section_id)
    if not group:
        return 0
    return score_feature_group(group, signal=signal, product=product)


def panel_title_matches_query(feature_title: str, query: str, *, route: str) -> bool:
    """True when the feature panel title tokens are covered by the query signal."""
    product = product_tokens_for_route(route)
    signal = (_tokenize(query) - product) - _FEATURE_NOISE_TOKENS
    title_tokens = (_tokenize(feature_title) - product) - _FEATURE_NOISE_TOKENS
    return bool(title_tokens) and title_tokens <= signal


def section_display_title(section: ConfigSection) -> str:
    if section.nav_title_key:
        return resolve_label(section.nav_title_key, section.section_id)
    return resolve_label(section.title_key, section.section_id)


def workflow_key_for_section(route: str, section_id: str) -> str:
    product = "chatbot" if route == "chatbot-config" else "search" if route == "search-config" else route
    slug = section_id.replace("-", "_")
    return f"{product}_settings_{slug}"


def product_tokens_for_route(route: str) -> set[str]:
    meta = _PRODUCT_META.get(route) or {}
    tokens: set[str] = set(meta.get("product_tokens") or ())
    label = resolve_label(
        str(meta.get("nav_label_key") or ""),
        str(meta.get("nav_label_default") or ""),
    )
    tokens |= _tokenize(label)
    tokens |= _tokenize(route.replace("-", " "))
    return tokens


def build_config_setting_workflow_dicts() -> tuple[dict[str, Any], ...]:
    """
    Build workflow descriptors for settings sections.

    Returns dicts (not UIWorkflow) to avoid circular imports with ui_workflows.
    """
    out: list[dict[str, Any]] = []
    for section in load_config_sections():
        meta = _PRODUCT_META.get(section.route) or {}
        route_label = resolve_label(
            str(meta.get("nav_label_key") or ""),
            str(meta.get("nav_label_default") or section.route),
        )
        module_title = resolve_label(str(meta.get("title_key") or ""), route_label)
        settings_tab = resolve_label(
            str(meta.get("settings_tab_key") or ""),
            str(meta.get("settings_tab_default") or "Settings"),
        )
        section_title = section_display_title(section)
        # Also tokenize full section title (not only navTitle) for matching.
        title_full = resolve_label(section.title_key, section_title)

        match_prefixes: list[str] = list(section.feature_prefixes)
        # Section nav labels.
        if section.title_key:
            match_prefixes.append(section.title_key)
        if section.nav_title_key:
            match_prefixes.append(section.nav_title_key)
        if section.subtitle_key:
            match_prefixes.append(section.subtitle_key)

        hub_path = str(meta.get("route_path") or f"/(app)/{section.route}")
        detail_path = section.detail_route or hub_path
        steps = [
            {
                "title": f"Open {module_title}",
                "detail": f"In the sidebar, open {module_title}.",
                "path": hub_path,
                "link_label": module_title,
            },
            {
                "title": f"{settings_tab} tab",
                "detail": f"Open the {settings_tab} tab.",
            },
            {
                "title": section_title,
                "detail": f"In the settings sidebar, select {section_title}.",
                "path": detail_path,
                "link_label": section_title,
            },
        ]
        preview_key = meta.get("preview_label_key")
        status_notes: list[str] = []
        if preview_key and section.section_id in ("widget-customization", "search-customization"):
            preview = resolve_label(str(preview_key), "Live Preview")
            status_notes.append(f"Use the {preview} pane to verify changes.")

        match_tokens = (
            _tokenize(section_title)
            | _tokenize(title_full)
            | _tokenize(settings_tab)
            | _tokenize(section.section_id.replace("-", " "))
            | {"settings"}
        )
        out.append(
            {
                "key": workflow_key_for_section(section.route, section.section_id),
                "intent": "ui_navigation",
                "scope": "navigation_only",
                "route": section.route,
                "route_label": route_label,
                "route_path": section.detail_route or str(meta.get("route_path") or f"/(app)/{section.route}"),
                "steps": steps,
                "status_notes": status_notes,
                "match_tokens": tuple(sorted(match_tokens)),
                "match_token_prefixes": tuple(dict.fromkeys(match_prefixes)),
                "section_id": section.section_id,
                "section_title": section_title,
                "feature_prefixes": section.feature_prefixes,
                "settings_tab_label": settings_tab,
                "preview_label_key": preview_key
                if section.section_id
                in ("widget-customization", "search-customization")
                else None,
            }
        )
    return tuple(out)


@lru_cache(maxsize=1)
def build_config_setting_workflows_cached() -> tuple[dict[str, Any], ...]:
    return build_config_setting_workflow_dicts()


def is_config_settings_workflow_key(key: str) -> bool:
    return bool(key) and ("_settings_" in key) and (
        key.startswith("chatbot_settings_") or key.startswith("search_settings_")
    )


_CATALOG_LIST_MARKERS = frozenset(
    {
        "which",
        "what",
        "whats",
        "types",
        "type",
        "options",
        "available",
        "list",
        "all",
        "kinds",
        "kind",
        "modules",
        "module",
        "areas",
        "area",
        "tabs",
        "tab",
        "included",
        "include",
    }
)
_CATALOG_SETTINGS_SIGNAL = frozenset(
    {
        "settings",
        "setting",
        "configure",
        "configuration",
        "customisation",
        "customization",
        "options",
        "modules",
        "module",
    }
)


def catalog_workflow_key_for_route(route: str) -> str:
    if route == "chatbot-config":
        return "chatbot_config_catalog"
    if route == "search-config":
        return "search_config_catalog"
    return f"{route.replace('-', '_')}_catalog"


def is_config_catalog_workflow_key(key: str) -> bool:
    return key in ("chatbot_config_catalog", "search_config_catalog")


def _section_has_strong_query_hit(route: str, query: str) -> bool:
    """True when the ask targets one settings section or feature panel specifically."""
    product = product_tokens_for_route(route)
    q_tokens = _tokenize(query) | _raw_tokens(query)
    # Require the product name so chatbot asks do not false-hit search panels (and vice versa).
    if not (q_tokens & product):
        return False
    # Bare settings/configure and inventory markers ("which type…") are not section hits.
    signal = (
        (q_tokens - product)
        - _FEATURE_NOISE_TOKENS
        - _CATALOG_SETTINGS_SIGNAL
        - _CATALOG_LIST_MARKERS
    )
    if not signal:
        return False

    feature = match_config_feature(route, query)
    if feature:
        feat_tokens = (
            (set(feature.tokens) | _tokenize(feature.title) | _camel_to_tokens(feature.group_id))
            - product
            - _FEATURE_NOISE_TOKENS
            - _CATALOG_SETTINGS_SIGNAL
            - _CATALOG_LIST_MARKERS
        )
        if feat_tokens & signal:
            return True
        title_tokens = (
            (_tokenize(feature.title) - product)
            - _CATALOG_SETTINGS_SIGNAL
            - _CATALOG_LIST_MARKERS
        )
        if title_tokens and title_tokens <= signal:
            return True
        # group_id-only asks (avatar → Chat face panel).
        if _camel_to_tokens(feature.group_id) & signal:
            return True

    for section in load_config_sections():
        if section.route != route:
            continue
        title = section_display_title(section)
        title_full = resolve_label(section.title_key, title)
        title_tokens = (
            _tokenize(title)
            | _tokenize(title_full)
            | _tokenize(section.section_id.replace("-", " "))
        ) - product
        title_tokens -= _CATALOG_SETTINGS_SIGNAL
        title_tokens -= _CATALOG_LIST_MARKERS
        distinctive = title_tokens - {"overview"}
        if distinctive and distinctive <= signal:
            return True
    return False


def query_has_config_feature_hit(query: str) -> bool:
    """True when the ask targets a concrete Settings section/panel (not bare inventory)."""
    for route in config_routes():
        if _section_has_strong_query_hit(route, query):
            return True
    return False


def detect_config_catalog_query(query: str) -> Optional[str]:
    """
    Return chatbot-config / search-config when the ask wants a full settings inventory.

    Returns None for embed/script asks or section/feature-specific how-tos.
    """
    if query_has_embed_signal(query):
        return None
    if query_has_config_feature_hit(query):
        return None
    q = _tokenize(query) | _raw_tokens(query)
    if not (q & _CATALOG_LIST_MARKERS):
        return None
    if not (q & _CATALOG_SETTINGS_SIGNAL):
        return None

    hits: list[str] = []
    for route in ("chatbot-config", "search-config"):
        product = product_tokens_for_route(route)
        if not (q & product):
            continue
        if _section_has_strong_query_hit(route, query):
            continue
        hits.append(route)
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        # Prefer the product named first / more specifically; default chatbot if both.
        if "chatbot" in q and "search" not in q:
            return "chatbot-config"
        if "search" in q and "chatbot" not in q:
            return "search-config"
        return hits[0]
    return None


def _catalog_feature_titles_for_section(section: ConfigSection) -> list[str]:
    """Real Settings sub-panel titles from i18n (quality-filtered, deduped)."""
    if not section.feature_prefixes:
        return []
    seen: set[str] = set()
    titles: list[str] = []
    for group in feature_groups_for_prefixes(tuple(section.feature_prefixes)):
        if group.group_id in _SKIP_FEATURE_GROUPS:
            continue
        if not _is_panel_title_key(group.title_key):
            continue
        title = (group.title or "").strip()
        if not title:
            continue
        key = title.lower()
        if key in seen:
            continue
        # Skip titles that merely repeat the section heading.
        section_title = section_display_title(section).lower()
        if key == section_title:
            continue
        seen.add(key)
        titles.append(title)
    return titles


def _parse_training_sub_tabs(nav_path: Path) -> list[dict[str, str]]:
    """Parse TRAINING_SUB_TABS entries from product nav TS."""
    if not nav_path.is_file():
        return []
    text = nav_path.read_text(encoding="utf-8")
    block = re.search(
        r"TRAINING_SUB_TABS[^=]*=\s*\[(.*?)\]\s*;",
        text,
        re.DOTALL,
    )
    if not block:
        return []
    body = block.group(1)
    tabs: list[dict[str, str]] = []
    for m in re.finditer(
        r"key:\s*'([^']+)'[\s\S]*?label:\s*t\('([^']+)'\)(?:[\s\S]*?route:\s*'([^']+)')?",
        body,
    ):
        tabs.append(
            {
                "key": m.group(1),
                "title_key": m.group(2),
                "route": m.group(3) or "",
            }
        )
    return tabs


def _setup_subtitle_key(route: str, tab_key: str) -> str:
    prefix = "chatbot" if route == "chatbot-config" else "search"
    if tab_key == "overview":
        return f"{prefix}.training.preview.description"
    if tab_key == "active-config":
        return f"{prefix}.training.activeConfig.subtitle"
    return ""


def _setup_tab_dicts_for_route(route: str) -> list[dict[str, str]]:
    """Live nav TRAINING_SUB_TABS first; shipped snapshot when frontend is absent."""
    meta = _PRODUCT_META.get(route) or {}
    nav_file = str(meta.get("nav_file") or "")
    if nav_file:
        live = _parse_training_sub_tabs(_repo_root() / nav_file)
        if live:
            return [
                {
                    "key": tab["key"],
                    "title_key": tab["title_key"],
                    "subtitle_key": _setup_subtitle_key(route, tab["key"]),
                    "route": tab.get("route") or "",
                }
                for tab in live
            ]
    from .ui_surface_snapshot import snapshot_setup_modules

    return [
        {
            "key": str(tab.get("key") or ""),
            "title_key": str(tab.get("title_key") or ""),
            "subtitle_key": str(tab.get("subtitle_key") or ""),
            "route": str(tab.get("route") or ""),
        }
        for tab in snapshot_setup_modules(route)
    ]


def _setup_modules_for_route(route: str) -> list[dict[str, Any]]:
    """Setup / training tabs from nav (or snapshot); else i18n key defaults."""
    prefix = "chatbot" if route == "chatbot-config" else "search"
    setup_tab = resolve_label(f"{prefix}.tabs.training", "Setup")
    modules: list[dict[str, Any]] = []
    for tab in _setup_tab_dicts_for_route(route):
        title_key = tab.get("title_key") or ""
        if not title_key:
            continue
        subtitle_key = tab.get("subtitle_key") or ""
        modules.append(
            {
                "group": setup_tab,
                "title": resolve_label(title_key, tab.get("key") or "Setup"),
                "subtitle": resolve_label(subtitle_key, "") if subtitle_key else "",
                "features": [],
            }
        )
    if modules:
        return modules

    modules.append(
        {
            "group": setup_tab,
            "title": resolve_label(f"{prefix}.training.overview", "Overview"),
            "subtitle": resolve_label(
                f"{prefix}.training.preview.description",
                resolve_label(f"{prefix}.training.subtitle", ""),
            ),
            "features": [],
        }
    )
    modules.append(
        {
            "group": setup_tab,
            "title": resolve_label(f"{prefix}.training.activeConfig", "Active Config"),
            "subtitle": resolve_label(
                f"{prefix}.training.activeConfig.subtitle",
                resolve_label(f"{prefix}.training.activeStatus.description", ""),
            ),
            "features": [],
        }
    )
    return modules


def _catalog_modules_for_route(route: str) -> list[dict[str, Any]]:
    """Ordered catalog modules: Setup items, Settings sections, Integrations — i18n only."""
    meta = _PRODUCT_META.get(route) or {}
    modules: list[dict[str, Any]] = []
    prefix = "chatbot" if route == "chatbot-config" else "search"

    modules.extend(_setup_modules_for_route(route))

    settings_tab = resolve_label(
        str(meta.get("settings_tab_key") or f"{prefix}.tabs.settings"),
        str(meta.get("settings_tab_default") or "Settings"),
    )
    settings_count = 0
    for section in load_config_sections():
        if section.route != route:
            continue
        title = section_display_title(section)
        subtitle = ""
        if section.subtitle_key:
            subtitle = resolve_label(section.subtitle_key, "")
        modules.append(
            {
                "group": settings_tab,
                "title": title,
                "subtitle": subtitle,
                "path": section.detail_route or str(meta.get("route_path") or f"/(app)/{route}"),
                "features": _catalog_feature_titles_for_section(section),
            }
        )
        settings_count += 1
    if settings_count == 0:
        logger.error(
            "AI Assistant catalog: route %s has no Settings sections — inventory incomplete",
            route,
        )

    integrations_tab = resolve_label(f"{prefix}.tabs.integrations", "Integrations")
    modules.append(
        {
            "group": integrations_tab,
            "title": integrations_tab,
            "subtitle": resolve_label(
                f"{prefix}.integrations.scripts.subtitle",
                resolve_label(f"{prefix}.integrations.web.description", ""),
            ),
            "features": [],
        }
    )

    # Search Configuration also has a Search Test primary tab (not in Settings nav).
    if route == "search-config":
        test_tab = resolve_label("search.tabs.searchTest", "Search Test")
        modules.append(
            {
                "group": test_tab,
                "title": test_tab,
                "subtitle": resolve_label("search.description", ""),
                "features": [],
            }
        )
    return modules


def build_config_catalog_workflow_dicts() -> tuple[dict[str, Any], ...]:
    """Catalog workflows listing every real config module (not per-section click-paths)."""
    out: list[dict[str, Any]] = []
    for route, meta in _PRODUCT_META.items():
        route_label = resolve_label(
            str(meta.get("nav_label_key") or ""),
            str(meta.get("nav_label_default") or route),
        )
        module_title = resolve_label(str(meta.get("title_key") or ""), route_label)
        settings_tab = resolve_label(
            str(meta.get("settings_tab_key") or ""),
            str(meta.get("settings_tab_default") or "Settings"),
        )
        modules = _catalog_modules_for_route(route)
        # One intro step so grounding stays non-empty for navigation_only scope.
        steps = [
            {
                "title": module_title,
                "detail": f"Open {module_title} from the sidebar to configure Setup, {settings_tab}, and Integrations.",
                "path": str(meta.get("route_path") or f"/(app)/{route}"),
                "link_label": module_title,
            }
        ]
        match_tokens = (
            _tokenize(route_label)
            | _tokenize(module_title)
            | _tokenize(settings_tab)
            | product_tokens_for_route(route)
            | _CATALOG_SETTINGS_SIGNAL
            | _CATALOG_LIST_MARKERS
        )
        out.append(
            {
                "key": catalog_workflow_key_for_route(route),
                "intent": "ui_navigation",
                "scope": "navigation_only",
                "route": route,
                "route_label": route_label,
                "route_path": str(meta.get("route_path") or f"/(app)/{route}"),
                "steps": steps,
                "status_notes": (),
                "match_tokens": tuple(sorted(match_tokens)),
                "match_token_prefixes": (),
                "section_id": None,
                "feature_prefixes": (),
                "preview_label_key": None,
                "catalog_modules": modules,
                "is_config_catalog": True,
            }
        )
    return tuple(out)


@lru_cache(maxsize=1)
def build_config_catalog_workflows_cached() -> tuple[dict[str, Any], ...]:
    return build_config_catalog_workflow_dicts()


def config_routes() -> frozenset[str]:
    return frozenset(_PRODUCT_META.keys())


def enrich_steps_with_feature(
    base_steps: list[dict[str, str]],
    feature: Optional[ConfigFeatureGroup],
    *,
    preview_label: Optional[str] = None,
    path: Optional[str] = None,
) -> list[dict[str, str]]:
    """Append a feature-panel step when a specific i18n group matched the query."""
    steps = list(base_steps)
    if feature:
        feature_step: dict[str, str] = {
            "title": feature.title,
            "detail": f"Find the {feature.title} section and adjust the controls there.",
            "link_label": feature.title,
        }
        if path:
            feature_step["path"] = path
        steps.append(feature_step)
    if preview_label:
        # Avoid duplicate if already in status notes path.
        if not any(preview_label.lower() in (s.get("detail") or "").lower() for s in steps):
            steps.append(
                {
                    "title": preview_label,
                    "detail": f"Confirm the result in the {preview_label} pane.",
                }
            )
    return steps


__all__ = [
    "ConfigFeatureGroup",
    "ConfigSection",
    "build_config_catalog_workflows_cached",
    "build_config_setting_workflows_cached",
    "catalog_workflow_key_for_route",
    "config_routes",
    "detect_config_catalog_query",
    "enrich_steps_with_feature",
    "feature_groups_for_prefixes",
    "feature_match_score",
    "is_config_catalog_workflow_key",
    "is_config_settings_workflow_key",
    "load_config_sections",
    "match_config_feature",
    "panel_title_matches_query",
    "product_tokens_for_route",
    "query_has_config_feature_hit",
    "score_feature_group",
    "section_display_title",
    "workflow_key_for_section",
]
