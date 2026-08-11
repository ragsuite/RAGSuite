"""Monotonic server-time guard (H7).

Persists the highest server_time seen from the license server so that rolling the
system clock backward cannot re-enable an expired license or defeat replay detection.

Storage: ``~/.ragsuite/monotonic.json`` or ``$RAGSUITE_DATA_DIR/monotonic.json``.

Usage::

    # When a license-server response includes server_time:
    from app.platform.license_monotonic import record_server_time
    record_server_time(plan_response["server_time"])

    # In EE load path (called from extension_loader):
    from app.platform.license_monotonic import assert_clock_sane
    assert_clock_sane()  # raises RuntimeError if now < max_server_time - 24h
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Union

logger = logging.getLogger(__name__)

_MONOTONIC_FILENAME = "monotonic.json"
_CLOCK_TOLERANCE_HOURS = 24  # How far back the wall clock is allowed to lag


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def _monotonic_path() -> Path:
    """Resolve storage path, preferring ``RAGSUITE_DATA_DIR`` then ``~/.ragsuite``."""
    base_env = os.environ.get("RAGSUITE_DATA_DIR", "").strip()
    base = Path(base_env).expanduser().resolve() if base_env else Path.home() / ".ragsuite"
    p = base / _MONOTONIC_FILENAME
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return p


def _load_max_server_time() -> Optional[datetime]:
    """Read the stored max_server_time; returns None if absent or unreadable."""
    try:
        p = _monotonic_path()
        if p.is_file():
            data = json.loads(p.read_text(encoding="utf-8"))
            raw = data.get("max_server_time")
            if raw:
                dt = datetime.fromisoformat(str(raw))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def _write_max_server_time(dt: datetime) -> None:
    p = _monotonic_path()
    try:
        p.write_text(
            json.dumps({"max_server_time": dt.isoformat()}, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("license_monotonic: could not write %s: %s", p, exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def record_server_time(iso_or_dt: Union[str, datetime]) -> None:
    """Update the stored max_server_time if *iso_or_dt* is later than the stored value.

    Call this whenever a license-server response includes a ``server_time`` field.
    Accepts ISO-8601 strings (with or without trailing ``Z``) or ``datetime`` objects.
    Silently ignores parse errors.
    """
    if isinstance(iso_or_dt, str):
        raw = iso_or_dt
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt: datetime = datetime.fromisoformat(raw)
        except ValueError:
            logger.warning(
                "license_monotonic: invalid server_time %r — not recorded", iso_or_dt
            )
            return
    else:
        dt = iso_or_dt

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    current = _load_max_server_time()
    if current is not None and dt <= current:
        return  # not newer — no update

    _write_max_server_time(dt)
    logger.debug("license_monotonic: max_server_time updated → %s", dt.isoformat())


def assert_clock_sane(*, tolerance_hours: int = _CLOCK_TOLERANCE_HOURS) -> None:
    """Raise RuntimeError if the system clock appears to have rolled back.

    Compares ``datetime.now(utc)`` against the stored ``max_server_time``.
    Tolerance window: ``tolerance_hours`` (default 24 h) to accommodate NTP
    drift, brief offline periods, and timezone changes.

    If no max_server_time has been recorded yet (first run), this passes silently.
    """
    max_t = _load_max_server_time()
    if max_t is None:
        return  # first run — nothing to compare against

    now = datetime.now(timezone.utc)
    earliest_allowed = max_t - timedelta(hours=tolerance_hours)

    if now < earliest_allowed:
        raise RuntimeError(
            f"System clock appears to have rolled back. "
            f"now={now.isoformat()}, max_server_time={max_t.isoformat()}, "
            f"tolerance={tolerance_hours}h. "
            "EE modules will not load until the system clock is corrected. "
            "Contact your system administrator. "
            f"(Monotonic record: {_monotonic_path()})"
        )
