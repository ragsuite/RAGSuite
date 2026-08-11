"""Register system_health module with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import health_router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(health_router, name="system_health")
    ctx.declare_permissions(["system_health:read"])
    ctx.declare_navigation(
        [{"route": "system-health", "labelKey": "settings.system-health", "section": "management"}]
    )
