"""CLI-facing license status JSON (``python -m app.platform.license_cli``)."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Optional

from app.platform.license_state import license_status, reset_license_cache
from app.platform.module_loader import skipped_extensions


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="RAGSuite offline license status")
    parser.add_argument(
        "command",
        nargs="?",
        default="status",
        choices=["status", "verify"],
        help="status|verify (same output)",
    )
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args(argv)

    reset_license_cache()
    st = license_status(force=True)
    payload = st.to_dict()
    payload["skipped_extensions"] = skipped_extensions()
    if args.pretty:
        json.dump(payload, sys.stdout, indent=2, sort_keys=True)
    else:
        json.dump(payload, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    # Non-zero only for invalid signature (operator signal); absent/expired still 0
    if st.state == "invalid":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
