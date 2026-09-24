"""App-level UI surfaces for AI Assistant: Sources connectors, Profile, Settings, drawer gaps.

Labels and tabs come from frontend i18n / navigation — no free-form English alias lists.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional

from .ui_catalog import (
    _raw_tokens,
    _tokenize,
    load_dashboard_routes,
    resolve_label,
)

SOURCES_CONNECTORS_CATALOG_KEY = "sources_connectors_catalog"
CONFIGURATION_MCP_KEY = "configuration_mcp"
_SOURCES_ROUTE = "crawl-management"
_CONFIGURATION_ROUTE = "configuration"

# Crawl primary tabs from CrawlManagementScreen (i18n keys only).
_CONNECTOR_TAB_KEYS: tuple[tuple[str, str], ...] = (
    ("domain", "crawl.tabs.domain"),
    ("document", "crawl.tabs.document"),
    ("gmail", "crawl.tabs.gmail"),
    ("google-drive", "crawl.tabs.googleDrive"),
    ("notion", "crawl.tabs.notion"),
    ("confluence", "crawl.tabs.confluence"),
    ("slack", "crawl.tabs.slack"),
    ("sharepoint", "crawl.tabs.sharepoint"),
    ("teams", "crawl.tabs.teams"),
)

_CONNECTOR_INVENTORY_MARKERS = frozenset(
    {"which", "what", "whats", "list", "available", "show", "give", "are", "there"}
)
# Inbound Sources connectors only — not the outbound RAGSuite MCP Connector.
_CONNECTOR_SIGNAL = frozenset({"connector", "connectors"})
_MCP_SIGNAL = frozenset({"mcp"})
_MCP_HOST_SIGNAL = frozenset({"cursor", "claude", "integrate", "integration", "desktop"})

# App Settings rows (SettingsScreen / settings routes) — i18n keys + paths.
_APP_SETTINGS_SURFACES: tuple[dict[str, str], ...] = (
    {
        "key": "app_settings_home",
        "route": "settings",
        "label_key": "settings.title",
        "label_default": "Settings",
        "path": "/(app)/settings",
        "detail": "Open the Settings area from the app menu to manage workspace and legal preferences.",
    },
    {
        "key": "app_settings_global_setup",
        "route": "global-setup",
        "label_key": "settings.profile",
        "label_default": "Global Settings",
        "path": "/(app)/settings/global-setup",
        "parent_label_key": "settings.title",
        "detail_key": "settings.branding.previewDescription",
    },
    {
        "key": "app_settings_data_retention",
        "route": "data-retentions",
        "label_key": "settings.data-retention",
        "label_default": "Data Retention",
        "path": "/(app)/settings/data-retentions",
        "parent_label_key": "settings.title",
        "detail_key": "settings.retention.period.hint",
    },
    {
        "key": "app_settings_session_timeout",
        "route": "session-timeout",
        "label_key": "settings.sessionTimeout",
        "label_default": "Session Timeout",
        "path": "/(app)/settings/session-timeout",
        "parent_label_key": "settings.title",
        "detail_key": "settings.sessionTimeout.description",
    },
    {
        "key": "app_settings_language",
        "route": "language-region",
        "label_key": "settings.i18n",
        "label_default": "Internationalization",
        "path": "/(app)/settings/language-region",
        "parent_label_key": "settings.title",
        "detail_key": "settings.i18n.description",
    },
    {
        "key": "app_settings_help",
        "route": "help",
        "label_key": "help.title",
        "label_default": "Help & Documentation",
        "path": "/(app)/settings",
        "parent_label_key": "settings.title",
        "detail_key": "help.description",
    },
    {
        "key": "app_settings_about",
        "route": "about-us",
        "label_key": "app.about.title",
        "label_default": "About",
        "path": "/(app)/settings/about-us",
        "parent_label_key": "settings.title",
    },
    {
        "key": "app_settings_licenses",
        "route": "licenses",
        "label_key": "app.licenses.title",
        "label_default": "Licenses",
        "path": "/(app)/settings/licenses",
        "parent_label_key": "settings.title",
    },
    {
        "key": "app_settings_terms",
        "route": "terms-of-service",
        "label_key": "app.terms.title",
        "label_default": "Terms of Service",
        "path": "/(app)/settings/terms-of-service",
        "parent_label_key": "settings.title",
    },
)

_PROFILE_TABS: tuple[dict[str, str], ...] = (
    {
        "key": "profile_general",
        "tab_key": "profile.tabs.general",
        "tab_default": "General",
        "detail_key": "profile.sections.personal.description",
    },
    {
        "key": "profile_security",
        "tab_key": "profile.tabs.security",
        "tab_default": "Security",
        "detail_key": "profile.sections.security.options.description",
    },
)


def is_sources_connectors_catalog_key(key: str) -> bool:
    return key == SOURCES_CONNECTORS_CATALOG_KEY


def is_configuration_mcp_key(key: str) -> bool:
    return key == CONFIGURATION_MCP_KEY


def is_inventory_catalog_workflow_key(key: str) -> bool:
    """Config product catalogs + Sources connectors inventory + MCP setup."""
    from .ui_config_surfaces import is_config_catalog_workflow_key

    return (
        is_config_catalog_workflow_key(key)
        or is_sources_connectors_catalog_key(key)
        or is_configuration_mcp_key(key)
    )


def connector_tab_labels() -> list[str]:
    labels: list[str] = []
    for _tab_id, label_key in _CONNECTOR_TAB_KEYS:
        labels.append(resolve_label(label_key, _tab_id.replace("-", " ").title()))
    return labels


def build_sources_connectors_modules() -> list[dict[str, Any]]:
    sources_label = resolve_label("nav.crawl", "Sources")
    modules: list[dict[str, Any]] = []
    for tab_id, label_key in _CONNECTOR_TAB_KEYS:
        title = resolve_label(label_key, tab_id.replace("-", " ").title())
        modules.append(
            {
                "group": sources_label,
                "title": title,
                "subtitle": "",
                "features": [],
            }
        )
    return modules


def detect_mcp_connector_query(query: str) -> bool:
    """Outbound RAGSuite MCP Connector (Cursor / Claude) → Configuration → MCP."""
    q = _tokenize(query) | _raw_tokens(query)
    if not q:
        return False
    if not (q & _MCP_SIGNAL):
        return False
    # Explicit host / integrate language, or bare MCP (not Sources inventory).
    if q & _MCP_HOST_SIGNAL:
        return True
    if q & {"server", "endpoint", "connect", "setup", "configure", "configuration"}:
        return True
    # Bare "mcp" / "ragsuite mcp" without Sources connector context.
    if q & _CONNECTOR_SIGNAL and q & (
        _tokenize(resolve_label("nav.crawl", "Sources")) | {"sources", "crawl", "source"}
    ):
        return False
    return True


def detect_sources_connectors_catalog_query(query: str) -> bool:
    """Inventory asks about inbound Sources connectors → Sources tabs catalog."""
    q = _tokenize(query) | _raw_tokens(query)
    if not q:
        return False
    # Outbound MCP is a different product surface.
    if detect_mcp_connector_query(query):
        return False
    if not (q & _CONNECTOR_SIGNAL):
        return False
    sources_tokens = _tokenize(resolve_label("nav.crawl", "Sources")) | {"sources", "crawl", "source"}
    if q & _CONNECTOR_INVENTORY_MARKERS:
        return True
    if q & sources_tokens:
        return True
    return False


def build_sources_connectors_catalog_workflow_dict() -> dict[str, Any]:
    sources_label = resolve_label("nav.crawl", "Sources")
    modules = build_sources_connectors_modules()
    tab_names = ", ".join(m["title"] for m in modules)
    match_tokens = (
        _tokenize(sources_label)
        | _CONNECTOR_SIGNAL
        | _CONNECTOR_INVENTORY_MARKERS
        | {"sources", "crawl", "source"}
    )
    for m in modules:
        match_tokens |= _tokenize(str(m.get("title") or ""))
    return {
        "key": SOURCES_CONNECTORS_CATALOG_KEY,
        "intent": "ui_navigation",
        "scope": "navigation_only",
        "route": _SOURCES_ROUTE,
        "route_label": sources_label,
        "route_path": "/(app)/(tabs)/crawl-management",
        "steps": [
            {
                "title": sources_label,
                "detail": (
                    f"Open {sources_label} from the sidebar. "
                    f"Available connector tabs are: {tab_names}."
                ),
            }
        ],
        "status_notes": (
            "Sources connectors sync external apps into RAGSuite. "
            "The outbound MCP Connector for Cursor/Claude lives under Integrations → MCP.",
        ),
        "match_tokens": tuple(sorted(match_tokens)),
        "match_token_prefixes": (),
        "section_id": None,
        "feature_prefixes": (),
        "preview_label_key": None,
        "catalog_modules": modules,
        "is_config_catalog": True,
    }


def build_configuration_mcp_workflow_dict() -> dict[str, Any]:
    config_label = resolve_label("nav.configuration", "Integrations")
    mcp_label = resolve_label("configuration.tabs.mcp", "MCP")
    match_tokens = (
        _tokenize(config_label)
        | _tokenize(mcp_label)
        | _MCP_SIGNAL
        | _MCP_HOST_SIGNAL
        | {"integrations", "api"}
    )
    return {
        "key": CONFIGURATION_MCP_KEY,
        "intent": "ui_navigation",
        "scope": "navigation_only",
        "route": _CONFIGURATION_ROUTE,
        "route_label": f"{config_label} → {mcp_label}",
        "route_path": "/(app)/configuration?tab=mcp",
        "steps": [
            {
                "title": config_label,
                "detail": f"Open {config_label} from the sidebar.",
            },
            {
                "title": mcp_label,
                "detail": (
                    f"Open the {mcp_label} tab to copy Cursor / Claude Desktop snippets "
                    "and connect with a project API key. This is separate from Sources connectors."
                ),
            },
        ],
        "status_notes": (
            "RAGSuite MCP is an outbound connector for Cursor and Claude — "
            "not the inbound Sources connector tabs.",
        ),
        "match_tokens": tuple(sorted(match_tokens)),
        "match_token_prefixes": (),
        "section_id": None,
        "feature_prefixes": (),
        "preview_label_key": None,
        "catalog_modules": (),
    }


def render_sources_connectors_answer_text(workflow_blocks: list[dict[str, Any]]) -> str:
    """Deterministic inventory for inbound Sources connectors."""
    for block in workflow_blocks:
        if not isinstance(block, dict) or block.get("kind") != "ui_workflow":
            continue
        if not is_sources_connectors_catalog_key(str(block.get("key") or "")):
            continue
        route = block.get("route") if isinstance(block.get("route"), dict) else {}
        label = str(route.get("label") or "").strip() or resolve_label("nav.crawl", "Sources")
        modules = block.get("catalog_modules") or []
        lines = [
            f"Open **{label}** in the sidebar to manage inbound connectors.",
            "These are the available connector tabs "
            "(separate from **Integrations → MCP** for Cursor/Claude):",
        ]
        if isinstance(modules, list):
            for mod in modules:
                if not isinstance(mod, dict):
                    continue
                title = str(mod.get("title") or "").strip()
                if title:
                    lines.append(f"- **{title}**")
        return "\n".join(lines).strip()
    return ""


def render_configuration_mcp_answer_text(workflow_blocks: list[dict[str, Any]]) -> str:
    """Deterministic guidance for outbound RAGSuite MCP Connector setup."""
    for block in workflow_blocks:
        if not isinstance(block, dict) or block.get("kind") != "ui_workflow":
            continue
        if not is_configuration_mcp_key(str(block.get("key") or "")):
            continue
        config_label = resolve_label("nav.configuration", "Integrations")
        mcp_label = resolve_label("configuration.tabs.mcp", "MCP")
        return (
            f"Open **{config_label}** → **{mcp_label}** to connect RAGSuite to Cursor or Claude Desktop. "
            "Copy the snippet, use a project API key, and point the host at your self-hosted MCP endpoint. "
            "Inbound Sources connectors (Drive, Notion, …) stay under **Sources** — they are not MCP."
        )
    return ""


def build_profile_workflow_dicts() -> tuple[dict[str, Any], ...]:
    profile_label = resolve_label("profile.title", "My Profile")
    out: list[dict[str, Any]] = []
    for tab in _PROFILE_TABS:
        tab_label = resolve_label(tab["tab_key"], tab["tab_default"])
        detail = resolve_label(tab.get("detail_key") or "", f"Use the {tab_label} tab.")
        match_tokens = (
            _tokenize(profile_label)
            | _tokenize(tab_label)
            | {"profile", "account"}
        )
        out.append(
            {
                "key": tab["key"],
                "intent": "ui_navigation",
                "scope": "navigation_only",
                "route": "profile",
                "route_label": profile_label,
                "route_path": "/(app)/profile",
                "steps": [
                    {
                        "title": profile_label,
                        "detail": f"Open {profile_label} from the app account menu.",
                    },
                    {
                        "title": tab_label,
                        "detail": detail or f"Select the {tab_label} tab.",
                    },
                ],
                "status_notes": (),
                "match_tokens": tuple(sorted(match_tokens)),
                "match_token_prefixes": ("profile.",),
                "section_id": None,
                "feature_prefixes": (),
                "preview_label_key": None,
                "catalog_modules": (),
            }
        )
    return tuple(out)


def build_app_settings_workflow_dicts() -> tuple[dict[str, Any], ...]:
    settings_home = resolve_label("settings.title", "Settings")
    out: list[dict[str, Any]] = []
    for surf in _APP_SETTINGS_SURFACES:
        label = resolve_label(surf["label_key"], surf["label_default"])
        parent = resolve_label(surf.get("parent_label_key") or "", settings_home)
        detail = ""
        if surf.get("detail_key"):
            detail = resolve_label(surf["detail_key"], "")
        if not detail and surf.get("detail"):
            detail = surf["detail"]
        if not detail:
            detail = f"Open {label} under {parent}."
        match_tokens = (
            _tokenize(label)
            | _tokenize(parent)
            | {"settings"}
            | _tokenize(surf["route"].replace("-", " ").replace("_", " "))
        )
        steps = [
            {
                "title": parent or settings_home,
                "detail": f"Open {parent or settings_home} from the app menu.",
            },
        ]
        if surf["route"] != "settings":
            steps.append({"title": label, "detail": detail})
        else:
            steps[0]["detail"] = detail
        out.append(
            {
                "key": surf["key"],
                "intent": "ui_navigation",
                "scope": "navigation_only",
                "route": surf["route"],
                "route_label": label,
                "route_path": surf["path"],
                "steps": steps,
                "status_notes": (),
                "match_tokens": tuple(sorted(match_tokens)),
                "match_token_prefixes": (),
                "section_id": None,
                "feature_prefixes": (),
                "preview_label_key": None,
                "catalog_modules": (),
            }
        )
    return tuple(out)


def build_gap_fill_route_workflow_dicts(
    *,
    covered_routes: set[str],
) -> tuple[dict[str, Any], ...]:
    """Thin open-screen workflows for drawer routes that still lack any workflow."""
    out: list[dict[str, Any]] = []
    for record in load_dashboard_routes():
        route = str(record.get("route") or "").strip()
        if not route or route in covered_routes:
            continue
        label = str(record.get("label") or route).strip()
        section = str(record.get("section") or "").strip()
        match_tokens = _tokenize(label) | _tokenize(route.replace("-", " "))
        if section:
            match_tokens |= _tokenize(section)
        detail = f"In the sidebar, open {label}."
        if section:
            detail = f"In the sidebar under {section}, open {label}."
        out.append(
            {
                "key": f"open_{route.replace('-', '_')}",
                "intent": "ui_navigation",
                "scope": "navigation_only",
                "route": route,
                "route_label": label,
                "route_path": f"/(app)/{route}",
                "steps": [{"title": label, "detail": detail}],
                "status_notes": (),
                "match_tokens": tuple(sorted(match_tokens)),
                "match_token_prefixes": (),
                "section_id": None,
                "feature_prefixes": (),
                "preview_label_key": None,
                "catalog_modules": (),
            }
        )
    return tuple(out)


@lru_cache(maxsize=1)
def build_app_surface_workflow_dicts() -> tuple[dict[str, Any], ...]:
    """All app-level workflows: connectors catalog, profile, settings, drawer gaps."""
    from .ui_config_surfaces import config_routes

    # Routes already covered by hand-authored UI_WORKFLOWS + config product surfaces.
    hand_covered = {
        "index",
        "crawl-management",
        "projects",
        "compare-models",
        "history",
        "system-health",
        *config_routes(),
    }
    explicit = (
        (build_sources_connectors_catalog_workflow_dict(),)
        + (build_configuration_mcp_workflow_dict(),)
        + build_profile_workflow_dicts()
        + build_app_settings_workflow_dicts()
    )
    explicit_routes = {str(d["route"]) for d in explicit}
    gaps = build_gap_fill_route_workflow_dicts(covered_routes=hand_covered | explicit_routes)
    return explicit + gaps


__all__ = [
    "CONFIGURATION_MCP_KEY",
    "SOURCES_CONNECTORS_CATALOG_KEY",
    "build_app_surface_workflow_dicts",
    "build_configuration_mcp_workflow_dict",
    "connector_tab_labels",
    "detect_mcp_connector_query",
    "detect_sources_connectors_catalog_query",
    "is_configuration_mcp_key",
    "is_inventory_catalog_workflow_key",
    "is_sources_connectors_catalog_key",
    "render_configuration_mcp_answer_text",
    "render_sources_connectors_answer_text",
]
