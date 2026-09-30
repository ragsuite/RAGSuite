"""Register the AI Voice Pilot module (id ``ai_voice_pilot``) with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router as voice_pilot_router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(voice_pilot_router, name="ai_voice_pilot")
    ctx.declare_permissions(["ai_voice_pilot:use", "voice_pilot:use", "voice_pilot:settings"])
    ctx.declare_navigation(
        [{"route": "ai-voice-pilot", "labelKey": "nav.ai-voice-pilot", "section": "application"}]
    )
    ctx.declare_migrations(["voice_pilot_settings"])
