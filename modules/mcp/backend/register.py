"""Register mcp module with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router
from .server import mount_mcp


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="mcp_setup")
    mount_mcp(ctx.app)
