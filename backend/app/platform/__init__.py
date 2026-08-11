"""
Platform spine (ADR-001 / Phase 2).

Feature routers and services depend on Platform — not the reverse.
Public imports may still use ``app.auth``, ``app.db``, ``app.settings`` shims.

Import ``create_app`` from ``app.platform.app_factory`` (or ``app.main``) to avoid
circular imports when loading spine modules (auth/db/settings).
"""

__all__ = ["create_app"]


def __getattr__(name: str):
    if name == "create_app":
        from app.platform.app_factory import create_app

        return create_app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
