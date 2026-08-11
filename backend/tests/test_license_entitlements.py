"""Phase 10 — offline license entitlements gate."""
from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.platform.license_state import (
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
    man = ModuleManifest(
        id="sso",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["sso:use"],
    )
    assert entitlements_allow(man) is False


def test_ee_allowed_with_module_id_claim(license_keypair, monkeypatch):
    priv, pub_pem, key_path = license_keypair
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
    monkeypatch.setattr(
        "ragsuite_license_verify.verify.default_public_key_pem",
        lambda: pub_pem,
    )
    # Also patch via license_state import path
    import app.platform.license_state as ls

    reset_license_cache()

    def _verify(blob, **kwargs):
        from ragsuite_license_verify import verify_license

        return verify_license(blob, public_key_pem=pub_pem, **kwargs)

    monkeypatch.setattr(ls, "get_claims", lambda force=False: _verify(blob))

    man = ModuleManifest(
        id="sso",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["sso:use", "sso:admin"],
    )
    assert entitlements_allow_manifest(man) is True

    man2 = ModuleManifest(
        id="analytics",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["analytics:read"],
    )
    assert entitlements_allow_manifest(man2) is False


def test_ee_denied_when_expired_past_grace(license_keypair, monkeypatch):
    priv, pub_pem, key_path = license_keypair
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

    man = ModuleManifest(
        id="sso",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["sso:use"],
    )
    assert entitlements_allow_manifest(man) is False

    ce = ModuleManifest(
        id="chat",
        version="0.1.0",
        edition="community",
        status="partial",
        surfaces=ModuleSurfaces(),
    )
    assert entitlements_allow_manifest(ce) is True
