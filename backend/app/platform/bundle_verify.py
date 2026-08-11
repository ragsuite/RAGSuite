"""Verify an Enterprise bundle directory or archive (Phase 7)."""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

from app.platform.bundle_checksums import verify_checksums
from app.platform.bundle_install import resolve_bundle_dir
from app.platform.bundle_signature import verify_bundle_signature
from app.platform.semver_range import satisfies
from app.platform.version import PLATFORM_VERSION


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify RAGSuite Enterprise bundle")
    parser.add_argument("source", type=Path)
    parser.add_argument("--platform-version", default=PLATFORM_VERSION)
    args = parser.parse_args(argv)

    try:
        root = resolve_bundle_dir(args.source)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    ok, errors = verify_checksums(root)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    print(f"bundle id={manifest.get('id')} version={manifest.get('version')}")
    print(f"modules={[m.get('id') for m in manifest.get('modules') or []]}")
    print(f"platform_compat={manifest.get('platform_compat')}")
    print(f"signature_slot={manifest.get('signature')!r}")

    sig_ok, sig_msg = verify_bundle_signature(root)
    print(f"signature: {sig_msg}")
    if not sig_ok:
        ok = False
        errors.append(sig_msg)

    compat = str(manifest.get("platform_compat") or "")
    if compat:
        if satisfies(args.platform_version, compat):
            print(f"platform_compat: OK for {args.platform_version}")
        else:
            print(f"platform_compat: FAIL for {args.platform_version}", file=sys.stderr)
            ok = False
            errors.append("platform_compat mismatch")

    if not ok:
        print("VERIFY FAIL", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 2
    print("VERIFY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
