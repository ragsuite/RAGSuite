"""Project permission catalog and effective-permission helpers."""

from __future__ import annotations

from typing import Iterable

# Canonical permission strings (also mirrored in OrgProjectPermission enum).
ALL_PROJECT_PERMISSIONS: frozenset[str] = frozenset(
    {
        "project:read",
        "project:write",
        "project:create",
        "project:admin",
        "crawl:manage",
        "crawl:domain",
        "crawl:sitemap",
        "documents:manage",
        "documents:document",
        "documents:text",
        "documents:qa_pairs",
        "connectors:manage",
        "connectors:gmail",
        "connectors:drive",
        "connectors:notion",
        "connectors:confluence",
        "connectors:slack",
        "connectors:sharepoint",
        "connectors:teams",
        "ai_assistant:use",
        "ai_assistant:settings",
        "chat:use",
        "chatbot:settings",
        "chatbot:integrations",
        "search:use",
        "search:settings",
        "search:integrations",
        "model_configuration:manage",
        "compare:use",
        "voice_pilot:use",
        "voice_pilot:settings",
        "history:read",
        "analytics:read",
        "api_keys:manage",
        "widgets:manage",
        "settings:manage",
        "feedback:moderate",
        "settings:global",
        "settings:data_retention",
        "settings:session_timeout",
        "settings:i18n",
        "compliance:view_receipts",
        "profile:general",
        "profile:security",
    }
)

MEMBER_PERMISSION_BLOCKLIST: frozenset[str] = frozenset({"project:admin", "project:create"})

CONNECTOR_PERMISSIONS: frozenset[str] = frozenset(
    {
        "connectors:gmail",
        "connectors:drive",
        "connectors:notion",
        "connectors:confluence",
        "connectors:slack",
        "connectors:sharepoint",
        "connectors:teams",
    }
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


def normalize_member_permissions(permissions: Iterable[object] | None) -> list[str]:
    """Drop deprecated super-permissions and unknown values."""
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in permissions or []:
        value = raw.value if hasattr(raw, "value") else str(raw)
        if value in MEMBER_PERMISSION_BLOCKLIST or value in seen:
            continue
        if value not in ALL_PROJECT_PERMISSIONS:
            continue
        seen.add(value)
        normalized.append(value)
    if normalized and "project:read" not in seen:
        normalized.insert(0, "project:read")
    return normalized


# Default ACL for a Member who creates their own project (never project:admin).
DEFAULT_CREATOR_MEMBER_PERMISSIONS: list[str] = [
    "project:read",
    "project:write",
    "crawl:manage",
    "documents:manage",
    "connectors:manage",
    "chat:use",
    "search:use",
    "analytics:read",
    "api_keys:manage",
    "widgets:manage",
    "ai_assistant:use",
    "ai_assistant:settings",
    "history:read",
    "feedback:moderate",
    "compare:use",
    "voice_pilot:use",
    "settings:global",
    "profile:general",
    "profile:security",
]


def normalize_workspace_permissions(permissions: Iterable[object] | None) -> list[str]:
    """Workspace-scoped flags (currently project:create only)."""
    allowed = {"project:create"}
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in permissions or []:
        value = raw.value if hasattr(raw, "value") else str(raw)
        if value not in allowed or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def has_effective_permission(permissions: Iterable[str] | None, required: str) -> bool:
    granted = set(permissions or [])
    if "project:admin" in granted:
        return True
    if required in granted:
        return True
    if required in CONNECTOR_PERMISSIONS and "connectors:manage" in granted:
        return True
    # Legacy Sources umbrellas ↔ granular Project access switches.
    if required in {"crawl:domain", "crawl:sitemap"} and "crawl:manage" in granted:
        return True
    if required in {"documents:document", "documents:text", "documents:qa_pairs"} and "documents:manage" in granted:
        return True
    if required == "crawl:manage" and granted & {"crawl:domain", "crawl:sitemap"}:
        return True
    if required == "documents:manage" and granted & {
        "documents:document",
        "documents:text",
        "documents:qa_pairs",
    }:
        return True
    # Admin Assistant is one Project access switch — either string unlocks the module.
    if required in {"ai_assistant:use", "ai_assistant:settings"} and granted & {
        "ai_assistant:use",
        "ai_assistant:settings",
    }:
        return True
    return False


def union_permissions(rows: Iterable[Iterable[str] | None]) -> list[str]:
    merged: set[str] = set()
    for row in rows:
        merged.update(row or [])
    return sorted(merged)


def user_can_create_project(permissions_union: Iterable[str], *, is_org_admin: bool) -> bool:
    """Org admins create projects. Members never get create via Team Project access."""
    del permissions_union  # retained for call-site compat; member grants are ignored
    return bool(is_org_admin)
