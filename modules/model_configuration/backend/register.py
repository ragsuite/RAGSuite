"""Register model_configuration CE module."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="model_configuration")
    ctx.declare_permissions(["chatbot:settings", "search:settings"])
    ctx.declare_navigation(
        [
            {
                "route": "model-configuration",
                "labelKey": "nav.model-configuration",
                "section": "application",
            }
        ]
    )
    ctx.declare_migrations(["project_model_providers"])
