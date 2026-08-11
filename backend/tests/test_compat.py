"""Phase 13 — platform ↔ ACTIVE bundle ↔ license schema compat."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.platform.compat import (
    active_bundle_platform_compatible,
    build_compat_report,
    doctor_should_fail,
)
from app.platform.license_state import reset_license_cache
from app.platform.semver_range import satisfies
from app.platform.version import PLATFORM_VERSION


def test_satisfies_basic():
    assert satisfies("0.1.0", ">=0.1.0 <2.0.0")
    assert not satisfies("2.0.0", ">=0.1.0 <2.0.0")
    assert satisfies("1.4.2", ">=1.4.0 <2.0.0")


def test_no_active_bundle_is_compatible(tmp_path, monkeypatch):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    # Point repo root away from real ACTIVE by using empty installed tree via monkeypatch
    from app.platform import bundle_install

    ee = tmp_path / "extensions" / "installed" / "ee"
    ee.mkdir(parents=True)
    monkeypatch.setattr(bundle_install, "installed_ee_base", lambda: ee)
    monkeypatch.setattr(bundle_install, "repo_root", lambda: tmp_path)
    ok, detail, compat = active_bundle_platform_compatible("0.1.0")
    assert ok is True
    assert compat is None
    assert "no ACTIVE" in detail


def test_active_incompatible_fails_doctor(tmp_path, monkeypatch):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    reset_license_cache()
    from app.platform import bundle_install, compat as compat_mod

    ee = tmp_path / "extensions" / "installed" / "ee"
    ver = ee / "9.9.9"
    ver.mkdir(parents=True)
    (ver / "manifest.json").write_text(
        json.dumps(
            {
                "version": "9.9.9",
                "platform_compat": ">=99.0.0 <100.0.0",
            }
        ),
        encoding="utf-8",
    )
    (ee / "ACTIVE").write_text("9.9.9\n", encoding="utf-8")
    monkeypatch.setattr(bundle_install, "installed_ee_base", lambda: ee)
    monkeypatch.setattr(compat_mod, "installed_ee_base", lambda: ee)
    monkeypatch.setattr(compat_mod, "active_bundle_version", lambda: "9.9.9")

    ok, detail, compat = active_bundle_platform_compatible(PLATFORM_VERSION)
    assert ok is False
    assert "does not satisfy" in detail
    assert compat == ">=99.0.0 <100.0.0"

    report = build_compat_report(platform_version=PLATFORM_VERSION)
    assert report.ok is False
    assert doctor_should_fail(report) is True
    names = {c.name: c for c in report.checks}
    assert names["active_bundle_compat"].ok is False


def test_active_compatible_ok(tmp_path, monkeypatch):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    reset_license_cache()
    from app.platform import bundle_install, compat as compat_mod

    ee = tmp_path / "extensions" / "installed" / "ee"
    ver = ee / "0.1.0"
    ver.mkdir(parents=True)
    (ver / "manifest.json").write_text(
        json.dumps(
            {
                "version": "0.1.0",
                "platform_compat": ">=0.1.0 <2.0.0",
            }
        ),
        encoding="utf-8",
    )
    (ee / "ACTIVE").write_text("0.1.0\n", encoding="utf-8")
    monkeypatch.setattr(bundle_install, "installed_ee_base", lambda: ee)
    monkeypatch.setattr(compat_mod, "installed_ee_base", lambda: ee)
    monkeypatch.setattr(compat_mod, "active_bundle_version", lambda: "0.1.0")

    ok, _detail, _c = active_bundle_platform_compatible("0.1.0")
    assert ok is True
    report = build_compat_report(platform_version="0.1.0")
    assert doctor_should_fail(report) is False


def test_discover_skips_incompatible_active(tmp_path, monkeypatch):
    from app.platform import bundle_install, extension_loader
    from app.platform.compat import active_bundle_platform_compatible

    ee = tmp_path / "extensions" / "installed" / "ee"
    ver = ee / "9.9.9"
    modules = ver / "modules"
    modules.mkdir(parents=True)
    (ver / "manifest.json").write_text(
        json.dumps({"version": "9.9.9", "platform_compat": ">=99.0.0 <100.0.0"}),
        encoding="utf-8",
    )
    (ee / "ACTIVE").write_text("9.9.9\n", encoding="utf-8")
    (tmp_path / "modules").mkdir()

    monkeypatch.setattr(extension_loader, "repo_root", lambda: tmp_path)
    monkeypatch.setattr(bundle_install, "installed_ee_base", lambda: ee)
    monkeypatch.setattr(bundle_install, "repo_root", lambda: tmp_path)
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)

    # Patch compat helpers used inside discover
    monkeypatch.setattr(
        "app.platform.compat.active_bundle_platform_compatible",
        lambda platform_version="0.1.0": active_bundle_platform_compatible("0.1.0"),
    )
    from app.platform import compat as compat_mod

    monkeypatch.setattr(compat_mod, "installed_ee_base", lambda: ee)
    monkeypatch.setattr(compat_mod, "active_bundle_version", lambda: "9.9.9")

    roots = extension_loader.discover_extension_roots()
    assert modules.resolve() not in roots
