"""Project permission catalog and effective-permission helpers.

Canonical strings are ``<module>:read`` / ``<module>:write``. Write always implies
Read. Legacy single-switch strings are accepted at runtime and rewritten on
normalize/migrate so existing member rows keep their access.
"""

from __future__ import annotations

from typing import Iterable

# --- Module catalog (canonical) ------------------------------------------------

# module id → allowed levels. Read-only modules have no write level.
MODULE_CATALOG: dict[str, tuple[str, ...]] = {
    "analytics": ("read",),
    "crawl_domain": ("read", "write"),
    "crawl_sitemap": ("read", "write"),
    "documents": ("read", "write"),
    "documents_text": ("read", "write"),
    "documents_qa": ("read", "write"),
    "ai_assistant": ("read", "write"),
    "chatbot_chat": ("read", "write"),
    "chatbot_settings": ("read", "write"),
    "chatbot_integrations": ("read", "write"),
    "search_use": ("read", "write"),
    "search_settings": ("read", "write"),
    "search_integrations": ("read", "write"),
    "model_configuration": ("read", "write"),
    "compare": ("read",),
    "history": ("read", "write"),
    "feedback": ("read", "write"),
    "mcp": ("read", "write"),
    "settings_global": ("read", "write"),
    "settings_data_retention": ("read", "write"),
    "settings_session_timeout": ("read", "write"),
    "settings_i18n": ("read", "write"),
    "system_health": ("read", "write"),
    "audit_logs": ("read", "write"),
    "profile": ("read", "write"),
    # Hidden (no Project access switch) — kept so existing grants still work.
    "voice_pilot": ("read", "write"),
}

READ_ONLY_MODULES: frozenset[str] = frozenset(
    module for module, levels in MODULE_CATALOG.items() if "write" not in levels
)

WORKSPACE_PERMISSIONS: frozenset[str] = frozenset(
    {
        "project:read",
        "project:write",
        "project:create",
        "project:admin",
    }
)

HIDDEN_CANONICAL_PERMISSIONS: frozenset[str] = frozenset(
    {
        "compliance:view_receipts",
    }
)


def _canonical_module_permissions() -> set[str]:
    perms: set[str] = set()
    for module, levels in MODULE_CATALOG.items():
        for level in levels:
            perms.add(f"{module}:{level}")
    return perms


CANONICAL_PROJECT_PERMISSIONS: frozenset[str] = frozenset(
    _canonical_module_permissions() | set(WORKSPACE_PERMISSIONS) | set(HIDDEN_CANONICAL_PERMISSIONS)
)

# Write implies the matching read on the same module.
PERMISSION_IMPLIES: dict[str, tuple[str, ...]] = {
    f"{module}:write": (f"{module}:read",)
    for module, levels in MODULE_CATALOG.items()
    if "write" in levels
}

# Legacy single-switch / umbrella strings → canonical grant(s). Former "on"
# switches map to write so existing members keep mutating access. Query-only
# switches (chat:use, search:use, ai_assistant:use, compare:use, history:read,
# analytics:read) map to read.
LEGACY_EXPAND: dict[str, tuple[str, ...]] = {
    "chat:use": ("chatbot_chat:read",),
    "search:use": ("search_use:read",),
    "chatbot:settings": ("chatbot_settings:write",),
    "chatbot:integrations": ("chatbot_integrations:write",),
    "search:settings": ("search_settings:write",),
    "search:integrations": ("search_integrations:write",),
    "model_configuration:manage": ("model_configuration:write",),
    "api_keys:read": ("mcp:read",),
    "api_keys:write": ("mcp:write",),
    "api_keys:manage": ("mcp:write",),
    "ai_assistant:use": ("ai_assistant:read",),
    "ai_assistant:settings": ("ai_assistant:write",),
    "crawl:manage": ("crawl_domain:write", "crawl_sitemap:write"),
    "crawl:domain": ("crawl_domain:write",),
    "crawl:sitemap": ("crawl_sitemap:write",),
    "documents:manage": ("documents:write", "documents_text:write", "documents_qa:write"),
    "documents:document": ("documents:write",),
    "documents:text": ("documents_text:write",),
    "documents:qa_pairs": ("documents_qa:write",),
    "feedback:moderate": ("feedback:write",),
    "settings:manage": ("mcp:write",),
    "settings:global": ("settings_global:write",),
    "settings:data_retention": ("settings_data_retention:write",),
    "settings:session_timeout": ("settings_session_timeout:write",),
    "settings:i18n": ("settings_i18n:write",),
    "compare:use": ("compare:read",),
    "voice_pilot:use": ("voice_pilot:read",),
    "voice_pilot:settings": ("voice_pilot:write",),
    "widgets:manage": (
        "chatbot_settings:write",
        "search_settings:write",
        "chatbot_integrations:write",
        "search_integrations:write",
    ),
    "history:read": ("history:read",),
    "analytics:read": ("analytics:read",),
    "profile:general": ("profile:write",),
    "profile:security": ("profile:write",),
    "compliance:view_receipts": ("audit_logs:read",),
}

# Feature removed from the product — drop on normalize/migrate. Leftover HTTP
# routes stay mapped so un-migrated rows still authorize until rewritten.
DROPPED_PERMISSIONS: frozenset[str] = frozenset(
    {
        "connectors:manage",
        "connectors:gmail",
        "connectors:drive",
        "connectors:notion",
        "connectors:confluence",
        "connectors:slack",
        "connectors:sharepoint",
        "connectors:teams",
    }
)

CONNECTOR_PERMISSIONS: frozenset[str] = frozenset(
    p for p in DROPPED_PERMISSIONS if p.startswith("connectors:")
)

CONNECTOR_PATH_PREFIXES: tuple[tuple[str, str], ...] = (
    ("/api/v1/gmail", "connectors:gmail"),
    ("/api/v1/connectors/drive", "connectors:drive"),
    ("/api/v1/connectors/notion", "connectors:notion"),
    ("/api/v1/connectors/confluence", "connectors:confluence"),
    ("/api/v1/connectors/slack", "connectors:slack"),
    ("/api/v1/connectors/sharepoint", "connectors:sharepoint"),
    ("/api/v1/connectors/teams", "connectors:teams"),
)

MEMBER_PERMISSION_BLOCKLIST: frozenset[str] = frozenset({"project:admin", "project:create"})

ALL_PROJECT_PERMISSIONS: frozenset[str] = frozenset(
    set(CANONICAL_PROJECT_PERMISSIONS)
    | set(LEGACY_EXPAND)
    | set(DROPPED_PERMISSIONS)
)


def _raw_value(raw: object) -> str:
    return raw.value if hasattr(raw, "value") else str(raw)


def _base_forms(permission: str) -> tuple[str, ...]:
    """Canonical strings a permission names, without write→read implication."""
    if permission in LEGACY_EXPAND:
        return LEGACY_EXPAND[permission]
    if permission in CANONICAL_PROJECT_PERMISSIONS:
        return (permission,)
    return ()


def canonical_forms(permission: str) -> frozenset[str]:
    """Canonical strings one grant satisfies, including write→read implication."""
    bases = _base_forms(permission)
    if not bases:
        return frozenset()
    granted: set[str] = set(bases)
    for base in bases:
        granted.update(PERMISSION_IMPLIES.get(base, ()))
        module, sep, level = base.partition(":")
        if sep and level == "write":
            granted.add(f"{module}:read")
    return frozenset(granted)


def has_effective_permission(permissions: Iterable[str] | None, required: str) -> bool:
    granted_raw = {str(p) for p in (permissions or [])}
    if "project:admin" in granted_raw:
        return True
    if required in granted_raw:
        return True
    # Leftover connector umbrellas (feature removed from the assign UI).
    if required in CONNECTOR_PERMISSIONS and "connectors:manage" in granted_raw:
        return True
    # Implication applies to grants only: write satisfies read, not the reverse.
    required_canon = set(_base_forms(required))
    if not required_canon and required not in CONNECTOR_PERMISSIONS:
        return False
    granted_canon: set[str] = set()
    for value in granted_raw:
        granted_canon.update(canonical_forms(value))
    return bool(required_canon & granted_canon)


def _canonical_store_strings(value: str) -> list[str]:
    """Rewrite one stored/legacy string to canonical forms (write kept, implied read omitted)."""
    if value in DROPPED_PERMISSIONS or value in MEMBER_PERMISSION_BLOCKLIST:
        return []
    if value in LEGACY_EXPAND:
        return [item for item in LEGACY_EXPAND[value] if item in CANONICAL_PROJECT_PERMISSIONS]
    if value in CANONICAL_PROJECT_PERMISSIONS:
        return [value]
    return []


def _dedupe_implied_reads(values: list[str]) -> list[str]:
    writes = {p[: -len(":write")] for p in values if p.endswith(":write")}
    out: list[str] = []
    seen: set[str] = set()
    for perm in values:
        if perm.endswith(":read") and perm[: -len(":read")] in writes:
            continue
        if perm in seen:
            continue
        seen.add(perm)
        out.append(perm)
    return out


def normalize_member_permissions(permissions: Iterable[object] | None) -> list[str]:
    """Drop deprecated/unknown/connector strings and rewrite to canonical forms."""
    collected: list[str] = []
    seen: set[str] = set()
    for raw in permissions or []:
        value = _raw_value(raw)
        if value in MEMBER_PERMISSION_BLOCKLIST or value in DROPPED_PERMISSIONS:
            continue
        for canonical in _canonical_store_strings(value):
            if canonical in MEMBER_PERMISSION_BLOCKLIST or canonical in seen:
                continue
            seen.add(canonical)
            collected.append(canonical)
    collected = _dedupe_implied_reads(collected)
    if collected and "project:read" not in collected:
        collected.insert(0, "project:read")
    return collected


def migrate_member_permissions(permissions: Iterable[object] | None) -> list[str]:
    """One-time rewrite used by the alembic data migration (same as normalize)."""
    return normalize_member_permissions(permissions)


# Default ACL for a Member who creates their own project (never project:admin).
DEFAULT_CREATOR_MEMBER_PERMISSIONS: list[str] = [
    "project:read",
    "project:write",
    "crawl_domain:write",
    "crawl_sitemap:write",
    "documents:write",
    "documents_text:write",
    "documents_qa:write",
    "chatbot_chat:write",
    "chatbot_settings:write",
    "chatbot_integrations:write",
    "search_use:read",
    "search_settings:write",
    "search_use:write",
    "analytics:read",
    "api_keys:write",
    "ai_assistant:write",
    "feedback:write",
    "compare:read",
    "voice_pilot:write",
    "mcp:write",
    "settings_global:write",
    "settings_data_retention:write",
    "settings_session_timeout:write",
    "settings_i18n:write",
    "model_configuration:write",
    "profile:write",
    "system_health:write",
    "audit_logs:write",
]

def normalize_workspace_permissions(permissions: Iterable[object] | None) -> list[str]:
    """Workspace-scoped flags (currently project:create only)."""
    allowed = {"project:create"}
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in permissions or []:
        value = _raw_value(raw)
        if value not in allowed or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def union_permissions(rows: Iterable[Iterable[str] | None]) -> list[str]:
    merged: set[str] = set()
    for row in rows:
        merged.update(row or [])
    return sorted(merged)


def user_can_create_project(permissions_union: Iterable[str], *, is_org_admin: bool) -> bool:
    """Org admins create projects. Members never get create via Team Project access."""
    del permissions_union  # retained for call-site compat; member grants are ignored
    return bool(is_org_admin)


def module_permission(module: str, level: str) -> str:
    if module in READ_ONLY_MODULES:
        return f"{module}:read"
    return f"{module}:{level}"
