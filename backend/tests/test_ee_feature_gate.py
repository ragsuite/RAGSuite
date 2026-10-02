"""Enterprise assistant/MCP answers stay locked without a verified key and module."""
from __future__ import annotations

import pytest

from app.platform.ee_feature_gate import can_use_white_label, enterprise_feature_denial
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


def test_can_use_white_label_false_when_denied(monkeypatch):
    monkeypatch.setattr(
        "app.platform.ee_feature_gate.enterprise_feature_denial",
        lambda module_id: {
            "enterprise_locked": True,
            "feature": "white_label",
            "message": "locked",
        },
    )
    assert can_use_white_label() is False


def test_can_use_white_label_true_when_denial_none(monkeypatch):
    monkeypatch.setattr(
        "app.platform.ee_feature_gate.enterprise_feature_denial",
        lambda module_id: None,
    )
    assert can_use_white_label() is True


def test_can_use_white_label_requires_module_not_license_alone(monkeypatch):
    monkeypatch.setattr(
        "app.platform.entitlement_deps.has_feature_entitlement",
        lambda *features: True,
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate._module_loaded",
        lambda module_id: False,
    )
    assert can_use_white_label() is False


def test_can_use_white_label_when_entitled_and_module_loaded(monkeypatch):
    monkeypatch.setattr(
        "app.platform.entitlement_deps.has_feature_entitlement",
        lambda *features: True,
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate._module_loaded",
        lambda module_id: module_id == "white_label",
    )
    assert can_use_white_label() is True


def test_can_use_enterprise_edition_false_without_license(monkeypatch):
    from app.platform.ee_feature_gate import can_use_enterprise_edition

    monkeypatch.setattr("app.platform.license_state.get_claims", lambda: None)
    assert can_use_enterprise_edition() is False


def test_can_use_enterprise_edition_false_with_license_without_module(monkeypatch):
    from app.platform.ee_feature_gate import can_use_enterprise_edition

    monkeypatch.setattr(
        "app.platform.license_state.get_claims",
        lambda: object(),
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate.enterprise_module_loaded",
        lambda module_id: False,
    )
    assert can_use_enterprise_edition() is False


def test_can_use_enterprise_edition_true_with_license_and_module(monkeypatch):
    from app.platform.ee_feature_gate import can_use_enterprise_edition

    monkeypatch.setattr(
        "app.platform.license_state.get_claims",
        lambda: object(),
    )
    monkeypatch.setattr(
        "app.platform.ee_feature_gate.enterprise_module_loaded",
        lambda module_id: module_id == "analytics",
    )
    assert can_use_enterprise_edition() is True


@pytest.fixture
def extra_module_root(monkeypatch, tmp_path):
    """Append *tmp_path* to the ``ragsuite_modules`` namespace like an EE/stub root."""
    import importlib
    import sys

    pkg = sys.modules["ragsuite_modules"]
    monkeypatch.setattr(pkg, "__path__", [*pkg.__path__, str(tmp_path)])
    monkeypatch.setattr("app.platform.module_loader.loaded_module_ids", lambda: [])
    importlib.invalidate_caches()
    return tmp_path


def test_ce_frontend_stub_is_not_an_installed_module(extra_module_root):
    from app.platform.ee_feature_gate import enterprise_module_loaded

    stub = extra_module_root / "gate_stub_mod" / "frontend"
    stub.mkdir(parents=True)
    (stub / "index.tsx").write_text("export {};\n")

    assert enterprise_module_loaded("gate_stub_mod") is False


def test_real_backend_package_counts_as_installed(extra_module_root):
    from app.platform.ee_feature_gate import enterprise_module_loaded

    backend = extra_module_root / "gate_real_mod" / "backend"
    backend.mkdir(parents=True)
    (backend / "__init__.py").write_text("")

    assert enterprise_module_loaded("gate_real_mod") is True


def test_registered_module_counts_as_installed(monkeypatch):
    from app.platform.ee_feature_gate import enterprise_module_loaded

    monkeypatch.setattr("app.platform.module_loader.loaded_module_ids", lambda: ["gate_loaded_mod"])
    assert enterprise_module_loaded("gate_loaded_mod") is True
    assert enterprise_module_loaded("") is False


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
            "message": "The full Dashboard is an Enterprise feature.",
            "query_log_count": 99,
        },
    )
    blob = str(presented)
    assert "99" not in blob
    assert "Enterprise" in blob
