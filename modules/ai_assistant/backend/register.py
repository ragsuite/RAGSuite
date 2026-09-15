"""Register ai_assistant module with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="ai_assistant")
    ctx.declare_permissions(["ai_assistant:use", "ai_assistant:settings"])
    ctx.declare_navigation(
        [{"route": "ai-assistant", "labelKey": "nav.ai-assistant", "section": "application"}]
    )
    ctx.declare_migrations(
        ["ai_assistant_settings", "ai_assistant_sessions", "ai_assistant_messages"]
    )
