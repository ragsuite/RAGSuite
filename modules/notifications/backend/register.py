"""Register notifications module with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="notifications")
    ctx.declare_navigation(
        [{"route": "notifications", "labelKey": "notifications.title", "section": "application"}]
    )
