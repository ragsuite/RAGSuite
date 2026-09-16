"""Register system_health module with Platform."""
from __future__ import annotations

from app.platform.cli_hooks import register_hook
from app.platform.module_context import ModuleContext

from .assistant_snapshot import collect_assistant_snapshot
from .routes import health_router

# Stable hook name for AI Assistant (and any future Platform consumers).
ASSISTANT_SNAPSHOT_HOOK = "system_health.assistant_snapshot"


def register(ctx: ModuleContext) -> None:
    ctx.register_router(health_router, name="system_health")
    ctx.declare_permissions(["system_health:read"])
    ctx.declare_navigation(
        [{"route": "system-health", "labelKey": "settings.system-health", "section": "management"}]
    )
    register_hook(ASSISTANT_SNAPSHOT_HOOK, collect_assistant_snapshot)
