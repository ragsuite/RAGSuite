"""Optional Ed25519 signature over CHECKSUMS.sha256 (Phase 10).

Production / customer installs: non-empty signature required (fail closed).
Lab / unsigned DX: set RAGSUITE_ALLOW_UNSIGNED_BUNDLE=1 or pass allow_unsigned=True.
"""
from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Optional, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

logger = logging.getLogger(__name__)


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _load_public_pem() -> bytes:
    from app.platform.license_state import ensure_vendor_on_path

    ensure_vendor_on_path()
    from ragsuite_license_verify.verify import default_public_key_pem

    return default_public_key_pem()


def verify_bundle_signature(
    bundle_root: Path,
    *,
    public_key_pem: Optional[bytes] = None,
    allow_unsigned: Optional[bool] = None,
) -> Tuple[bool, str]:
    """Return (ok, message). Missing/empty signature fails unless allow_unsigned."""
    from app.platform.ee_guard import allow_unsigned_bundle

    sig_path = bundle_root / "signature"
    checksums = bundle_root / "CHECKSUMS.sha256"
    if not checksums.is_file():
        return False, "CHECKSUMS.sha256 missing"

    unsigned_ok = allow_unsigned_bundle() if allow_unsigned is None else bool(allow_unsigned)

    if not sig_path.is_file():
        msg = "signature file missing"
        if unsigned_ok:
            logger.warning("bundle_signature: %s — checksum-only (ALLOW_UNSIGNED)", msg)
            return True, msg + " — checksum-only (allow_unsigned)"
        return False, msg + " — vendor-signed EE bundle required"

    raw = sig_path.read_bytes().strip()
    if not raw:
        msg = "signature empty"
        if unsigned_ok:
            logger.warning("bundle_signature: %s — checksum-only (ALLOW_UNSIGNED)", msg)
            return True, msg + " — checksum-only (allow_unsigned)"
        return False, msg + " — vendor-signed EE bundle required"

    try:
        # Accept raw 64-byte sig or base64url text
        if len(raw) == 64:
            sig = raw
        else:
            sig = _b64url_decode(raw.decode("ascii").strip())
    except Exception as exc:  # noqa: BLE001
        return False, f"invalid signature encoding: {exc}"

    pem = public_key_pem if public_key_pem is not None else _load_public_pem()
    pub = serialization.load_pem_public_key(pem)
    if not isinstance(pub, Ed25519PublicKey):
        return False, "public key must be Ed25519"
    try:
        pub.verify(sig, checksums.read_bytes())
    except Exception as exc:  # noqa: BLE001
        return False, f"signature verification failed: {exc}"
    return True, "signature OK"
