"""Security hardening test suite — CE-side (no EE modules required).

Covers:
  1. encbundle roundtrip (derive_kek, encrypt/decrypt, install_encbundle smoke)
  2. verify_installed_tree tamper detection
  3. Production build bans unsigned bundle + RAGSUITE_EE_ROOT
  4. Public key pin mismatch raises LicenseVerifyError
  5. Monotonic clock refuses rollback
  6. CRL revoked → entitlement denied; CRL soft-fail on first run

Run with::

    cd backend
    python -m pytest tests/test_security_hardening.py -v
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import tarfile
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _make_license_blob(key: Ed25519PrivateKey, overrides: dict | None = None) -> tuple[str, bytes]:
    """Return (blob, pub_pem)."""
    now = datetime.now(timezone.utc)
    claims = {
        "schema": "ragsuite.license.v1",
        "license_id": "test-lic-001",
        "customer_id": "cust-1",
        "seats": 5,
        "entitlements": ["sso", "analytics:read"],
        "valid_from": (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valid_to": (now + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "grace_days": 7,
    }
    if overrides:
        claims.update(overrides)
    payload = json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()
    sig = key.sign(payload)
    blob = f"{_b64(payload)}.{_b64(sig)}"
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return blob, pub_pem


# ---------------------------------------------------------------------------
# 1. encbundle roundtrip
# ---------------------------------------------------------------------------

class TestEncbundleRoundtrip:
    def test_derive_kek_deterministic(self):
        from app.platform.encbundle import derive_kek

        k1 = derive_kek("mykey.payload.sig", "lic-123", "0.1.0")
        k2 = derive_kek("mykey.payload.sig", "lic-123", "0.1.0")
        assert k1 == k2
        assert len(k1) == 32

    def test_derive_kek_differs_on_version(self):
        from app.platform.encbundle import derive_kek

        k1 = derive_kek("key", "lic-123", "0.1.0")
        k2 = derive_kek("key", "lic-123", "0.2.0")
        assert k1 != k2

    def test_derive_kek_differs_on_license_id(self):
        from app.platform.encbundle import derive_kek

        k1 = derive_kek("key", "lic-A", "0.1.0")
        k2 = derive_kek("key", "lic-B", "0.1.0")
        assert k1 != k2

    def test_encrypt_decrypt_roundtrip(self, tmp_path):
        """Low-level: encrypt with AESGCM, then decrypt_encbundle should recover plaintext."""
        from app.platform.encbundle import decrypt_encbundle

        plaintext = b"Hello, encrypted EE bundle!\x00" * 100
        kek = os.urandom(32)
        nonce = os.urandom(12)
        ciphertext_tag = AESGCM(kek).encrypt(nonce, plaintext, None)

        enc_file = tmp_path / "bundle.encbundle"
        enc_file.write_bytes(nonce + ciphertext_tag)

        out_file = tmp_path / "bundle.tar.gz"
        decrypt_encbundle(enc_file, kek, out_file)

        assert out_file.read_bytes() == plaintext

    def test_decrypt_wrong_key_raises(self, tmp_path):
        from app.platform.encbundle import decrypt_encbundle

        plaintext = b"secret data"
        kek = os.urandom(32)
        nonce = os.urandom(12)
        ciphertext_tag = AESGCM(kek).encrypt(nonce, plaintext, None)

        enc_file = tmp_path / "bundle.encbundle"
        enc_file.write_bytes(nonce + ciphertext_tag)

        wrong_kek = os.urandom(32)
        out_file = tmp_path / "out.tar.gz"
        with pytest.raises(ValueError, match="decryption"):
            decrypt_encbundle(enc_file, wrong_kek, out_file)

    def test_install_encbundle_manifest_sig_required(self, tmp_path, monkeypatch):
        """install_encbundle must reject a manifest with bad signature."""
        from app.platform.encbundle import install_encbundle

        enc_file = tmp_path / "bundle.encbundle"
        enc_file.write_bytes(b"\x00" * 50)  # dummy

        # Manifest with tampered payload
        manifest = {
            "payload": {
                "license_id": "lic-1",
                "version": "0.1.0",
            },
            "signature": _b64(b"\xff" * 64),  # invalid
        }
        manifest_path = tmp_path / "bundle.enc.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        # Patch key to a test key that won't match the signature
        test_key = Ed25519PrivateKey.generate()
        pub_pem = test_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        monkeypatch.setattr(
            "ragsuite_license_verify.verify.default_public_key_pem",
            lambda: pub_pem,
        )
        from app.platform.license_state import ensure_vendor_on_path
        ensure_vendor_on_path()

        with pytest.raises(ValueError, match="signature"):
            install_encbundle(enc_file, "offline.blob", manifest_path=manifest_path)


# ---------------------------------------------------------------------------
# 2. verify_installed_tree tamper detection
# ---------------------------------------------------------------------------

class TestVerifyInstalledTree:
    def _make_bundle(self, tmp_path: Path) -> Path:
        """Create a minimal valid bundle dir with CHECKSUMS.sha256."""
        bundle_dir = tmp_path / "bundle"
        bundle_dir.mkdir()
        (bundle_dir / "manifest.json").write_text(
            '{"version":"0.1.0","platform_compat":">=0.1.0"}',
            encoding="utf-8",
        )
        modules_dir = bundle_dir / "modules" / "sso"
        modules_dir.mkdir(parents=True)
        (modules_dir / "__init__.py").write_text("", encoding="utf-8")
        return bundle_dir

    def _write_checksums(self, bundle_dir: Path) -> None:
        from app.platform.bundle_checksums import iter_payload_files, sha256_file

        lines = []
        for p in iter_payload_files(bundle_dir):
            rel = p.relative_to(bundle_dir).as_posix()
            lines.append(f"{sha256_file(p)}  {rel}")
        (bundle_dir / "CHECKSUMS.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")

    def test_clean_tree_passes(self, tmp_path):
        from app.platform.bundle_integrity import verify_installed_tree

        bundle_dir = self._make_bundle(tmp_path)
        self._write_checksums(bundle_dir)
        verify_installed_tree(bundle_dir)  # no exception

    def test_missing_checksums_raises(self, tmp_path):
        from app.platform.bundle_integrity import verify_installed_tree

        bundle_dir = self._make_bundle(tmp_path)
        with pytest.raises(RuntimeError, match="CHECKSUMS.sha256 missing"):
            verify_installed_tree(bundle_dir)

    def test_tampered_file_raises(self, tmp_path):
        from app.platform.bundle_integrity import verify_installed_tree

        bundle_dir = self._make_bundle(tmp_path)
        self._write_checksums(bundle_dir)
        # Tamper after checksum generation
        (bundle_dir / "manifest.json").write_text(
            '{"version":"0.2.0","platform_compat":">=0.1.0"}',
            encoding="utf-8",
        )
        with pytest.raises(RuntimeError, match="checksum mismatch"):
            verify_installed_tree(bundle_dir)

    def test_added_file_raises(self, tmp_path):
        from app.platform.bundle_integrity import verify_installed_tree

        bundle_dir = self._make_bundle(tmp_path)
        self._write_checksums(bundle_dir)
        # Add a new file not in CHECKSUMS
        (bundle_dir / "modules" / "sso" / "injected.py").write_text(
            "malicious()", encoding="utf-8"
        )
        with pytest.raises(RuntimeError, match="unexpected file"):
            verify_installed_tree(bundle_dir)

    def test_deleted_file_raises(self, tmp_path):
        from app.platform.bundle_integrity import verify_installed_tree

        bundle_dir = self._make_bundle(tmp_path)
        self._write_checksums(bundle_dir)
        (bundle_dir / "modules" / "sso" / "__init__.py").unlink()
        with pytest.raises(RuntimeError, match="missing file"):
            verify_installed_tree(bundle_dir)


# ---------------------------------------------------------------------------
# 3. Production build enforcement
# ---------------------------------------------------------------------------

class TestProductionBuild:
    def test_is_production_build_off_by_default(self, monkeypatch):
        from app.platform.ee_guard import is_production_build

        monkeypatch.delenv("RAGSUITE_PRODUCTION_BUILD", raising=False)
        assert is_production_build() is False

    def test_is_production_build_via_env(self, monkeypatch):
        from app.platform.ee_guard import is_production_build

        monkeypatch.setenv("RAGSUITE_PRODUCTION_BUILD", "1")
        assert is_production_build() is True

    def test_allow_unsigned_blocked_in_production(self, monkeypatch):
        from app.platform.ee_guard import allow_unsigned_bundle

        monkeypatch.setenv("RAGSUITE_PRODUCTION_BUILD", "1")
        monkeypatch.setenv("RAGSUITE_ALLOW_UNSIGNED_BUNDLE", "1")
        # env override must be ignored in production
        assert allow_unsigned_bundle() is False

    def test_allow_unsigned_works_in_dev(self, monkeypatch):
        from app.platform.ee_guard import allow_unsigned_bundle

        monkeypatch.delenv("RAGSUITE_PRODUCTION_BUILD", raising=False)
        monkeypatch.setenv("RAGSUITE_ALLOW_UNSIGNED_BUNDLE", "1")
        assert allow_unsigned_bundle() is True

    def test_ee_root_raises_in_production(self, tmp_path, monkeypatch):
        """discover_extension_roots() must raise when EE_ROOT set + production build."""
        ee = tmp_path / "RAGSUITE_EE"
        (ee / "modules").mkdir(parents=True)
        monkeypatch.setenv("RAGSUITE_EE_ROOT", str(ee))
        monkeypatch.setenv("RAGSUITE_PRODUCTION_BUILD", "1")

        from app.platform.extension_loader import discover_extension_roots

        with pytest.raises(RuntimeError, match="production"):
            discover_extension_roots()


# ---------------------------------------------------------------------------
# 4. Public key pin mismatch
# ---------------------------------------------------------------------------

class TestPublicKeyPin:
    def test_correct_pem_passes(self, tmp_path, monkeypatch):
        """A PEM whose sha256 is in PUBLIC_KEY_PINS must verify cleanly."""
        from ragsuite_license_verify.verify import (  # type: ignore
            PUBLIC_KEY_PINS,
            _verify_pem_pin,
            default_public_key_pem,
        )
        from app.platform.license_state import ensure_vendor_on_path

        ensure_vendor_on_path()
        pem = default_public_key_pem()
        # Should not raise
        _verify_pem_pin(pem)
        digest = hashlib.sha256(pem).hexdigest()
        assert digest in PUBLIC_KEY_PINS

    def test_swapped_pem_raises(self):
        from ragsuite_license_verify.verify import (  # type: ignore
            LicenseVerifyError,
            _verify_pem_pin,
        )
        from app.platform.license_state import ensure_vendor_on_path

        ensure_vendor_on_path()
        # Generate a fresh key — its pem won't be in the pin set
        attacker_key = Ed25519PrivateKey.generate()
        attacker_pem = attacker_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        with pytest.raises(LicenseVerifyError, match="pin mismatch"):
            _verify_pem_pin(attacker_pem)

    def test_skip_pin_dev_only(self, monkeypatch):
        from ragsuite_license_verify.verify import (  # type: ignore
            LicenseVerifyError,
            _verify_pem_pin,
        )
        from app.platform.license_state import ensure_vendor_on_path

        ensure_vendor_on_path()
        attacker_key = Ed25519PrivateKey.generate()
        attacker_pem = attacker_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        monkeypatch.setenv("RAGSUITE_SKIP_PUBLIC_KEY_PIN", "1")
        monkeypatch.delenv("RAGSUITE_PRODUCTION_BUILD", raising=False)
        _verify_pem_pin(attacker_pem)  # allowed in non-production

        monkeypatch.setenv("RAGSUITE_PRODUCTION_BUILD", "1")
        with pytest.raises(LicenseVerifyError, match="pin mismatch"):
            _verify_pem_pin(attacker_pem)

    def test_verify_license_fails_with_wrong_key_signature(self, tmp_path, monkeypatch):
        """verify_license must reject a blob signed with a different private key."""
        from ragsuite_license_verify.verify import (  # type: ignore
            LicenseVerifyError,
            verify_license,
        )
        from app.platform.license_state import ensure_vendor_on_path

        ensure_vendor_on_path()
        # Blob signed by attacker key, but verified against vendor pub key
        attacker_key = Ed25519PrivateKey.generate()
        attacker_blob, _ = _make_license_blob(attacker_key)

        # Vendor public key (real one from disk) — signature won't match
        from ragsuite_license_verify.verify import default_public_key_pem  # type: ignore

        # Bypass pin for this test (we're testing sig verification, not pinning)
        monkeypatch.setattr(
            "ragsuite_license_verify.verify._verify_pem_pin",
            lambda _: None,
        )
        vendor_pem = default_public_key_pem()

        with pytest.raises(LicenseVerifyError, match="[Ss]ignature"):
            verify_license(attacker_blob, public_key_pem=vendor_pem)

    def test_kid_extracted_from_claims(self, monkeypatch):
        """kid field must be present on LicenseClaims when set in raw claims."""
        from ragsuite_license_verify.verify import verify_license  # type: ignore
        from app.platform.license_state import ensure_vendor_on_path

        ensure_vendor_on_path()

        key = Ed25519PrivateKey.generate()
        pub_pem = key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        blob, _ = _make_license_blob(key, overrides={"kid": "key-2025-07"})
        # Bypass pin check by using public_key_pem directly
        claims = verify_license(blob, public_key_pem=pub_pem)
        assert claims.kid == "key-2025-07"

    def test_kid_none_when_absent(self, monkeypatch):
        from ragsuite_license_verify.verify import verify_license  # type: ignore
        from app.platform.license_state import ensure_vendor_on_path

        ensure_vendor_on_path()
        key = Ed25519PrivateKey.generate()
        pub_pem = key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        blob, _ = _make_license_blob(key)
        claims = verify_license(blob, public_key_pem=pub_pem)
        assert claims.kid is None


# ---------------------------------------------------------------------------
# 5. Monotonic clock rollback detection
# ---------------------------------------------------------------------------

class TestMonotonicClock:
    def test_first_run_no_data_passes(self, tmp_path, monkeypatch):
        from app.platform import license_monotonic as lm

        monkeypatch.setattr(lm, "_monotonic_path", lambda: tmp_path / "monotonic.json")
        lm.assert_clock_sane()  # no exception — no stored max

    def test_record_and_sane_check_passes(self, tmp_path, monkeypatch):
        from app.platform import license_monotonic as lm

        monkeypatch.setattr(lm, "_monotonic_path", lambda: tmp_path / "monotonic.json")
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        lm.record_server_time(past.isoformat())
        lm.assert_clock_sane()  # now > past - 24h → OK

    def test_future_server_time_far_enough_away_is_fine(self, tmp_path, monkeypatch):
        from app.platform import license_monotonic as lm

        monkeypatch.setattr(lm, "_monotonic_path", lambda: tmp_path / "monotonic.json")
        # Store a time only 1h in the future — within tolerance
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        lm.record_server_time(future.isoformat())
        lm.assert_clock_sane()  # now within 24h of stored → OK

    def test_rolled_back_clock_raises(self, tmp_path, monkeypatch):
        from app.platform import license_monotonic as lm

        monkeypatch.setattr(lm, "_monotonic_path", lambda: tmp_path / "monotonic.json")
        # Store a time 48h in the future (simulates clock rolled back 48h)
        future = datetime.now(timezone.utc) + timedelta(hours=48)
        lm.record_server_time(future.isoformat())
        with pytest.raises(RuntimeError, match="rolled back"):
            lm.assert_clock_sane()

    def test_record_does_not_go_backward(self, tmp_path, monkeypatch):
        from app.platform import license_monotonic as lm

        monkeypatch.setattr(lm, "_monotonic_path", lambda: tmp_path / "monotonic.json")
        now = datetime.now(timezone.utc)
        later = now + timedelta(hours=5)
        earlier = now - timedelta(hours=2)

        lm.record_server_time(later.isoformat())
        stored_after_first = lm._load_max_server_time()

        lm.record_server_time(earlier.isoformat())  # older — should not update
        stored_after_second = lm._load_max_server_time()

        assert stored_after_first == stored_after_second  # unchanged


# ---------------------------------------------------------------------------
# 6. CRL revocation checks
# ---------------------------------------------------------------------------

class TestCrlRevocation:
    def _mock_cache(self, tmp_path: Path, revoked_ids: list[str], age_days: int = 0) -> Path:
        """Write a CRL cache file and return its path."""
        cache_path = tmp_path / "crl.json"
        fetched_at = datetime.now(timezone.utc) - timedelta(days=age_days)
        cache_path.write_text(
            json.dumps(
                {
                    "fetched_at": fetched_at.isoformat(),
                    "revoked_ids": revoked_ids,
                    "crl_version": "1",
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return cache_path

    def test_not_revoked(self, tmp_path, monkeypatch):
        from app.platform import crl_client

        cache_path = self._mock_cache(tmp_path, revoked_ids=[])
        monkeypatch.setenv("RAGSUITE_CRL_CACHE_PATH", str(cache_path))
        assert crl_client.is_revoked("lic-001") is False

    def test_revoked_id_denied(self, tmp_path, monkeypatch):
        from app.platform import crl_client

        cache_path = self._mock_cache(tmp_path, revoked_ids=["lic-revoked-001"])
        monkeypatch.setenv("RAGSUITE_CRL_CACHE_PATH", str(cache_path))
        assert crl_client.is_revoked("lic-revoked-001") is True

    def test_stale_cache_hard_fail(self, tmp_path, monkeypatch):
        """A cache older than CRL_MAX_AGE_DAYS with no network → hard fail."""
        from app.platform import crl_client

        cache_path = self._mock_cache(
            tmp_path,
            revoked_ids=[],
            age_days=35,  # > default 30-day max
        )
        monkeypatch.setenv("RAGSUITE_CRL_CACHE_PATH", str(cache_path))
        # Prevent real HTTP call
        monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: None)

        with pytest.raises(RuntimeError, match="stale"):
            crl_client.is_revoked("any-id")

    def test_no_cache_no_network_soft_fail(self, tmp_path, monkeypatch):
        """No cache + no network → soft-fail (allow, return False)."""
        from app.platform import crl_client

        monkeypatch.setenv(
            "RAGSUITE_CRL_CACHE_PATH", str(tmp_path / "nonexistent_crl.json")
        )
        monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: None)
        # Should not raise — soft-fail
        result = crl_client.is_revoked("any-id")
        assert result is False

    def _setup_valid_license(self, tmp_path, monkeypatch):
        """Helper: set up a valid in-memory license with bypassed pin check."""
        from app.platform.license_state import ensure_vendor_on_path, reset_license_cache

        key = Ed25519PrivateKey.generate()
        blob, pub_pem = _make_license_blob(key)
        lic_path = tmp_path / "offline.key"
        lic_path.write_text(blob + "\n", encoding="utf-8")
        monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(lic_path))
        monkeypatch.setattr(
            "ragsuite_license_verify.verify.default_public_key_pem",
            lambda: pub_pem,
        )
        ensure_vendor_on_path()
        monkeypatch.setattr("ragsuite_license_verify.verify._verify_pem_pin", lambda _: None)
        reset_license_cache()

    @pytest.mark.asyncio
    async def test_entitlement_dep_denies_revoked(self, tmp_path, monkeypatch):
        """requires_entitlement should raise HTTP 403 when CRL says license is revoked."""
        from fastapi import HTTPException

        from app.platform import crl_client
        from app.platform.entitlement_deps import _make_check

        self._setup_valid_license(tmp_path, monkeypatch)

        # CRL says license test-lic-001 is revoked
        cache_path = self._mock_cache(tmp_path, revoked_ids=["test-lic-001"])
        monkeypatch.setenv("RAGSUITE_CRL_CACHE_PATH", str(cache_path))

        check_fn = _make_check("analytics:read")
        with pytest.raises(HTTPException) as exc_info:
            await check_fn()
        assert exc_info.value.status_code == 403
        assert "revoked" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_entitlement_dep_denies_missing_feature(self, tmp_path, monkeypatch):
        """requires_entitlement raises 403 when license lacks the requested feature."""
        from fastapi import HTTPException

        from app.platform import crl_client
        from app.platform.entitlement_deps import _make_check

        self._setup_valid_license(tmp_path, monkeypatch)

        # No CRL (soft-fail)
        monkeypatch.setenv("RAGSUITE_CRL_CACHE_PATH", str(tmp_path / "no_crl.json"))
        monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: None)

        check_fn = _make_check("compliance:enforce")  # not in entitlements
        with pytest.raises(HTTPException) as exc_info:
            await check_fn()
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_entitlement_dep_passes_with_valid_feature(self, tmp_path, monkeypatch):
        """requires_entitlement must not raise when license has the feature."""
        from app.platform import crl_client
        from app.platform.entitlement_deps import _make_check

        self._setup_valid_license(tmp_path, monkeypatch)

        monkeypatch.setenv("RAGSUITE_CRL_CACHE_PATH", str(tmp_path / "no_crl.json"))
        monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: None)

        check_fn = _make_check("analytics:read")  # in entitlements
        await check_fn()  # should not raise
