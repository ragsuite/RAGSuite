"""Encrypted EE bundle install support — P4 client-side.

Customers who receive an ``.encbundle`` file (AES-256-GCM encrypted tar) together
with a signed ``manifest.enc.json`` use this module to decrypt and install.

Key derivation: HKDF-SHA256
    salt  = b"ragsuite-ee-kek-v1"
    IKM   = SHA-256(offline_key_blob as UTF-8)
    info  = "<license_id>|<version>" as UTF-8
    len   = 32 bytes

Encrypted file format: 12-byte nonce || AES-GCM ciphertext+16-byte tag

CLI activate path accepts ``.encbundle`` extension via ``install_encbundle``.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_HKDF_SALT = b"ragsuite-ee-kek-v1"
_NONCE_LEN = 12
_TAG_LEN = 16


# ---------------------------------------------------------------------------
# Key derivation
# ---------------------------------------------------------------------------

def derive_kek(offline_key_blob: str, license_id: str, version: str) -> bytes:
    """Derive a 32-byte Key-Encryption-Key via HKDF-SHA256.

    IKM is the SHA-256 of the UTF-8 offline_key_blob so that the raw blob
    bytes (which contain base64url) are normalised to a fixed-length input.
    """
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    ikm = hashlib.sha256(offline_key_blob.encode("utf-8")).digest()
    info = f"{license_id}|{version}".encode("utf-8")
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_HKDF_SALT,
        info=info,
    )
    return hkdf.derive(ikm)


# ---------------------------------------------------------------------------
# AES-256-GCM decrypt
# ---------------------------------------------------------------------------

def decrypt_encbundle(enc_path: Path, kek: bytes, out_path: Path) -> None:
    """Decrypt *enc_path* (nonce||ciphertext+tag) with *kek* into *out_path*.

    Raises ``ValueError`` on authentication failure or malformed input.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    data = enc_path.read_bytes()
    min_len = _NONCE_LEN + _TAG_LEN + 1  # nonce + tag + at least 1 byte of content
    if len(data) < min_len:
        raise ValueError(
            f"Encrypted bundle too short ({len(data)} bytes); expected ≥{min_len}"
        )

    nonce = data[:_NONCE_LEN]
    ciphertext_and_tag = data[_NONCE_LEN:]
    aesgcm = AESGCM(kek)
    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext_and_tag, None)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"AES-256-GCM decryption/authentication failed: {exc}") from exc

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(plaintext)
    logger.debug(
        "decrypt_encbundle: decrypted %d → %d bytes at %s",
        len(data),
        len(plaintext),
        out_path,
    )


# ---------------------------------------------------------------------------
# Manifest signature verification
# ---------------------------------------------------------------------------

def _verify_manifest_signature(manifest: dict) -> None:
    """Verify Ed25519 signature over manifest['payload'] using vendor public key."""
    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    from app.platform.license_state import ensure_vendor_on_path

    ensure_vendor_on_path()
    from ragsuite_license_verify.verify import default_public_key_pem  # type: ignore

    sig_b64 = manifest.get("signature")
    payload = manifest.get("payload")
    if not sig_b64 or not payload:
        raise ValueError(
            "manifest.enc.json must contain both 'signature' and 'payload' fields"
        )

    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    pad = "=" * (-len(sig_b64) % 4)
    sig = base64.urlsafe_b64decode(sig_b64 + pad)

    pem = default_public_key_pem()
    pub = serialization.load_pem_public_key(pem)
    if not isinstance(pub, Ed25519PublicKey):
        raise ValueError("Vendor public key must be Ed25519")
    try:
        pub.verify(sig, payload_bytes)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Encrypted bundle manifest signature invalid: {exc}") from exc


# ---------------------------------------------------------------------------
# High-level install helper
# ---------------------------------------------------------------------------

def install_encbundle(
    enc_path: Path,
    offline_key_blob: str,
    *,
    manifest_path: Optional[Path] = None,
    platform_version: Optional[str] = None,
    skip_compat: bool = False,
) -> Path:
    """Decrypt, verify, and install an encrypted EE bundle (``.encbundle``).

    Steps:
    1. Verify signed ``manifest.enc.json``.
    2. Derive KEK from offline key + license_id + version (HKDF-SHA256).
    3. Decrypt to a tmpfs-preferred temporary directory.
    4. Verify inner sha256 of decrypted tar (if provided in manifest payload).
    5. Call ``install_bundle`` on the decrypted tar.
    6. Securely wipe the temp directory.

    Returns the installed bundle target directory path.
    """
    from app.platform.bundle_install import install_bundle
    from app.platform.version import PLATFORM_VERSION

    enc_path = enc_path.expanduser().resolve()

    if manifest_path is None:
        # Try <bundle>.enc.json or sibling manifest.enc.json
        candidate = enc_path.with_suffix("").with_suffix(".enc.json")
        if candidate.is_file():
            manifest_path = candidate
        else:
            candidate2 = enc_path.parent / "manifest.enc.json"
            if candidate2.is_file():
                manifest_path = candidate2
            else:
                raise FileNotFoundError(
                    f"Encrypted bundle manifest not found. "
                    f"Expected {candidate} or {candidate2}."
                )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    _verify_manifest_signature(manifest)

    payload = manifest["payload"]
    license_id = str(payload["license_id"])
    version = str(payload["version"])
    inner_sha256: str = str(payload.get("sha256") or payload.get("inner_sha256") or "")

    kek = derive_kek(offline_key_blob, license_id, version)

    # Prefer tmpfs for security-sensitive decrypt
    tmp_dir = _make_secure_tmpdir()
    try:
        plain_tar = tmp_dir / f"ragsuite-ee-{version}.tar.gz"
        decrypt_encbundle(enc_path, kek, plain_tar)

        if inner_sha256:
            actual = hashlib.sha256(plain_tar.read_bytes()).hexdigest()
            if actual != inner_sha256:
                raise RuntimeError(
                    f"Decrypted bundle sha256 mismatch "
                    f"(actual={actual!r}, expected={inner_sha256!r}). "
                    "The encrypted bundle may have been corrupted."
                )

        pv = platform_version or PLATFORM_VERSION
        target = install_bundle(
            plain_tar,
            platform_version=pv,
            skip_compat=skip_compat,
            require_license=True,
        )
        logger.info("install_encbundle: installed EE v%s → %s", version, target)
        return target
    finally:
        _wipe_tmpdir(tmp_dir)


def _make_secure_tmpdir() -> Path:
    """Create a temp directory, preferring /dev/shm or /run/shm (tmpfs)."""
    tmpfs_candidates = ["/dev/shm", "/run/shm"]
    for td in tmpfs_candidates:
        if os.path.isdir(td) and os.access(td, os.W_OK):
            try:
                return Path(tempfile.mkdtemp(prefix="ragsuite-enc-", dir=td))
            except OSError:
                continue
    return Path(tempfile.mkdtemp(prefix="ragsuite-enc-"))


def _wipe_tmpdir(tmp_dir: Path) -> None:
    """Best-effort overwrite + delete of decrypted temp files."""
    try:
        for p in tmp_dir.rglob("*"):
            if p.is_file():
                try:
                    size = p.stat().st_size
                    with p.open("wb") as fh:
                        fh.write(b"\x00" * size)
                except OSError:
                    pass
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass
