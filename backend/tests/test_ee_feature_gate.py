"""Enterprise assistant/MCP answers stay locked without a verified key and module."""
from __future__ import annotations

import pytest

from app.platform.ee_feature_gate import enterprise_feature_denial
from app.platform.license_state import reset_license_cache
from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()


@pytest.fixture(autouse=True)
def _no_license(monkeypatch, tmp_path):
    monkeypatch.setenv("RAGSUITE_LICENSE_FILE", str(tmp_path / "missing.key"))
    reset_license_cache()
    yield
    reset_license_cache()


def test_analytics_denied_without_license_and_has_no_figures():
    denied = enterprise_feature_denial("analytics")
    assert denied is not None
    assert denied["enterprise_locked"] is True
    assert "Enterprise" in denied["message"]
    assert "query_log_count" not in denied
    assert "avg_p95_latency_ms" not in denied


def test_unknown_feature_cannot_be_opened():
    denied = enterprise_feature_denial("not_a_real_module")
    assert denied is not None
    assert denied["enterprise_locked"] is True


def test_entitlement_alone_does_not_unlock_without_module(monkeypatch):
    monkeypatch.setattr(
        "app.platform.entitlement_deps.has_feature_entitlement",
        lambda *features: True,
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate._module_loaded",
        lambda module_id: False,
    )
    denied = enterprise_feature_denial("analytics")
    assert denied is not None
    assert "query_log_count" not in denied


def test_verified_key_and_loaded_module_allow(monkeypatch):
    monkeypatch.setattr(
        "app.platform.entitlement_deps.has_feature_entitlement",
        lambda *features: True,
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate._module_loaded",
        lambda module_id: module_id == "analytics",
    )
    assert enterprise_feature_denial("analytics") is None


def test_overview_metrics_does_not_read_the_database_when_locked():
    from ragsuite_modules.ai_assistant.backend.tools import tool_overview_metrics

    class _Boom:
        def query(self, *args, **kwargs):
            raise AssertionError("database must not be queried when analytics is locked")

    result = tool_overview_metrics(_Boom(), None, {"days": 7})
    assert result["enterprise_locked"] is True
    assert "query_log_count" not in result


def test_presenter_hides_figures_when_locked():
    from ragsuite_modules.ai_assistant.backend.tools import present_tool_result

    presented = present_tool_result(
        "overview_metrics",
        {
            "enterprise_locked": True,
            "feature": "analytics",
            "message": "Advanced analytics is an Enterprise feature.",
            "query_log_count": 99,
        },
    )
    blob = str(presented)
    assert "99" not in blob
    assert "Enterprise" in blob
