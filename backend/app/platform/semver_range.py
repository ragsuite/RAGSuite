"""SemVer range helpers for bundle platform_compat (Phase 7)."""
from __future__ import annotations

import re
from typing import List, Tuple


_VER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def parse_version(v: str) -> Tuple[int, int, int]:
    m = _VER_RE.match(v.strip())
    if not m:
        raise ValueError(f"Invalid semver: {v!r}")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def _cmp(a: Tuple[int, int, int], b: Tuple[int, int, int]) -> int:
    return (a > b) - (a < b)


def satisfies(version: str, range_expr: str) -> bool:
    """Support simple ranges like ``>=0.1.0 <2.0.0`` (space-separated clauses)."""
    ver = parse_version(version)
    parts = range_expr.strip().split()
    if not parts:
        return True
    for part in parts:
        part = part.strip()
        if part.startswith(">="):
            if _cmp(ver, parse_version(part[2:])) < 0:
                return False
        elif part.startswith("<="):
            if _cmp(ver, parse_version(part[2:])) > 0:
                return False
        elif part.startswith(">"):
            if _cmp(ver, parse_version(part[1:])) <= 0:
                return False
        elif part.startswith("<"):
            if _cmp(ver, parse_version(part[1:])) >= 0:
                return False
        elif part.startswith("=="):
            if ver != parse_version(part[2:]):
                return False
        elif _VER_RE.match(part):
            if ver != parse_version(part):
                return False
        else:
            raise ValueError(f"Unsupported range token: {part!r}")
    return True
