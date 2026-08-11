"""Soft shim — compare profile resolution lives in EE ``compare_models``."""
from __future__ import annotations

try:
    from ragsuite_modules.compare_models.backend.compare_profiles import *  # noqa: F403
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "Multi-model compare requires RAGSuite Enterprise"
    ) from exc
