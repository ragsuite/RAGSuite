"""Soft shim — implementation in EE `sso` Extension."""
from __future__ import annotations

try:
    from ragsuite_modules.sso.backend.sso_lib.state: import *  # noqa: F403
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "sso Extension not attached; set RAGSUITE_EE_ROOT to enable SSO"
    ) from exc
