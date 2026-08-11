"""Portable offline license verify (public key only — for CE Phase 10)."""
from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional, Sequence, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class LicenseVerifyError(Exception):
    """Invalid signature or malformed license blob."""


class LicenseExpiredError(LicenseVerifyError):
    """License past validity + grace."""


# ---------------------------------------------------------------------------
# H11: Public key pinning
# ---------------------------------------------------------------------------
# SHA-256 digest(s) of the authoritative vendor public.pem bytes.
# Add additional pins here when rotating the key (keep both old + new during
# transition); remove the old pin after all customers have re-activated.
# Compute with: python3 -c "import hashlib,pathlib; print(hashlib.sha256(pathlib.Path('public.pem').read_bytes()).hexdigest())"
PUBLIC_KEY_PINS: Tuple[str, ...] = (
    "5f843ad2b21f1faef18c3d413732d6617f1895805f216e8b33a75bd347e7b48f",
)


def _verify_pem_pin(pem: bytes) -> None:
    """Raise LicenseVerifyError if pem's SHA-256 is not in PUBLIC_KEY_PINS."""
    import os

    # Dev/smoke only — never honor in production builds (npm / PRODUCTION_BUILD=1).
    if (
        os.environ.get("RAGSUITE_SKIP_PUBLIC_KEY_PIN") == "1"
        and os.environ.get("RAGSUITE_PRODUCTION_BUILD") != "1"
    ):
        return
    digest = hashlib.sha256(pem).hexdigest()
    if digest not in PUBLIC_KEY_PINS:
        raise LicenseVerifyError(
            f"Public key pin mismatch (sha256={digest!r}). "
            "The vendor public key has been replaced or is corrupt. "
            "Re-install from the official vendor distribution or contact support."
        )


# ---------------------------------------------------------------------------
# Claims dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LicenseClaims:
    schema: str
    license_id: str
    customer_id: str
    seats: int
    entitlements: List[str]
    valid_from: datetime
    valid_to: datetime
    grace_days: int
    raw: dict[str, Any]
    # H1: optional key-id from claims header — None when absent (backward-compatible)
    kid: Optional[str] = None

    def is_within_grace(self, now: Optional[datetime] = None) -> bool:
        now = now or datetime.now(timezone.utc)
        if now <= self.valid_to:
            return True
        from datetime import timedelta

        return now <= self.valid_to + timedelta(days=self.grace_days)

    def is_valid_now(self, now: Optional[datetime] = None) -> bool:
        return self.is_within_grace(now)


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _parse_dt(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def default_public_key_pem() -> bytes:
    """Load and pin-verify the packaged vendor public key (private key never ships in CE)."""
    keys_dir = Path(__file__).resolve().parent / "keys" / "public.pem"
    if keys_dir.is_file():
        pem = keys_dir.read_bytes()
        _verify_pem_pin(pem)  # H11: raises LicenseVerifyError if key was swapped
        return pem
    raise FileNotFoundError("sdk keys/public.pem missing — sync from License Server keygen")


def verify_license(
    blob: str,
    *,
    public_key_pem: bytes | None = None,
    now: datetime | None = None,
    require_valid_window: bool = True,
) -> LicenseClaims:
    """Verify Ed25519-signed offline license. No network I/O."""
    pem = public_key_pem if public_key_pem is not None else default_public_key_pem()
    if "." not in blob:
        raise LicenseVerifyError("Invalid offline key format")
    payload_b64, sig_b64 = blob.split(".", 1)
    try:
        payload = _b64url_decode(payload_b64)
        sig = _b64url_decode(sig_b64)
    except Exception as exc:  # noqa: BLE001
        raise LicenseVerifyError("Invalid base64url encoding") from exc

    pub = serialization.load_pem_public_key(pem)
    if not isinstance(pub, Ed25519PublicKey):
        raise LicenseVerifyError("Public key must be Ed25519")
    try:
        pub.verify(sig, payload)
    except Exception as exc:  # noqa: BLE001
        raise LicenseVerifyError("Signature verification failed") from exc

    try:
        raw = json.loads(payload.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise LicenseVerifyError("Invalid claims JSON") from exc
    if not isinstance(raw, dict):
        raise LicenseVerifyError("Claims must be an object")

    try:
        # H1: extract optional kid (key-id) from claims; absent → None
        kid_val = raw.get("kid")
        claims = LicenseClaims(
            schema=str(raw.get("schema") or ""),
            license_id=str(raw["license_id"]),
            customer_id=str(raw["customer_id"]),
            seats=int(raw["seats"]),
            entitlements=list(raw.get("entitlements") or []),
            valid_from=_parse_dt(str(raw["valid_from"])),
            valid_to=_parse_dt(str(raw["valid_to"])),
            grace_days=int(raw.get("grace_days") or 0),
            raw=raw,
            kid=str(kid_val) if kid_val is not None else None,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise LicenseVerifyError(f"Incomplete claims: {exc}") from exc

    if claims.schema != "ragsuite.license.v1":
        raise LicenseVerifyError(f"Unsupported schema: {claims.schema}")

    if require_valid_window and not claims.is_valid_now(now):
        raise LicenseExpiredError("License expired past grace window")

    return claims


def has_entitlement(claims: LicenseClaims, key: str) -> bool:
    return key in claims.entitlements


def has_any_entitlement(claims: LicenseClaims, keys: Sequence[str]) -> bool:
    return any(k in claims.entitlements for k in keys)
