"""Partial update semantics for widget logo/avatar on customization save."""
from types import SimpleNamespace

from pydantic import TypeAdapter

from app.schemas import WidgetCustomizationCreate


def test_widget_logo_url_absent_vs_null_in_fields_set():
    omitted = TypeAdapter(WidgetCustomizationCreate).validate_python(
        {"widget_chatbot_color": "#111111"}
    )
    assert "widget_logo_url" not in omitted.model_fields_set
    assert omitted.widget_logo_url is None

    cleared = TypeAdapter(WidgetCustomizationCreate).validate_python(
        {"widget_logo_url": None, "widget_chatbot_color": "#111111"}
    )
    assert "widget_logo_url" in cleared.model_fields_set
    assert cleared.widget_logo_url is None

    set_logo = TypeAdapter(WidgetCustomizationCreate).validate_python(
        {"widget_logo_url": "data:image/png;base64,abc"}
    )
    assert "widget_logo_url" in set_logo.model_fields_set
    assert set_logo.widget_logo_url == "data:image/png;base64,abc"


def test_chatbot_settings_column_cache_reuses_names(monkeypatch):
    from app.routes import chatbot as chatbot_routes

    chatbot_routes._CHATBOT_SETTINGS_COLUMN_CACHE = None
    calls = {"n": 0}

    class FakeInspector:
        def get_columns(self, table):
            calls["n"] += 1
            assert table == "chatbot_settings"
            return [{"name": "id"}, {"name": "widget_logo_url"}]

    monkeypatch.setattr(
        chatbot_routes,
        "sa_inspect",
        lambda _bind: FakeInspector(),
    )

    db = SimpleNamespace(bind=object())
    first = chatbot_routes._chatbot_settings_column_names(db)
    second = chatbot_routes._chatbot_settings_column_names(db)
    assert first == {"id", "widget_logo_url"}
    assert second is first
    assert calls["n"] == 1

    chatbot_routes._CHATBOT_SETTINGS_COLUMN_CACHE = None
