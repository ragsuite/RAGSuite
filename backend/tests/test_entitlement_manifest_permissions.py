"""Entitlement matcher: permissions declared by entitled Enterprise manifests."""
from __future__ import annotations

import pytest

from app.platform import entitlement_deps, module_loader
from app.platform.module_types import ModuleManifest


def _manifest(module_id: str, edition: str, permissions: list[str]) -> ModuleManifest:
    return ModuleManifest(id=module_id, version="1.0.0", edition=edition, permissions=permissions)


@pytest.fixture
def manifests(monkeypatch):
    loaded = {
        "audit_full": _manifest("audit_full", "enterprise", ["audit:export", "audit:read_full"]),
        "audit_basic": _manifest("audit_basic", "community", ["audit:read_basic"]),
    }
    monkeypatch.setattr(module_loader, "loaded_manifests", lambda: dict(loaded))
    return loaded


def test_exact_and_prefix_matches_still_work(manifests):
    assert entitlement_deps._feature_in_entitlements("sso", {"sso"})
    assert entitlement_deps._feature_in_entitlements("sso:use", {"sso"})
    assert not entitlement_deps._feature_in_entitlements("ssox:use", {"sso"})


def test_permission_declared_by_entitled_enterprise_manifest(manifests):
    ent = {"audit_full", "analytics"}
    assert entitlement_deps._feature_in_entitlements("audit:read_full", ent)
    assert entitlement_deps._feature_in_entitlements("audit:export", ent)


def test_permission_rejected_when_module_not_entitled(manifests):
    assert not entitlement_deps._feature_in_entitlements("audit:read_full", {"analytics"})


def test_unknown_permission_rejected(manifests):
    assert not entitlement_deps._feature_in_entitlements("audit:delete_all", {"audit_full"})


def test_community_manifest_permissions_do_not_grant(manifests):
    assert not entitlement_deps._feature_in_entitlements("audit:read_basic", {"audit_basic"})


def test_manifest_lookup_failure_denies(monkeypatch):
    def boom():
        raise RuntimeError("registry unavailable")

    monkeypatch.setattr(module_loader, "loaded_manifests", boom)
    assert not entitlement_deps._feature_in_entitlements("audit:read_full", {"audit_full"})
