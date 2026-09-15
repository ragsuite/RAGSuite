"""Phase 10 — offline license entitlements gate (catalog source of truth)."""
from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.platform.entitlement_deps import has_feature_entitlement
from app.platform.ee_guard import KNOWN_ENTERPRISE_MODULE_IDS
from app.platform.license_state import (
    effective_entitlements,
    entitlements_allow_manifest,
    reset_license_cache,
)
from app.platform.license_store import write_license_blob
from app.platform.module_loader import entitlements_allow, reset_registry
from app.platform.module_types import ModuleManifest, ModuleSurfaces


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _sign_claims(claims: dict, private_key: Ed25519PrivateKey) -> str:
    payload = json.dumps(claims, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = private_key.sign(payload)
    return f"{_b64url(payload)}.{_b64url(sig)}"


@pytest.fixture()
def license_keypair(tmp_path, monkeypatch):
    key = Ed25519PrivateKey.generate()
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    priv = key
    key_path = tmp_path / "offline.key"
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(key_path))
    reset_license_cache()
    reset_registry()
    yield priv, pub_pem, key_path
    reset_license_cache()
    reset_registry()


def _window(days_ago: int = 1, days_ahead: int = 30):
    now = datetime.now(timezone.utc)
    return now - timedelta(days=days_ago), now + timedelta(days=days_ahead)


def _patch_valid_claims(monkeypatch, blob: str, pub_pem: bytes):
    import app.platform.license_state as ls

    reset_license_cache()

    def _verify(_blob=None, **kwargs):
        from ragsuite_license_verify import verify_license

        return verify_license(blob, public_key_pem=pub_pem, **kwargs)

    monkeypatch.setattr(ls, "get_claims", lambda force=False: _verify(blob))
    monkeypatch.setattr(
        "ragsuite_license_verify.verify.default_public_key_pem",
        lambda: pub_pem,
    )


def _ee_manifest(module_id: str, permission: str | None = None) -> ModuleManifest:
    perms = [permission] if permission else [f"{module_id}:use"]
    return ModuleManifest(
        id=module_id,
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=perms,
    )


def test_ce_module_allowed_without_license(monkeypatch, tmp_path):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    reset_license_cache()
    man = ModuleManifest(
        id="documents",
        version="0.1.0",
        edition="community",
        status="migrated",
        surfaces=ModuleSurfaces(),
    )
    assert entitlements_allow(man) is True


def test_ee_denied_without_license(monkeypatch, tmp_path):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    reset_license_cache()
    assert entitlements_allow(_ee_manifest("sso")) is False


def test_effective_entitlements_is_catalog_only():
    claims = SimpleNamespace(entitlements=["sso", "legacy_only_module"])
    eff = effective_entitlements(claims)
    assert set(eff) == set(KNOWN_ENTERPRISE_MODULE_IDS)
    assert "legacy_only_module" not in eff
    assert "white_label" in eff
    assert effective_entitlements(None) == []


def test_ee_catalog_unlocks_modules_not_in_signed_list(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    vf, vt = _window()
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "lic-1",
        "customer_id": "cust-1",
        "seats": 5,
        "entitlements": ["sso", "organization"],
        "valid_from": vf.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": vt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 14,
    }
    blob = _sign_claims(claims, priv)
    write_license_blob(blob)
    _patch_valid_claims(monkeypatch, blob, pub_pem)

    assert entitlements_allow_manifest(_ee_manifest("sso")) is True
    assert entitlements_allow_manifest(
        _ee_manifest("analytics", "analytics:read")
    ) is True
    assert entitlements_allow_manifest(
        _ee_manifest("white_label", "white_label:use")
    ) is True
    assert entitlements_allow_manifest(_ee_manifest("voice", "voice:use")) is True
    assert has_feature_entitlement("white_label:use") is True
    assert has_feature_entitlement("voice:use") is True
    assert has_feature_entitlement("not_a_real_module:use") is False


def test_catalog_add_unlocks_new_module_id(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    vf, vt = _window()
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "lic-add",
        "customer_id": "cust-1",
        "seats": 1,
        "entitlements": ["sso"],
        "valid_from": vf.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": vt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 7,
    }
    blob = _sign_claims(claims, priv)
    write_license_blob(blob)
    _patch_valid_claims(monkeypatch, blob, pub_pem)

    new_id = "future_ee_module"
    assert entitlements_allow_manifest(_ee_manifest(new_id)) is False

    expanded = frozenset(set(KNOWN_ENTERPRISE_MODULE_IDS) | {new_id})
    monkeypatch.setattr(
        "app.platform.ee_guard.KNOWN_ENTERPRISE_MODULE_IDS",
        expanded,
    )
    assert entitlements_allow_manifest(_ee_manifest(new_id)) is True
    assert has_feature_entitlement(f"{new_id}:use") is True


def test_catalog_remove_denies_even_if_signed_list_has_id(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    vf, vt = _window()
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "lic-rm",
        "customer_id": "cust-1",
        "seats": 1,
        "entitlements": ["sso", "voice", "white_label"],
        "valid_from": vf.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": vt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 7,
    }
    blob = _sign_claims(claims, priv)
    write_license_blob(blob)
    _patch_valid_claims(monkeypatch, blob, pub_pem)

    assert entitlements_allow_manifest(_ee_manifest("voice", "voice:use")) is True

    reduced = frozenset(set(KNOWN_ENTERPRISE_MODULE_IDS) - {"voice"})
    monkeypatch.setattr(
        "app.platform.ee_guard.KNOWN_ENTERPRISE_MODULE_IDS",
        reduced,
    )
    assert entitlements_allow_manifest(_ee_manifest("voice", "voice:use")) is False
    assert has_feature_entitlement("voice:use") is False
    # Other catalog modules still allowed
    assert entitlements_allow_manifest(
        _ee_manifest("white_label", "white_label:use")
    ) is True


def test_catalog_rename_old_deny_new_allow(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    vf, vt = _window()
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "lic-rename",
        "customer_id": "cust-1",
        "seats": 1,
        "entitlements": ["voice"],
        "valid_from": vf.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": vt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 7,
    }
    blob = _sign_claims(claims, priv)
    write_license_blob(blob)
    _patch_valid_claims(monkeypatch, blob, pub_pem)

    renamed = frozenset((set(KNOWN_ENTERPRISE_MODULE_IDS) - {"voice"}) | {"voice_v2"})
    monkeypatch.setattr(
        "app.platform.ee_guard.KNOWN_ENTERPRISE_MODULE_IDS",
        renamed,
    )
    assert entitlements_allow_manifest(_ee_manifest("voice", "voice:use")) is False
    assert entitlements_allow_manifest(_ee_manifest("voice_v2", "voice_v2:use")) is True


def test_unknown_id_not_in_catalog_denied(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    vf, vt = _window()
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "lic-unk",
        "customer_id": "cust-1",
        "seats": 1,
        "entitlements": ["evil_custom"],
        "valid_from": vf.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": vt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 7,
    }
    blob = _sign_claims(claims, priv)
    write_license_blob(blob)
    _patch_valid_claims(monkeypatch, blob, pub_pem)

    assert entitlements_allow_manifest(_ee_manifest("evil_custom")) is False
    assert has_feature_entitlement("evil_custom:use") is False


def test_has_feature_entitlement_denied_without_license(monkeypatch, tmp_path):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    reset_license_cache()
    assert has_feature_entitlement("white_label:use") is False


def test_ee_denied_when_expired_past_grace(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    now = datetime.now(timezone.utc)
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "lic-exp",
        "customer_id": "cust-1",
        "seats": 1,
        "entitlements": ["sso"],
        "valid_from": (now - timedelta(days=400)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 7,
    }
    blob = _sign_claims(claims, priv)
    write_license_blob(blob)

    import app.platform.license_state as ls

    reset_license_cache()

    def _get_claims(force=False):
        from ragsuite_license_verify import LicenseExpiredError, verify_license

        try:
            return verify_license(blob, public_key_pem=pub_pem, require_valid_window=True)
        except LicenseExpiredError:
            return None

    monkeypatch.setattr(ls, "get_claims", _get_claims)

    assert entitlements_allow_manifest(_ee_manifest("sso")) is False
    assert has_feature_entitlement("sso:use") is False
    assert has_feature_entitlement("white_label:use") is False

    ce = ModuleManifest(
        id="chat",
        version="0.1.0",
        edition="community",
        status="partial",
        surfaces=ModuleSurfaces(),
    )
    assert entitlements_allow_manifest(ce) is True
