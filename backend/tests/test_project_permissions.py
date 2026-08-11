"""Unit tests for project permission helpers."""

from app.services.project_permissions import (
    has_effective_permission,
    normalize_member_permissions,
    user_can_create_project,
)


def test_compare_use_is_standalone():
    assert not has_effective_permission(["chat:use", "search:use"], "compare:use")
    assert has_effective_permission(["compare:use"], "compare:use")


def test_connector_manage_grants_connector_leaf():
    assert has_effective_permission(["connectors:manage"], "connectors:gmail")
    assert not has_effective_permission(["connectors:gmail"], "connectors:drive")


def test_normalize_drops_unknown_and_admin():
    perms = normalize_member_permissions(["project:admin", "analytics:read", "bogus:perm"])
    assert "project:admin" not in perms
    assert "bogus:perm" not in perms
    assert "analytics:read" in perms
    assert "project:read" in perms


def test_user_can_create_project():
    assert user_can_create_project(["project:create"], is_org_admin=False)
    assert not user_can_create_project(["project:read"], is_org_admin=False)
    assert user_can_create_project([], is_org_admin=True)
