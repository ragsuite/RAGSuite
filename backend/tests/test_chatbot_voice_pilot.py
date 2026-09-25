"""Chatbot Voice Pilot widget config + bootstrap helpers."""
from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.platform.module_bootstrap import ensure_ragsuite_modules_path
import os
from pathlib import Path


def _require_ee():
    ee_root = Path(os.environ.get("RAGSUITE_EE_ROOT") or "/Users/arun/RAGSUITE_EE") / "modules"
    if not ee_root.is_dir():
        pytest.skip("RAGSUITE_EE modules not available")
    ensure_ragsuite_modules_path(ee_root)
    return ee_root


def test_widget_customization_defaults_include_voice_pilot_fields():
    from app.schemas import WidgetCustomizationOut

    out = WidgetCustomizationOut(
        widget_avatar="default-1",
        widget_avatar_size=38,
        widget_chatbot_color="#1F2937",
        widget_background_color="#1a1a1a",
        widget_text_color="#ffffff",
        widget_show_logo=True,
        widget_show_date_time=True,
        widget_bottom_space=15,
        widget_font_size=14,
        widget_trigger_border_radius=50,
        widget_position="bottom-right",
        widget_z_index=50,
        widget_offset_x=0,
        widget_offset_y=0,
    )
    assert out.widget_voice_pilot_enabled is False
    assert out.widget_voice_pilot_provider == "elevenlabs"
    assert out.widget_voice_pilot_orb_name is None


def test_resolve_chatbot_voice_pilot_provider_disabled():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.widget_context import (
        resolve_chatbot_voice_pilot_provider,
    )

    class FakeQuery:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return SimpleNamespace(
                widget_voice_pilot_enabled=False,
                widget_voice_pilot_provider="elevenlabs",
            )

    class FakeDb:
        def query(self, *args, **kwargs):
            return FakeQuery()

    with pytest.raises(HTTPException) as exc:
        resolve_chatbot_voice_pilot_provider(
            FakeDb(),  # type: ignore[arg-type]
            project_id=uuid4(),
            settings_user_id=1,
        )
    assert exc.value.status_code == 404


def test_resolve_chatbot_voice_pilot_provider_custom():
    _require_ee()
    from ragsuite_modules.ai_voice_pilot.backend.widget_context import (
        resolve_chatbot_voice_pilot_provider,
    )

    class FakeQuery:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return SimpleNamespace(
                widget_voice_pilot_enabled=True,
                widget_voice_pilot_provider="custom",
            )

    class FakeDb:
        def query(self, *args, **kwargs):
            return FakeQuery()

    provider, row = resolve_chatbot_voice_pilot_provider(
        FakeDb(),  # type: ignore[arg-type]
        project_id=uuid4(),
        settings_user_id=1,
    )
    assert provider == "custom"
    assert row.widget_voice_pilot_enabled is True
