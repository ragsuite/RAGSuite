"""Boot-time re-verification of an installed EE bundle tree (H6).

Reads CHECKSUMS.sha256 from the bundle root and re-hashes every listed file.
Raises RuntimeError on any mismatch or missing file — caller must prevent EE load.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.platform.bundle_checksums import iter_payload_files, read_checksums, sha256_file

logger = logging.getLogger(__name__)


def verify_installed_tree(bundle_dir: Path) -> None:
    """Re-hash every file listed in CHECKSUMS.sha256; raise on mismatch or missing.

    ``bundle_dir`` is the installed bundle root — the directory that contains
    ``manifest.json``, ``CHECKSUMS.sha256``, ``modules/``, etc.

    This function is called once at extension-loader startup **before** any EE
    Python code is imported, so a tampered install is caught before execution.
    """
    checksums_file = bundle_dir / "CHECKSUMS.sha256"
    if not checksums_file.is_file():
        raise RuntimeError(
            f"Installed EE bundle integrity check failed: "
            f"CHECKSUMS.sha256 missing in {bundle_dir}"
        )

    try:
        expected = read_checksums(checksums_file)
    except ValueError as exc:
        raise RuntimeError(
            f"Installed EE bundle integrity check failed: "
            f"malformed CHECKSUMS.sha256 in {bundle_dir}: {exc}"
        ) from exc

    errors: list[str] = []
    seen: set[str] = set()

    for path in iter_payload_files(bundle_dir):
        rel = path.relative_to(bundle_dir).as_posix()
        seen.add(rel)
        digest = sha256_file(path)
        if rel not in expected:
            errors.append(f"unexpected file (not in CHECKSUMS): {rel}")
        elif expected[rel] != digest:
            errors.append(f"checksum mismatch (tampered?): {rel}")

    for rel in expected:
        if rel not in seen:
            errors.append(f"missing file listed in CHECKSUMS: {rel}")

    if errors:
        shown = errors[:20]
        detail = "\n  ".join(shown)
        if len(errors) > 20:
            detail += f"\n  … and {len(errors) - 20} more"
        raise RuntimeError(
            f"Installed EE bundle integrity check failed ({len(errors)} error(s)):\n"
            f"  {detail}\n"
            "The installed EE bundle may have been tampered with. "
            "Re-install from the vendor-supplied tar archive."
        )

    logger.info(
        "bundle_integrity: verified %d files in installed EE tree %s",
        len(seen),
        bundle_dir,
    )
