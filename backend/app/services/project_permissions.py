"""Project permission catalog and effective-permission helpers.

Canonical strings are ``<module>:read`` / ``<module>:write``. Write always implies
Read. Legacy single-switch strings are accepted at runtime and rewritten on
normalize/migrate so existing member rows keep their access.
"""

from __future__ import annotations

from typing import Iterable, TypedDict

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
        # Always granted to members; not assignable in Group access.
        "profile:read",
        "profile:write",
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

# Direct-only overlay markers. Never accepted on User Group grants.
PROJECT_NONE = "project:none"
DENY_SUFFIX = ":none"


class DirectAcl(TypedDict):
    grants: list[str]
    denied_modules: list[str]
    project_denied: bool


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


def module_id_from_permission(permission: str) -> str | None:
    value = _raw_value(permission)
    if value == PROJECT_NONE:
        return "project"
    module, sep, _level = value.partition(":")
    if not sep or not module:
        return None
    if module in MODULE_CATALOG or module == "project":
        return module
    return None


def deny_token_for_module(module: str) -> str:
    if module == "project":
        return PROJECT_NONE
    return f"{module}{DENY_SUFFIX}"


def is_deny_token(permission: str) -> bool:
    value = _raw_value(permission)
    if value == PROJECT_NONE:
        return True
    module, sep, level = value.partition(":")
    return bool(sep) and level == "none" and module in MODULE_CATALOG


def split_direct_acl(permissions: Iterable[object] | None) -> DirectAcl:
    """Split a Direct ``project_members.permissions`` list into grants and denials."""
    grants_raw: list[str] = []
    denied: set[str] = set()
    project_denied = False
    for raw in permissions or []:
        value = _raw_value(raw)
        if value == PROJECT_NONE:
            project_denied = True
            continue
        if is_deny_token(value):
            module = module_id_from_permission(value)
            if module and module != "project":
                denied.add(module)
            continue
        grants_raw.append(value)
    grants = normalize_member_permissions(grants_raw)
    # A module deny must not coexist with a Direct grant for the same module.
    if denied:
        grants = [
            perm
            for perm in grants
            if (module_id_from_permission(perm) or "") not in denied
        ]
        if grants and "project:read" not in grants and any(
            module_id_from_permission(p) in MODULE_CATALOG for p in grants
        ):
            grants.insert(0, "project:read")
    return DirectAcl(
        grants=grants,
        denied_modules=sorted(denied),
        project_denied=project_denied,
    )


def compose_direct_acl(
    grants: Iterable[object] | None = None,
    *,
    denied_modules: Iterable[str] | None = None,
    project_denied: bool = False,
) -> list[str]:
    """Build the stored Direct permission list (grants + deny tokens)."""
    acl = split_direct_acl(list(grants or []))
    denied = {str(m).strip() for m in (denied_modules or []) if str(m).strip()}
    denied |= set(acl["denied_modules"])
    denied.discard("project")
    # Drop grants that collide with an explicit module deny.
    grant_list = [
        perm
        for perm in acl["grants"]
        if (module_id_from_permission(perm) or "") not in denied
    ]
    if grant_list and "project:read" not in grant_list:
        grant_list.insert(0, "project:read")
    out: list[str] = list(grant_list)
    if project_denied or acl["project_denied"]:
        out.append(PROJECT_NONE)
    for module in sorted(denied):
        if module in MODULE_CATALOG:
            out.append(deny_token_for_module(module))
    return out


def strip_deny_tokens(permissions: Iterable[object] | None) -> list[str]:
    """Group writes: keep grants only."""
    return normalize_member_permissions(
        [p for p in (permissions or []) if not is_deny_token(_raw_value(p)) and _raw_value(p) != PROJECT_NONE]
    )


def modules_touched_by_permissions(permissions: Iterable[str] | None) -> set[str]:
    touched: set[str] = set()
    for perm in permissions or []:
        module = module_id_from_permission(perm)
        if module and module != "project":
            touched.add(module)
    return touched


def overlay_permissions(direct_raw: Iterable[object] | None, group_grants: Iterable[str] | None) -> list[str]:
    """Per-module Direct overlay on group grants. Direct None denies that module."""
    acl = split_direct_acl(direct_raw)
    if acl["project_denied"]:
        return []
    group = normalize_member_permissions(group_grants)
    denied = set(acl["denied_modules"])
    direct_modules = modules_touched_by_permissions(acl["grants"])
    out: list[str] = []
    seen: set[str] = set()

    def _add(perm: str) -> None:
        if perm in seen or perm in MEMBER_PERMISSION_BLOCKLIST:
            return
        seen.add(perm)
        out.append(perm)

    for perm in acl["grants"]:
        module = module_id_from_permission(perm)
        if module in denied:
            continue
        _add(perm)

    for perm in group:
        module = module_id_from_permission(perm)
        if module is None:
            continue
        # Catalog modules: inherit only when Direct did not touch that module.
        if module in MODULE_CATALOG:
            if module in denied or module in direct_modules:
                continue
            _add(perm)
            continue
        # project:read / project:write — inherit unless Direct already supplies grants
        # (normalize adds project:read) or the whole project is denied.
        if module == "project":
            if acl["grants"] or denied:
                continue
            _add(perm)

    out = _dedupe_implied_reads(out)
    if out and "project:read" not in out:
        out.insert(0, "project:read")
    return out


def user_can_create_project(permissions_union: Iterable[str], *, is_org_admin: bool) -> bool:
    """Org admins create projects. Members never get create via Team Project access."""
    del permissions_union  # retained for call-site compat; member grants are ignored
    return bool(is_org_admin)


def module_permission(module: str, level: str) -> str:
    if module in READ_ONLY_MODULES:
        return f"{module}:read"
    return f"{module}:{level}"
