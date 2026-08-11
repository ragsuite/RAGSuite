"""Public-CE hardening — anti-spoof + no DEBUG/unlicensed unlock for EE."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.platform.ee_guard import (
    KNOWN_ENTERPRISE_MODULE_IDS,
    is_dx_ee_attach,
    is_under_installed_ee,
)
from app.platform.license_state import entitlements_allow_manifest, reset_license_cache
from app.platform.module_types import ModuleManifest, ModuleSurfaces


@pytest.fixture(autouse=True)
def _clean_license(monkeypatch, tmp_path):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)
    reset_license_cache()
    yield
    reset_license_cache()


def test_reserved_ee_id_denied_even_if_tagged_community():
    man = ModuleManifest(
        id="sso",
        version="0.1.0",
        edition="community",  # spoof
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["sso:use"],
    )
    assert man.id in KNOWN_ENTERPRISE_MODULE_IDS
    assert entitlements_allow_manifest(man) is False


def test_debug_does_not_unlock_ee(monkeypatch):
    monkeypatch.setenv("DEBUG", "true")
    from app.platform import settings as settings_mod

    monkeypatch.setattr(settings_mod.settings, "debug", True)
    man = ModuleManifest(
        id="organization",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["organization:admin"],
    )
    assert entitlements_allow_manifest(man) is False


def test_env_allow_unlicensed_no_longer_unlocks(monkeypatch):
    """Legacy RAGSUITE_ALLOW_UNLICENSED_EE must not bypass the license gate."""
    monkeypatch.setenv("RAGSUITE_ALLOW_UNLICENSED_EE", "1")
    man = ModuleManifest(
        id="sso",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["sso:use"],
    )
    assert entitlements_allow_manifest(man) is False


def test_dx_sibling_ee_root_still_requires_key(monkeypatch, tmp_path):
    ee = tmp_path / "RAGSUITE_EE"
    (ee / "modules").mkdir(parents=True)
    monkeypatch.setenv("RAGSUITE_EE_ROOT", str(ee))
    assert is_dx_ee_attach() is True
    man = ModuleManifest(
        id="organization",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["organization:admin"],
    )
    assert entitlements_allow_manifest(man, module_dir=ee / "modules" / "organization") is False


def test_installed_active_ee_root_is_not_dx(monkeypatch, tmp_path):
    installed = tmp_path / "extensions" / "installed" / "ee" / "1.0.0"
    (installed / "modules").mkdir(parents=True)
    monkeypatch.setenv("RAGSUITE_EE_ROOT", str(installed))
    assert is_dx_ee_attach() is False


def test_installed_ee_path_always_gated(tmp_path):
    ee_mod = tmp_path / "extensions" / "installed" / "ee" / "0.1.0" / "modules" / "sso"
    ee_mod.mkdir(parents=True)
    assert is_under_installed_ee(ee_mod) is True
    man = ModuleManifest(
        id="custom_plugin",  # not reserved id
        version="0.1.0",
        edition="community",
        status="migrated",
        surfaces=ModuleSurfaces(),
    )
    assert entitlements_allow_manifest(man, module_dir=ee_mod) is False


def test_ce_documents_still_allowed():
    man = ModuleManifest(
        id="documents",
        version="0.1.0",
        edition="community",
        status="migrated",
        surfaces=ModuleSurfaces(),
    )
    assert entitlements_allow_manifest(man) is True


def test_unsigned_bundle_refused_by_default(tmp_path):
    from app.platform.bundle_signature import verify_bundle_signature

    root = tmp_path / "bundle"
    root.mkdir()
    (root / "CHECKSUMS.sha256").write_text("", encoding="utf-8")
    (root / "signature").write_text("", encoding="utf-8")
    ok, msg = verify_bundle_signature(root, allow_unsigned=False)
    assert ok is False
    assert "required" in msg.lower() or "empty" in msg.lower()


def test_unsigned_bundle_allowed_when_opted_in(tmp_path):
    from app.platform.bundle_signature import verify_bundle_signature

    root = tmp_path / "bundle"
    root.mkdir()
    (root / "CHECKSUMS.sha256").write_text("", encoding="utf-8")
    ok, _msg = verify_bundle_signature(root, allow_unsigned=True)
    assert ok is True
