"""Tests for system footer env + EE white-label hybrid helpers."""

from unittest.mock import patch

from app.routes import settings as settings_routes


def test_effective_show_when_env_unset_even_if_hide_allowed():
    with patch.dict(settings_routes.os.environ, {}, clear=False):
        settings_routes.os.environ.pop("SHOW_SYSTEM_FOOTER", None)
        with patch.object(settings_routes, "_can_hide_system_footer", return_value=True):
            assert settings_routes.effective_show_system_footer() is True


def test_effective_show_when_env_unset_ignores_settings_field_false():
    """Flipping the Pydantic default alone must not hide the footer."""
    with patch.dict(settings_routes.os.environ, {}, clear=False):
        settings_routes.os.environ.pop("SHOW_SYSTEM_FOOTER", None)
        with patch.object(settings_routes.app_settings, "show_system_footer", False):
            with patch.object(settings_routes, "_can_hide_system_footer", return_value=True):
                assert settings_routes.effective_show_system_footer() is True


def test_effective_show_when_env_false_without_ee_white_label():
    """CE / EE root commented → module not loaded → force show."""
    with patch.dict(settings_routes.os.environ, {"SHOW_SYSTEM_FOOTER": "false"}, clear=False):
        with patch.object(settings_routes, "_can_hide_system_footer", return_value=False):
            assert settings_routes.effective_show_system_footer() is True


def test_effective_hide_when_env_false_with_ee_white_label():
    with patch.dict(settings_routes.os.environ, {"SHOW_SYSTEM_FOOTER": "false"}, clear=False):
        with patch.object(settings_routes, "_can_hide_system_footer", return_value=True):
            assert settings_routes.effective_show_system_footer() is False


def test_effective_show_when_env_true_with_ee_white_label():
    with patch.dict(settings_routes.os.environ, {"SHOW_SYSTEM_FOOTER": "true"}, clear=False):
        with patch.object(settings_routes, "_can_hide_system_footer", return_value=True):
            assert settings_routes.effective_show_system_footer() is True


def test_can_hide_requires_module_loaded_not_license_alone():
    """License entitlement without loaded white_label module → cannot hide (CE mode)."""
    with patch(
        "app.platform.entitlement_deps.has_feature_entitlement",
        return_value=True,
    ):
        with patch(
            "app.platform.ee_feature_gate._module_loaded",
            return_value=False,
        ):
            assert settings_routes._can_hide_system_footer() is False


def test_can_hide_when_entitled_and_module_loaded():
    with patch(
        "app.platform.ee_feature_gate.enterprise_feature_denial",
        return_value=None,
    ):
        assert settings_routes._can_hide_system_footer() is True


def test_explicit_env_parser_blank_is_unset():
    with patch.dict(settings_routes.os.environ, {"SHOW_SYSTEM_FOOTER": "  "}, clear=False):
        assert settings_routes._explicit_show_system_footer_env() is None


def test_system_footer_response_uses_effective_flag():
    with patch.object(settings_routes, "effective_show_system_footer", return_value=False):
        out = settings_routes._system_footer_response()
    assert out.show_system_footer is False
