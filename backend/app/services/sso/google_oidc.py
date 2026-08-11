"""Soft shim — implementation in EE `sso` Extension."""
from __future__ import annotations

try:
    from ragsuite_modules.sso.backend.sso_lib.google_oidc import *  # noqa: F403
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "SSO requires RAGSuite Enterprise"
    ) from exc
