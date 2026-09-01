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
        "documents:manage",
        "connectors:manage",
        "connectors:gmail",
        "connectors:drive",
        "connectors:notion",
        "connectors:confluence",
        "connectors:slack",
        "connectors:sharepoint",
        "chat:use",
        "chatbot:settings",
        "chatbot:integrations",
        "search:use",
        "search:settings",
        "search:integrations",
        "compare:use",
        "history:read",
        "analytics:read",
        "api_keys:manage",
        "widgets:manage",
        "settings:manage",
        "feedback:moderate",
        "settings:global",
        "settings:data_retention",
        "settings:i18n",
        "compliance:view_receipts",
        "profile:general",
        "profile:security",
    }
)

MEMBER_PERMISSION_BLOCKLIST: frozenset[str] = frozenset({"project:admin"})

CONNECTOR_PERMISSIONS: frozenset[str] = frozenset(
    {
        "connectors:gmail",
        "connectors:drive",
        "connectors:notion",
        "connectors:confluence",
        "connectors:slack",
        "connectors:sharepoint",
    }
)

CONNECTOR_PATH_PREFIXES: tuple[tuple[str, str], ...] = (
    ("/api/v1/gmail", "connectors:gmail"),
    ("/api/v1/connectors/drive", "connectors:drive"),
    ("/api/v1/connectors/notion", "connectors:notion"),
    ("/api/v1/connectors/confluence", "connectors:confluence"),
    ("/api/v1/connectors/slack", "connectors:slack"),
    ("/api/v1/connectors/sharepoint", "connectors:sharepoint"),
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


def has_effective_permission(permissions: Iterable[str] | None, required: str) -> bool:
    granted = set(permissions or [])
    if "project:admin" in granted:
        return True
    if required in granted:
        return True
    if required in CONNECTOR_PERMISSIONS and "connectors:manage" in granted:
        return True
    return False


def union_permissions(rows: Iterable[Iterable[str] | None]) -> list[str]:
    merged: set[str] = set()
    for row in rows:
        merged.update(row or [])
    return sorted(merged)


def user_can_create_project(permissions_union: Iterable[str], *, is_org_admin: bool) -> bool:
    if is_org_admin:
        return True
    return has_effective_permission(permissions_union, "project:create")
