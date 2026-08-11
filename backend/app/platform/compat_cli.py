"""CLI-facing compat JSON (``python -m app.platform.compat_cli``)."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Optional

from app.platform.compat import build_compat_report, doctor_should_fail


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="RAGSuite platform compatibility report")
    parser.add_argument("command", nargs="?", default="report", choices=["report"])
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args(argv)

    report = build_compat_report()
    payload = report.to_dict()
    payload["doctor_fail"] = doctor_should_fail(report)
    if args.pretty:
        json.dump(payload, sys.stdout, indent=2, sort_keys=True)
    else:
        json.dump(payload, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    return 1 if doctor_should_fail(report) else 0


if __name__ == "__main__":
    raise SystemExit(main())
