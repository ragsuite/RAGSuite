"""Phase 7 — Enterprise bundle install / verify / load."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI

from app.platform.bundle_checksums import verify_checksums
from app.platform.bundle_install import (
    active_bundle_modules_root,
    install_bundle,
    installed_ee_base,
)
from app.platform.extension_loader import load_extensions, loaded_extension_ids
from app.platform.module_bootstrap import repo_root
from app.platform.module_loader import reset_registry
from app.platform.semver_range import satisfies

pytestmark = pytest.mark.ee


def _resolve_ee_root() -> Path | None:
    env_root = (os.environ.get("RAGSUITE_EE_ROOT") or "").strip()
    if env_root:
        candidate = Path(env_root).expanduser().resolve()
        if candidate.is_dir():
            return candidate
    sibling = repo_root().parent / "RAGSUITE_EE"
    if sibling.is_dir():
        return sibling
    return None


def _ensure_bundle_artifact() -> Path:
    ee_root = _resolve_ee_root()
    if ee_root is None:
        pytest.skip("RAGSUITE_EE root not available (set RAGSUITE_EE_ROOT)")
    bundle_tar = ee_root / "dist" / "ragsuite-ee-0.1.0.tar.gz"
    if bundle_tar.is_file():
        return bundle_tar
    if not (ee_root / "tools" / "bundle").is_dir():
        pytest.skip("RAGSUITE_EE bundle tools not present")
    env = os.environ.copy()
    env["SOURCE_DATE_EPOCH"] = "0"
    env["PYTHONPATH"] = str(ee_root)
    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "tools.bundle.build",
            "--version",
            "0.1.0",
            "--out",
            str(ee_root / "dist"),
        ],
        cwd=str(ee_root),
        env=env,
    )
    assert bundle_tar.is_file()
    return bundle_tar


@pytest.fixture(autouse=True)
def _isolate_bundle(monkeypatch):
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)
    # Do not wipe a developer's ACTIVE permanently — use temp install base
    reset_registry()
    yield
    reset_registry()
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)


def test_prune_replaces_previous_ee_dirs(tmp_path, monkeypatch):
    from app.platform.bundle_install import prune_inactive_ee_versions, set_active_version

    base = tmp_path / "installed" / "ee"
    monkeypatch.setattr("app.platform.bundle_install.installed_ee_base", lambda: base)
    monkeypatch.setattr(
        "app.platform.bundle_install.data_ee_marker",
        lambda: tmp_path / "ee-current",
    )
    for ver in ("0.1.0", "0.2.0"):
        (base / ver / "modules").mkdir(parents=True)
        (base / ver / "manifest.json").write_text("{}", encoding="utf-8")
    set_active_version("0.2.0")
    removed = prune_inactive_ee_versions(keep="0.2.0")
    assert removed == ["0.1.0"]
    assert (base / "0.2.0").is_dir()
    assert not (base / "0.1.0").exists()
    assert (base / "ACTIVE").read_text(encoding="utf-8").strip() == "0.2.0"


def test_bundle_verify_ok(tmp_path):
    tar = _ensure_bundle_artifact()
    # extract
    import tarfile

    with tarfile.open(tar, "r:gz") as tf:
        tf.extractall(tmp_path)
    root = next(tmp_path.iterdir())
    ok, errors = verify_checksums(root)
    assert ok, errors


def test_bundle_verify_tamper_fails(tmp_path):
    tar = _ensure_bundle_artifact()
    import tarfile

    with tarfile.open(tar, "r:gz") as tf:
        tf.extractall(tmp_path)
    root = next(p for p in tmp_path.iterdir() if p.is_dir())
    manifest = root / "manifest.json"
    manifest.write_text(manifest.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    ok, errors = verify_checksums(root)
    assert not ok
    assert any("checksum mismatch" in e for e in errors)


def test_install_platform_compat_refuses(tmp_path, monkeypatch):
    tar = _ensure_bundle_artifact()
    monkeypatch.setattr(
        "app.platform.bundle_install.installed_ee_base",
        lambda: tmp_path / "installed" / "ee",
    )
    monkeypatch.setattr(
        "app.platform.bundle_install.data_ee_marker",
        lambda: tmp_path / "ee-current",
    )
    with pytest.raises(RuntimeError, match="platform_compat"):
        install_bundle(
            tar,
            platform_version="99.0.0",
            require_license=False,
            allow_unsigned=True,
        )


def test_install_and_load_without_ee_root(tmp_path, monkeypatch):
    tar = _ensure_bundle_artifact()
    base = tmp_path / "installed" / "ee"
    monkeypatch.setattr("app.platform.bundle_install.installed_ee_base", lambda: base)
    monkeypatch.setattr(
        "app.platform.bundle_install.data_ee_marker",
        lambda: tmp_path / "ee-current",
    )
    monkeypatch.setattr(
        "app.platform.extension_loader.active_bundle_modules_root"
        if False
        else "app.platform.bundle_install.active_bundle_modules_root",
        lambda: (base / "0.1.0" / "modules") if (base / "ACTIVE").is_file() else None,
    )
    # After install, ACTIVE exists — patch active_bundle_modules_root properly
    target = install_bundle(
        tar,
        platform_version="0.1.0",
        require_license=False,
        allow_unsigned=True,
    )
    assert (base / "ACTIVE").read_text().strip() == "0.1.0"
    assert (target / "modules" / "sso").is_dir()

    def _active():
        ver = (base / "ACTIVE").read_text().strip()
        return (base / ver / "modules").resolve()

    monkeypatch.setattr(
        "app.platform.bundle_install.active_bundle_modules_root",
        _active,
    )
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)

    # Phase 10: EE requires a valid offline license with module-id entitlements
    import base64
    import json
    from datetime import datetime, timedelta, timezone

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from app.platform.license_state import reset_license_cache

    key = Ed25519PrivateKey.generate()
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    now = datetime.now(timezone.utc)
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "bundle-test",
        "customer_id": "c1",
        "seats": 10,
        "entitlements": [
            "sso",
            "organization",
            "audit_full",
            "compliance",
            "compare_models",
            "query_tracing",
            "analytics",
            "mobile_beta",
            "voice",
        ],
        "valid_from": (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": (now + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 14,
    }
    payload = json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()
    sig = key.sign(payload)

    def b64(d: bytes) -> str:
        return base64.urlsafe_b64encode(d).rstrip(b"=").decode()

    blob = f"{b64(payload)}.{b64(sig)}"
    lic_path = tmp_path / "offline.key"
    lic_path.write_text(blob + "\n", encoding="utf-8")
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(lic_path))
    monkeypatch.setattr(
        "ragsuite_license_verify.verify.default_public_key_pem",
        lambda: pub_pem,
    )
    reset_license_cache()
    reset_registry()
    app = FastAPI()
    load_extensions(app)
    ids = loaded_extension_ids()
    assert "sso" in ids
    assert "organization" in ids
    assert "documents" in ids


def test_installed_ee_skipped_without_license(tmp_path, monkeypatch):
    """ACTIVE bundle present but no/invalid license → CE only."""
    tar = _ensure_bundle_artifact()
    base = tmp_path / "installed" / "ee"
    monkeypatch.setattr("app.platform.bundle_install.installed_ee_base", lambda: base)
    monkeypatch.setattr(
        "app.platform.bundle_install.data_ee_marker",
        lambda: tmp_path / "ee-current",
    )
    install_bundle(tar, platform_version="0.1.0", require_license=False, allow_unsigned=True)

    def _active():
        ver = (base / "ACTIVE").read_text().strip()
        return (base / ver / "modules").resolve()

    monkeypatch.setattr("app.platform.bundle_install.active_bundle_modules_root", _active)
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    from app.platform.license_state import reset_license_cache

    reset_license_cache()
    reset_registry()
    app = FastAPI()
    load_extensions(app)
    ids = loaded_extension_ids()
    assert "documents" in ids
    assert "sso" not in ids


def test_ce_only_without_active_bundle(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.platform.bundle_install.active_bundle_modules_root",
        lambda: None,
    )
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)
    reset_registry()
    app = FastAPI()
    load_extensions(app)
    ids = loaded_extension_ids()
    assert "documents" in ids
    assert "sso" not in ids
