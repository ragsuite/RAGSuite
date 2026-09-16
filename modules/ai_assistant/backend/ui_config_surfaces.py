"""Config settings surfaces for AI Assistant (module → Settings tab → section → feature).

Derived from frontend nav TS + i18n labels — no English phrase hardcoding per feature.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from .ui_catalog import (
    _en_labels,
    _repo_root,
    _tokenize,
    resolve_label,
)

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


@lru_cache(maxsize=1)
def load_config_sections() -> tuple[ConfigSection, ...]:
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
    return tuple(out)


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
    group_tokens = (set(group.tokens) - product) - _FEATURE_NOISE_TOKENS
    title_tokens = (_tokenize(group.title) - product) - _FEATURE_NOISE_TOKENS
    overlap = signal & group_tokens
    if not overlap:
        return 0
    score = len(overlap) * 2 + len(signal & title_tokens) * 4
    # Exact panel-name ask (e.g. signal={avatar}, title={avatar}).
    if title_tokens and title_tokens <= signal:
        score += 20
    # group_id stem overlap (avatar, colour, showSpeech → speech).
    if _camel_to_tokens(group.group_id) & signal:
        score += 8
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

        steps = [
            {
                "title": f"Open {module_title}",
                "detail": f"In the sidebar, open {module_title}.",
            },
            {
                "title": f"{settings_tab} tab",
                "detail": f"Open the {settings_tab} tab.",
            },
            {
                "title": section_title,
                "detail": f"In the settings sidebar, select {section_title}.",
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


def config_routes() -> frozenset[str]:
    return frozenset(_PRODUCT_META.keys())


def enrich_steps_with_feature(
    base_steps: list[dict[str, str]],
    feature: Optional[ConfigFeatureGroup],
    *,
    preview_label: Optional[str] = None,
) -> list[dict[str, str]]:
    """Append a feature-panel step when a specific i18n group matched the query."""
    steps = list(base_steps)
    if feature:
        steps.append(
            {
                "title": feature.title,
                "detail": f"Find the {feature.title} section and adjust the controls there.",
            }
        )
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
    "build_config_setting_workflows_cached",
    "config_routes",
    "enrich_steps_with_feature",
    "feature_groups_for_prefixes",
    "feature_match_score",
    "is_config_settings_workflow_key",
    "load_config_sections",
    "match_config_feature",
    "panel_title_matches_query",
    "product_tokens_for_route",
    "score_feature_group",
    "section_display_title",
    "workflow_key_for_section",
]
