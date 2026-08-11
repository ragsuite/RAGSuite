"""Helpers for CSV exports (formula-injection safety)."""
from __future__ import annotations

from typing import Any, Optional


def sanitize_csv_cell(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).replace("\r\n", "\n").replace("\r", "\n")
    if s and s[0] in "=-+@\t":
        return "'" + s
    return s


def optional_int_str(val: Optional[int]) -> str:
    if val is None:
        return ""
    return str(int(val))
