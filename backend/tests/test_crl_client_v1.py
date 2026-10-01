"""CRL client: ragsuite.crl.v1 signed format, cache memo and failure backoff."""
from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.platform import crl_client


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _v1_response(key: Ed25519PrivateKey, revoked: list[str], *, top_level_revoked=None) -> dict:
    payload = {
        "schema": "ragsuite.crl.v1",
        "kid": "test-kid",
        "issued_at": "2026-10-01T00:00:00Z",
        "expires_at": "2026-10-02T00:00:00Z",
        "revoked": revoked,
    }
    body = _canonical(payload)
    blob = f"{_b64url(body)}.{_b64url(key.sign(body))}"
    response = {**payload, "signature": blob}
    if top_level_revoked is not None:
        response["revoked"] = top_level_revoked
    return response


@pytest.fixture
def signing_key(monkeypatch):
    from app.platform.license_state import ensure_vendor_on_path

    ensure_vendor_on_path()
    key = Ed25519PrivateKey.generate()
    pub_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    monkeypatch.setattr("ragsuite_license_verify.verify.default_public_key_pem", lambda: pub_pem)
    return key


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    cache_path = tmp_path / "crl.json"
    monkeypatch.setenv("RAGSUITE_CRL_CACHE_PATH", str(cache_path))
    crl_client._reset_state_for_tests()
    yield cache_path
    crl_client._reset_state_for_tests()


def test_v1_crl_is_verified_and_cached(signing_key, isolated_cache, monkeypatch):
    calls = []

    def fake_fetch():
        calls.append(1)
        return _v1_response(signing_key, ["lic-bad"])

    monkeypatch.setattr(crl_client, "_fetch_crl_raw", fake_fetch)

    assert crl_client.is_revoked("lic-bad") is True
    assert crl_client.is_revoked("lic-good") is False
    assert crl_client.is_revoked("lic-bad") is True
    assert len(calls) == 1

    cached = json.loads(isolated_cache.read_text(encoding="utf-8"))
    assert cached["revoked_ids"] == ["lic-bad"]
    assert cached["crl_version"] == "2026-10-01T00:00:00Z"
    assert "fetched_at" in cached


def test_v1_revoked_comes_from_signed_payload_only(signing_key, monkeypatch):
    raw = _v1_response(signing_key, ["lic-signed"], top_level_revoked=[])
    monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: raw)

    assert crl_client.is_revoked("lic-signed") is True


def test_v1_tampered_signature_is_rejected(signing_key, isolated_cache, monkeypatch):
    raw = _v1_response(signing_key, ["lic-bad"])
    payload_b64, sig_b64 = raw["signature"].split(".", 1)
    forged = _canonical({**json.loads(base64.urlsafe_b64decode(payload_b64 + "==")), "revoked": []})
    raw["signature"] = f"{_b64url(forged)}.{sig_b64}"
    monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: raw)

    assert crl_client.is_revoked("lic-bad") is False  # soft-fail, nothing trusted
    assert not isolated_cache.exists()


def test_v1_wrong_key_is_rejected(signing_key, isolated_cache, monkeypatch):
    other = Ed25519PrivateKey.generate()
    monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: _v1_response(other, ["lic-bad"]))

    assert crl_client.refresh_crl(force=True) is False
    assert not isolated_cache.exists()


def test_unsigned_v1_response_is_rejected(isolated_cache, monkeypatch):
    raw = {"schema": "ragsuite.crl.v1", "revoked": ["lic-bad"], "signature": None}
    monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: raw)

    assert crl_client.refresh_crl(force=True) is False
    assert not isolated_cache.exists()


def test_failed_fetch_backs_off(monkeypatch):
    calls = []

    def failing_fetch():
        calls.append(1)
        return None

    monkeypatch.setattr(crl_client, "_fetch_crl_raw", failing_fetch)

    for _ in range(5):
        assert crl_client.is_revoked("any") is False
    assert len(calls) == 1


def test_stale_cache_hard_fails_during_backoff(isolated_cache, monkeypatch):
    fetched_at = datetime.now(timezone.utc) - timedelta(days=40)
    isolated_cache.write_text(
        json.dumps({"fetched_at": fetched_at.isoformat(), "revoked_ids": [], "crl_version": "1"}),
        encoding="utf-8",
    )
    calls = []
    monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: calls.append(1))

    for _ in range(3):
        with pytest.raises(RuntimeError, match="stale"):
            crl_client.is_revoked("any")
    assert len(calls) == 1


def test_backoff_expires(monkeypatch, signing_key):
    responses = [None, _v1_response(signing_key, ["lic-bad"])]
    monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: responses.pop(0))
    now = [1000.0]
    monkeypatch.setattr(crl_client.time, "monotonic", lambda: now[0])

    assert crl_client.is_revoked("lic-bad") is False
    now[0] += crl_client._FAILURE_BACKOFF_SECONDS + 1
    assert crl_client.is_revoked("lic-bad") is True


def test_cache_file_change_is_picked_up(isolated_cache):
    def write(ids):
        isolated_cache.write_text(
            json.dumps(
                {"fetched_at": datetime.now(timezone.utc).isoformat(), "revoked_ids": ids, "crl_version": "1"}
            ),
            encoding="utf-8",
        )

    write([])
    assert crl_client.is_revoked("lic-x") is False
    write(["lic-x", "lic-y-longer-to-change-size"])
    assert crl_client.is_revoked("lic-x") is True


def test_legacy_signed_format_still_supported(signing_key, monkeypatch):
    payload = {"revoked_ids": ["lic-legacy"], "crl_version": 7}
    sig = signing_key.sign(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    raw = {"payload": payload, "signature": _b64url(sig)}
    monkeypatch.setattr(crl_client, "_fetch_crl_raw", lambda: raw)

    assert crl_client.is_revoked("lic-legacy") is True
