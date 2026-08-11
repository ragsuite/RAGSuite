"""Phase 14 — tampered / bad-signature offline license rejected."""
from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.platform.license_state import (
    entitlements_allow_manifest,
    license_status,
    reset_license_cache,
)
from app.platform.license_store import write_license_blob
from app.platform.module_loader import reset_registry
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
    key_path = tmp_path / "offline.key"
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(key_path))
    reset_license_cache()
    reset_registry()
    yield key, pub_pem, key_path
    reset_license_cache()
    reset_registry()


def _valid_claims():
    now = datetime.now(timezone.utc)
    return {
        "schema": "ragsuite.license.v1",
        "license_id": "lic-tamper",
        "customer_id": "cust-1",
        "seats": 1,
        "entitlements": ["sso"],
        "valid_from": (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": (now + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 14,
    }


def _patch_verify_pubkey(monkeypatch, pub_pem: bytes):
    import app.platform.license_state as ls

    verify_license, _Claims, LicenseExpiredError, LicenseVerifyError = ls._import_verify()

    def _wrapped(blob, **kwargs):
        kwargs.setdefault("public_key_pem", pub_pem)
        return verify_license(blob, **kwargs)

    # Patch the verify used inside license_status / get_claims via _import_verify return
    monkeypatch.setattr(
        ls,
        "_import_verify",
        lambda: (_wrapped, _Claims, LicenseExpiredError, LicenseVerifyError),
    )


def _ee_manifest() -> ModuleManifest:
    return ModuleManifest(
        id="sso",
        version="0.1.0",
        edition="enterprise",
        status="migrated",
        surfaces=ModuleSurfaces(),
        permissions=["sso:use"],
    )


def test_tampered_signature_rejected(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    blob = _sign_claims(_valid_claims(), priv)
    payload, sig = blob.rsplit(".", 1)
    # Deterministically corrupt signature (flip first base64url char)
    first = sig[0]
    flipped_first = "B" if first != "B" else "C"
    write_license_blob(f"{payload}.{flipped_first}{sig[1:]}")
    _patch_verify_pubkey(monkeypatch, pub_pem)
    reset_license_cache()

    st = license_status(force=True)
    assert st.state == "invalid"
    assert entitlements_allow_manifest(_ee_manifest()) is False


def test_garbage_blob_rejected(license_keypair, monkeypatch):
    _priv, pub_pem, _key_path = license_keypair
    write_license_blob("not-a-valid-license-blob")
    _patch_verify_pubkey(monkeypatch, pub_pem)
    reset_license_cache()

    st = license_status(force=True)
    assert st.state == "invalid"
    assert entitlements_allow_manifest(_ee_manifest()) is False


def test_wrong_signer_rejected(license_keypair, monkeypatch):
    _priv, pub_pem, _key_path = license_keypair
    other = Ed25519PrivateKey.generate()
    blob = _sign_claims(_valid_claims(), other)
    write_license_blob(blob)
    _patch_verify_pubkey(monkeypatch, pub_pem)
    reset_license_cache()

    st = license_status(force=True)
    assert st.state == "invalid"
    assert entitlements_allow_manifest(_ee_manifest()) is False


def test_unsupported_schema_rejected(license_keypair, monkeypatch):
    priv, pub_pem, _key_path = license_keypair
    claims = _valid_claims()
    claims["schema"] = "ragsuite.license.v999"
    write_license_blob(_sign_claims(claims, priv))
    _patch_verify_pubkey(monkeypatch, pub_pem)
    reset_license_cache()

    st = license_status(force=True)
    assert st.state == "invalid"
    assert "schema" in (st.detail or "").lower()
    assert entitlements_allow_manifest(_ee_manifest()) is False
