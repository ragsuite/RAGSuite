"""Soft shim — dashboard builders live in EE Extension ``analytics``."""
from __future__ import annotations

try:
    from ragsuite_modules.analytics.backend.dashboard import *  # noqa: F403
except ImportError:
    def build_analytics_dashboard_data(*_a, **_k):
        raise RuntimeError("Advanced analytics require RAGSuite Enterprise")
